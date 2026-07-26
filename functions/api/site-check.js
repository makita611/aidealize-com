// Cloudflare Pages Function: 即時サイト診断エンジン
// GET /api/site-check?url=https://example.com
// ユーザーが入力したサイトURLをサーバー側で取得し、集客の観点で自動チェックした結果をJSONで返す。
// （静的サイトのフロント site-check.html から呼び出す）

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
    if (blocked) return json({ ok: false, error: 'このURLは診断できません' }, 400);

    // --- ページ取得（タイムアウト・リダイレクト追従）---
    async function fetchOnce(u) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const t0 = Date.now();
      try {
        const res = await fetch(u, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AIdealizeSiteCheck/1.0; +https://aidealize.com)',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });
        return { res, ms: Date.now() - t0 };
      } catch (e) {
        return { err: e, ms: Date.now() - t0 };
      } finally {
        clearTimeout(timer);
      }
    }

    let { res, err, ms: ttfbMs } = await fetchOnce(target.toString());
    // https の証明書エラー等（523/525/526）や接続失敗のときは http で取り直す。
    // 診断対象は「SSL証明書が壊れた放置サイト」が多く、その場合 https は落ちるが
    // http なら生きている。scheme無しのドメインを渡された時も既定の https で落ちるため、
    // ここで諦めると最も狙い目の見込み客を診断できない。
    const sslBroken = res && [523, 525, 526].includes(res.status);
    if ((err || sslBroken) && target.protocol === 'https:') {
      const httpTarget = 'http://' + target.host + target.pathname + target.search;
      const retry = await fetchOnce(httpTarget);
      if (retry.res) { res = retry.res; err = null; ttfbMs = retry.ms; }
    }

    if (err) {
      const msg = err.name === 'AbortError' ? 'サイトの応答が遅く、8秒以内に取得できませんでした' : 'サイトに接続できませんでした（URLをご確認ください）';
      return json({ ok: false, error: msg });
    }

    if (res.status >= 400) {
      return json({ ok: false, error: `サイトがエラー応答を返しました（HTTP ${res.status}）。URLをご確認いただくか、時間をおいてお試しください` });
    }

    const finalUrl = new URL(res.url || target.toString());
    const isHttps = finalUrl.protocol === 'https:';

    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.includes('html')) {
      return json({ ok: false, error: 'HTMLページではないため診断できませんでした' });
    }

    // 先頭512KBだけ読む
    const buf = await readCapped(res, 512 * 1024);
    const dlMs = Date.now() - t0;
    const bytes = buf.length;
    const html = new TextDecoder('utf-8').decode(buf);
    const headHtml = html.slice(0, 200000); // <head>周辺の抽出用

    // --- 抽出 ---
    const pick = (re) => { const m = headHtml.match(re); return m ? (m[1] || '').trim() : ''; };
    const title = decodeEntities(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
    const metaDesc = decodeEntities(
      pick(/<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
      pick(/<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']description["']/i)
    );
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(headHtml);
    const langAttr = pick(/<html[^>]+lang=["']([^"']+)["']/i);
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    const hasOgTitle = /<meta[^>]+property=["']og:title["']/i.test(headHtml);
    const hasOgImage = /<meta[^>]+property=["']og:image["']/i.test(headHtml);
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(headHtml);
    const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
    const hasFavicon = /<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(headHtml);
    const imgTags = html.match(/<img\b[^>]*>/gi) || [];
    const imgTotal = imgTags.length;
    const imgNoAlt = imgTags.filter(t => !/\balt\s*=/i.test(t)).length;
    const hasTel = /href=["']tel:/i.test(html);
    // 問い合わせ/予約導線の気配
    const ctaWords = /(問い合わせ|お問合せ|お問合わせ|予約|申し込|申込|無料相談|見積|カウンセリング|来店予約|contact|reserv|booking)/i;
    const hasCtaHint = ctaWords.test(html);

    // --- 判定（status: good / warn / bad）---
    const checks = [];
    const add = (key, label, status, detail, why) => checks.push({ key, label, status, detail, why });

    add('https', '常時SSL（https）', isHttps ? 'good' : 'bad',
      isHttps ? '暗号化された安全な接続です' : 'httpのままです。Googleは常時SSLを評価し、ブラウザは「保護されていない通信」と警告します',
      'セキュリティ表示と検索評価の基本');

    add('mobile', 'スマホ対応（viewport）', hasViewport ? 'good' : 'bad',
      hasViewport ? 'スマートフォン向けの表示設定があります' : 'viewport設定が無く、スマホで極端に小さく表示されている可能性があります',
      '集客の入口はほぼスマホ。ここが崩れると直帰します');

    const tLen = title.length;
    add('title', 'タイトルタグ', !title ? 'bad' : (tLen < 10 || tLen > 60 ? 'warn' : 'good'),
      !title ? 'タイトルが設定されていません' : `「${clip(title, 40)}」（${tLen}文字）` + (tLen > 60 ? '／長すぎて検索結果で見切れます' : tLen < 10 ? '／短く、内容が伝わりません' : ''),
      '検索結果の見出し。クリック率を大きく左右します');

    const dLen = metaDesc.length;
    add('description', 'meta description', !metaDesc ? 'warn' : (dLen < 50 || dLen > 160 ? 'warn' : 'good'),
      !metaDesc ? '未設定です。検索結果の説明文が自動生成任せになっています' : `${dLen}文字` + (dLen > 160 ? '／長すぎて見切れます' : dLen < 50 ? '／短く、魅力が伝わりません' : '（適切な長さです）'),
      '検索結果の説明文。読まれてクリックされる決め手');

    add('h1', '見出し（H1）', h1Count === 1 ? 'good' : (h1Count === 0 ? 'bad' : 'warn'),
      h1Count === 0 ? 'H1見出しがありません。ページの主題が検索エンジンに伝わりにくい状態です' : `H1が${h1Count}個あります` + (h1Count > 1 ? '（1ページ1個が基本。主題がぼやけます）' : ''),
      'ページが「何のページか」を伝える最重要見出し');

    add('ogp', 'SNSシェア表示（OGP）', (hasOgTitle && hasOgImage) ? 'good' : (hasOgTitle || hasOgImage ? 'warn' : 'bad'),
      (hasOgTitle && hasOgImage) ? 'SNSやLINEで共有したとき、画像付きで正しく表示されます' : 'OGP設定が不足。SNS/LINEで共有されてもタイトルや画像が出ず、クリックされにくい状態です',
      'LINE・SNSでの拡散時の見栄え＝クリック率');

    add('structured', '構造化データ（JSON-LD）', hasJsonLd ? 'good' : 'warn',
      hasJsonLd ? '検索エンジンが内容を理解しやすい構造化データがあります' : '未設定。店舗情報・FAQ・レビューなどをリッチに検索表示させる余地があります',
      'Google検索での目立ちやすさ（リッチリザルト）');

    add('cta', '問い合わせ・予約の導線', hasCtaHint ? (hasTel ? 'good' : 'warn') : 'bad',
      hasCtaHint ? (hasTel ? '問い合わせ導線と電話タップ導線が見つかりました' : '問い合わせ導線はありますが、電話のワンタップ発信（tel:リンク）が見当たりません') : '問い合わせ・予約への明確な導線が見つかりませんでした',
      '「動く」段。ここが弱いと流入しても成約しません');

    if (imgTotal > 0) {
      const ratio = imgNoAlt / imgTotal;
      add('imgalt', '画像のalt設定', ratio === 0 ? 'good' : (ratio > 0.5 ? 'warn' : 'good'),
        `画像${imgTotal}枚中 ${imgNoAlt}枚にalt（代替テキスト）がありません`,
        '画像検索の流入とアクセシビリティ');
    }

    const weightKB = Math.round(bytes / 1024);
    add('speed', 'ページの反応速度', ttfbMs < 800 ? 'good' : (ttfbMs < 2000 ? 'warn' : 'bad'),
      `サーバー応答 約${ttfbMs}ms・HTML約${weightKB}KB` + (ttfbMs >= 2000 ? '／表示が重く、待てずに離脱される恐れがあります' : ''),
      '表示が1秒遅れるだけで離脱は跳ね上がります');

    // --- スコア（good=1, warn=0.5, bad=0）---
    const w = { good: 1, warn: 0.5, bad: 0 };
    const score = Math.round(checks.reduce((s, c) => s + w[c.status], 0) / checks.length * 100);
    const counts = {
      good: checks.filter(c => c.status === 'good').length,
      warn: checks.filter(c => c.status === 'warn').length,
      bad: checks.filter(c => c.status === 'bad').length,
    };

    return json({
      ok: true,
      url: finalUrl.toString(),
      fetchedAt: new Date().toISOString(),
      score, counts,
      meta: { title, titleLen: tLen, ttfbMs, weightKB, langAttr, h1Count },
      checks,
    });
  } catch (e) {
    return json({ ok: false, error: '診断中にエラーが発生しました。時間をおいてお試しください' }, 500);
  }
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

function clip(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
