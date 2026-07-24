// Cloudflare Pages Function: 外周セキュリティ点検エンジン（Prevention Lv.1）
// GET /api/security-check?url=https://example.com
// ユーザーが入力したサイトをサーバー側で代理取得し、「外から見えるセキュリティ上の弱点」を
// 公開情報の範囲だけで点検してJSONで返す。（prevention のシミュレーターから呼び出す）
//
// ★ 方針：すべて「公開URLへのGET」のみ。ポートスキャン・認証突破・負荷試験は一切行わない。
//    不正アクセス禁止法の範囲内（ブラウザで普通にページを開くのと同じ行為）に限定する。

const UA = 'Mozilla/5.0 (compatible; PreventionSiteCheck/1.0; +https://aidealize.com)';

export async function onRequestGet(context) {
  const { request } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });

  try {
    const reqUrl = new URL(request.url);
    let raw = (reqUrl.searchParams.get('url') || '').trim();
    if (!raw) return json({ ok: false, error: 'URLを入力してください' }, 400);
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;

    let target;
    try { target = new URL(raw); } catch { return json({ ok: false, error: 'URLの形式が正しくありません' }, 400); }

    // --- SSRF/悪用対策：http(s)のみ・内部/プライベート宛先を拒否 ---
    if (!/^https?:$/.test(target.protocol)) return json({ ok: false, error: '対応していないURLです' }, 400);
    const host = target.hostname.toLowerCase();
    const blocked =
      host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.internal') || host.endsWith('.local') || !host.includes('.');
    if (blocked) return json({ ok: false, error: 'このURLは点検できません' }, 400);

    // --- トップページ取得（タイムアウト・リダイレクト追従）---
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      res = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e.name === 'AbortError'
        ? 'サイトの応答が遅く、8秒以内に取得できませんでした'
        : 'サイトに接続できませんでした（URLをご確認ください）';
      return json({ ok: false, error: msg });
    }
    clearTimeout(timer);

    if (res.status >= 400) {
      return json({ ok: false, error: `サイトがエラー応答を返しました（HTTP ${res.status}）。URLをご確認いただくか、時間をおいてお試しください` });
    }

    const finalUrl = new URL(res.url || target.toString());
    const isHttps = finalUrl.protocol === 'https:';

    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    const buf = ctype.includes('html') ? await readCapped(res, 512 * 1024) : new Uint8Array(0);
    const html = new TextDecoder('utf-8').decode(buf);
    const headHtml = html.slice(0, 200000);

    // --- ヘッダー抽出 ---
    const H = (n) => (res.headers.get(n) || '').trim();
    const hsts    = H('strict-transport-security');
    const xfo     = H('x-frame-options');
    const nosniff = H('x-content-type-options');
    const csp     = H('content-security-policy');
    const server  = H('server');
    const poweredBy = [res.headers.get('x-powered-by')].filter(Boolean).join(' / ').trim();
    // CSP に frame-ancestors があればクリックジャッキング対策とみなす
    const cspFrameAncestors = /frame-ancestors/i.test(csp);

    // --- CMS / バージョンの露出検出 ---
    const generator = pick(headHtml, /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i);
    const looksWordPress = /wp-content|wp-includes|\/wp-json/i.test(html) || /wordpress/i.test(generator);
    let cms = '', cmsVersion = '';
    if (looksWordPress) {
      cms = 'WordPress';
      const m = generator.match(/wordpress[^\d]*(\d+(?:\.\d+)+)/i);
      if (m) cmsVersion = m[1];
    } else if (generator) {
      const gm = generator.match(/^([a-zA-Z][\w\s.-]*?)\s*(\d+(?:\.\d+)+)?$/);
      if (gm) { cms = (gm[1] || '').trim(); cmsVersion = gm[2] || ''; }
    }

    // --- バージョン露出（サーバー/PHP等）---
    const versionLeaks = [];
    if (/\d+\.\d+/.test(server)) versionLeaks.push(`Server: ${server}`);
    if (poweredBy && /\d/.test(poweredBy)) versionLeaks.push(`X-Powered-By: ${poweredBy}`);

    // --- 管理画面（裏口）の露出：公開URLへのGETのみ ---
    const exposedAdmin = await probeAdmin(finalUrl.origin);

    // ============ 判定 ============
    const checks = [];
    const add = (key, label, status, detail, why) => checks.push({ key, label, status, detail, why });

    add('https', '常時SSL（HTTPS）', isHttps ? 'good' : 'bad',
      isHttps ? '暗号化された安全な接続です' : 'httpのままです。通信が盗み見られる恐れがあり、ブラウザにも「保護されていない通信」と警告されます',
      '通信を暗号化する、防犯の最低ライン');

    add('hsts', 'HTTPSの常時強制（HSTS）', hsts ? 'good' : 'warn',
      hsts ? '常にHTTPSへ誘導する設定があります' : '未設定。最初のアクセスがhttpに逃げると、その一瞬を盗聴・改ざんされる余地が残ります',
      '「必ず鍵のかかった扉から入らせる」設定');

    add('clickjacking', 'なりすまし操作対策（クリックジャッキング）', (xfo || cspFrameAncestors) ? 'good' : 'warn',
      (xfo || cspFrameAncestors) ? 'サイトを透明な枠で覆う攻撃への対策があります' : '未設定。サイトを透明な枠で覆い、利用者に気づかせず操作させる攻撃を防げていません',
      '来訪者を騙してクリックさせる手口への備え');

    add('nosniff', 'ファイル種別の偽装対策', /nosniff/i.test(nosniff) ? 'good' : 'warn',
      /nosniff/i.test(nosniff) ? 'X-Content-Type-Options が設定されています' : '未設定。アップロードされた不正ファイルが別の種類として実行される余地があります',
      '偽装ファイルを勝手に実行させない設定');

    add('csp', 'コンテンツの読み込み制限（CSP）', csp ? 'good' : 'warn',
      csp ? 'Content-Security-Policy が設定されています' : '未設定。外部から不正なスクリプトを差し込まれた際の被害を抑える設定がありません',
      '万一の改ざん時に被害を最小化する設定');

    add('version', 'サーバー・システム情報の露出', versionLeaks.length ? 'warn' : 'good',
      versionLeaks.length ? `バージョン情報が外から見えています（${versionLeaks.join(' / ')}）。古い版だと既知の弱点を狙われます` : 'サーバーの詳細バージョンは隠されています',
      '「鍵の型番」を攻撃者に教えないための基本');

    add('cms', 'サイトシステム（CMS）バージョンの露出',
      cms ? (cmsVersion ? 'bad' : 'warn') : 'good',
      cms
        ? (cmsVersion
            ? `${cms} ${cmsVersion} とバージョンまで丸見えです。既知の弱点を狙い撃ちされる典型的な入口です`
            : `${cms} を使用中と分かります（バージョンは非表示）。更新状況の点検をおすすめします`)
        : '使用システムやバージョンの露出は見当たりません',
      'バージョンが見える＝弱点を検索して狙われやすい');

    add('admin', '管理画面（裏口）の露出',
      exposedAdmin.length ? 'bad' : 'good',
      exposedAdmin.length
        ? `管理ログイン画面が外から見えています（${exposedAdmin.join(', ')}）。第三者がパスワード破りを試せる状態です`
        : '一般的な管理画面URLは、外からは見えませんでした',
      '「裏口」が見えていると総当たり攻撃の的になる');

    // --- スコア（good=1, warn=0.5, bad=0）---
    const w = { good: 1, warn: 0.5, bad: 0 };
    const score = Math.round(checks.reduce((s, c) => s + w[c.status], 0) / checks.length * 100);
    const counts = {
      good: checks.filter(c => c.status === 'good').length,
      warn: checks.filter(c => c.status === 'warn').length,
      bad:  checks.filter(c => c.status === 'bad').length,
    };

    return json({
      ok: true,
      url: finalUrl.toString(),
      fetchedAt: new Date().toISOString(),
      score, counts,
      meta: {
        title: decodeEntities(pick(headHtml, /<title[^>]*>([\s\S]*?)<\/title>/i)),
        server, poweredBy, cms, cmsVersion,
        exposedAdmin,
      },
      checks,
    });
  } catch (e) {
    return json({ ok: false, error: '点検中にエラーが発生しました。時間をおいてお試しください' }, 500);
  }
}

// 一般的な管理画面URLが「ログイン画面として」外部に露出しているかを、公開URLへのGETのみで確認する。
async function probeAdmin(origin) {
  const paths = ['/wp-login.php', '/wp-admin/', '/administrator/'];
  const results = await Promise.all(paths.map(async (p) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    try {
      const r = await fetch(origin + p, {
        method: 'GET', redirect: 'follow', signal: c.signal,
        headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      });
      clearTimeout(t);
      if (r.status >= 400) return null;
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('html')) return null;
      const body = new TextDecoder('utf-8').decode(await readCapped(r, 64 * 1024));
      // パスワード入力欄やログインフォームの痕跡がある＝ログイン画面が露出している
      const looksLogin = /type=["']password["']|name=["']pwd["']|name=["']log["']|id=["']loginform|wp-login|user-login|<form[^>]+login/i.test(body);
      return looksLogin ? p : null;
    } catch {
      clearTimeout(t);
      return null;
    }
  }));
  return results.filter(Boolean);
}

// レスポンス本体を上限バイトまで読む
async function readCapped(res, cap) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) {
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab).slice(0, cap);
  }
  const chunks = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  try { reader.cancel(); } catch {}
  const out = new Uint8Array(Math.min(total, cap));
  let off = 0;
  for (const c of chunks) {
    if (off >= out.length) break;
    const slice = c.subarray(0, out.length - off);
    out.set(slice, off);
    off += slice.length;
  }
  return out;
}

function pick(s, re) { const m = s.match(re); return m ? (m[1] || '').trim() : ''; }

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
