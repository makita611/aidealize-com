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

    const t0 = Date.now();  // 全体の取得開始（下流の dlMs 用）
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

    // 文字コード判定（古いサイトはShift_JIS/EUC-JPが多く、モダンさ判定の材料になる）
    const ctypeCharset = (/charset=["']?\s*([\w-]+)/i.exec(ctype) || [])[1] || '';
    const asciiPeek = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, 8192));
    const metaCharset = (/<meta[^>]+charset=["']?\s*([\w-]+)/i.exec(asciiPeek) || [])[1]
      || (/content=["'][^"']*charset=([\w-]+)/i.exec(asciiPeek) || [])[1] || '';
    const charset = (ctypeCharset || metaCharset || '').toLowerCase();
    let html;
    if (/shift|sjis|euc/i.test(charset)) {
      const label = /euc/i.test(charset) ? 'euc-jp' : 'shift-jis';
      try { html = new TextDecoder(label).decode(buf); }
      catch { html = new TextDecoder('utf-8').decode(buf); }
    } else {
      html = new TextDecoder('utf-8').decode(buf);
    }
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
    // 問い合わせ/予約/応募などの行動導線の気配（集客も採用も拾う）
    const ctaWords = /(問い合わせ|お問合せ|お問合わせ|予約|申し込|申込|無料相談|見積|カウンセリング|来店予約|資料請求|資料ダウンロード|エントリー|応募|求人|採用|デモ|無料体験|contact|reserv|booking|entry|apply|recruit)/i;
    const hasCtaHint = ctaWords.test(html);

    // --- 判定（cat: base=土台 / modern=見た目の新しさ / growth=集客・成約の導線）---
    const checks = [];
    const add = (key, cat, label, status, detail, why) => checks.push({ key, cat, label, status, detail, why });

    /* ── A. 土台（衛生）── */
    add('https', 'base', '常時SSL（https）', isHttps ? 'good' : 'bad',
      isHttps ? '暗号化された安全な接続です' : 'httpのままです。ブラウザに「保護されていない通信」と警告され、検索評価も下がります',
      'セキュリティ表示と検索評価の基本');

    add('mobile', 'base', 'スマホ対応（viewport）', hasViewport ? 'good' : 'bad',
      hasViewport ? 'スマートフォン向けの表示設定があります' : 'viewport設定が無く、スマホで極端に小さく表示されている可能性があります',
      '集客の入口はほぼスマホ。ここが崩れると即離脱します');

    const tLen = title.length;
    add('title', 'base', 'タイトルタグ', !title ? 'bad' : (tLen < 10 || tLen > 60 ? 'warn' : 'good'),
      !title ? 'タイトルが設定されていません' : `「${clip(title, 40)}」（${tLen}文字）` + (tLen > 60 ? '／長すぎて検索結果で見切れます' : tLen < 10 ? '／短く、内容が伝わりません' : ''),
      '検索結果の見出し。クリック率を大きく左右します');

    const dLen = metaDesc.length;
    add('description', 'base', 'meta description', !metaDesc ? 'warn' : (dLen < 50 || dLen > 160 ? 'warn' : 'good'),
      !metaDesc ? '未設定です。検索結果の説明文が自動生成任せになっています' : `${dLen}文字` + (dLen > 160 ? '／長すぎて見切れます' : dLen < 50 ? '／短く、魅力が伝わりません' : '（適切な長さです）'),
      '検索結果の説明文。読まれてクリックされる決め手');

    add('h1', 'base', '見出し（H1）', h1Count === 1 ? 'good' : (h1Count === 0 ? 'bad' : 'warn'),
      h1Count === 0 ? 'H1見出しがありません。ページの主題が検索エンジンに伝わりにくい状態です' : `H1が${h1Count}個あります` + (h1Count > 1 ? '（1ページ1個が基本。主題がぼやけます）' : ''),
      'ページが「何のページか」を伝える最重要見出し');

    add('canonical', 'base', '正規URL（canonical）', hasCanonical ? 'good' : 'warn',
      hasCanonical ? '正規URL（canonical）が設定されています' : 'canonicalが未設定。重複URLで検索評価が分散する可能性があります',
      '検索評価をひとつのURLに集約し、無駄な分散を防ぐ');

    const weightKB = Math.round(bytes / 1024);
    add('speed', 'base', 'ページの反応速度', ttfbMs < 800 ? 'good' : (ttfbMs < 2000 ? 'warn' : 'bad'),
      `サーバー応答 約${ttfbMs}ms・HTML約${weightKB}KB` + (ttfbMs >= 2000 ? '／表示が重く、待てずに離脱される恐れがあります' : ''),
      '表示が1秒遅れるだけで離脱は跳ね上がります');

    if (imgTotal > 0) {
      const ratio = imgNoAlt / imgTotal;
      add('imgalt', 'base', '画像のalt設定', ratio === 0 ? 'good' : (ratio > 0.5 ? 'warn' : 'good'),
        `画像${imgTotal}枚中 ${imgNoAlt}枚にalt（代替テキスト）がありません`,
        '画像検索の流入とアクセシビリティ');
    }

    /* ── B. 見た目の新しさ ── */
    const isLegacyCharset = /shift|sjis|euc/i.test(charset);
    add('charset', 'modern', '文字コード', isLegacyCharset ? 'bad' : 'good',
      isLegacyCharset ? `${charset} が使われています。2010年代前半までの古いサイトに多く、長く手が入っていないサインです`
        : (charset ? 'UTF-8（現在の標準）です' : 'UTF-8（標準）とみられます'),
      '文字コードは制作年代の指標。古い＝放置されている可能性が高い');

    const gen = pick(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']*)["']/i);
    let genStatus = 'good', genDetail = 'モダンな作り、または手組みで作られています';
    if (/ホームページ.?ビルダー|homepage\s*builder|\bhpb\b/i.test(gen)) { genStatus = 'bad'; genDetail = `「${gen}」で作られています。地方・個人の古いサイトに多く、スマホ・集客対応が弱い傾向です`; }
    else if (/frontpage|dreamweaver/i.test(gen)) { genStatus = 'bad'; genDetail = `「${gen}」＝制作ツールが現行世代ではありません`; }
    else if (/wordpress\s*[0-4]\./i.test(gen)) { genStatus = 'warn'; genDetail = `「${gen}」＝WordPressが古いバージョンのまま更新されていない可能性があります`; }
    else if (gen) { genDetail = `制作環境：「${gen}」`; }
    add('generator', 'modern', '制作ツール・世代', genStatus, genDetail,
      '古い制作ツール＝スマホ・検索・集客の前提が古いまま');

    const legacyHits = [];
    if (!/<!doctype\s+html\s*>/i.test(html.slice(0, 300))) legacyHits.push('旧HTML規格');
    if (/<font[\s>]/i.test(html)) legacyHits.push('<font>タグ');
    if (/<center[\s>]/i.test(html)) legacyHits.push('<center>タグ');
    if (/<marquee/i.test(html)) legacyHits.push('流れる文字(marquee)');
    if (/\bbgcolor\s*=/i.test(html)) legacyHits.push('bgcolor属性');
    if (/\.swf(["'?]|$)|x-shockwave-flash|<embed[\s>]/i.test(html)) legacyHits.push('Flash等の廃止技術');
    if (/x-ua-compatible/i.test(headHtml)) legacyHits.push('IE時代の互換設定');
    const legStatus = legacyHits.length === 0 ? 'good' : (legacyHits.length >= 2 ? 'bad' : 'warn');
    add('legacy', 'modern', '作りの新しさ', legStatus,
      legacyHits.length === 0 ? '古い作り方の痕跡は見つかりませんでした'
        : `古い作りの痕跡：${legacyHits.join('・')}。今のスマホ表示・SEOに不利です`,
      '古い作り＝スマホで崩れ、検索でも評価されにくい');

    add('structured', 'modern', '構造化データ（JSON-LD）', hasJsonLd ? 'good' : 'warn',
      hasJsonLd ? '検索エンジンが内容を理解しやすい構造化データがあります' : '未設定。店舗情報・FAQ・レビューなどをリッチに検索表示させる余地があります',
      'Google検索での目立ちやすさ（リッチリザルト）');

    const imgOpt = [];
    if (/\.webp|\.avif|image\/webp|image\/avif/i.test(html)) imgOpt.push('次世代フォーマット(WebP/AVIF)');
    if (/loading\s*=\s*["']?lazy/i.test(html)) imgOpt.push('遅延読み込み(lazy)');
    if (/\bsrcset\s*=/i.test(html)) imgOpt.push('レスポンシブ画像(srcset)');
    add('imgopt', 'modern', '画像の最適化', imgOpt.length >= 2 ? 'good' : (imgOpt.length === 1 ? 'warn' : (imgTotal > 0 ? 'bad' : 'warn')),
      imgOpt.length >= 2 ? `${imgOpt.join('・')} を使っています`
        : imgOpt.length === 1 ? `${imgOpt[0]} は使っていますが、次世代フォーマット／遅延読み込み／srcset のうち他が未対応です`
          : '次世代フォーマット・遅延読み込み・srcset のいずれも見当たりません。表示が重く初期離脱を招きます',
      '画像最適化＝表示速度。1秒の遅れで離脱は跳ね上がる');

    // ©年号：範囲(2020–2026)なら終端＝更新年の意図で厳しめ、単年なら設立年の可能性ありで甘め判定
    const copyBlock = (html.match(/(?:©|&copy;|copyright|\(c\))[\s\S]{0,30}?((?:20[0-2]\d)(?:\s*[–\-〜~]\s*20[0-2]\d)?)/i) || [])[1] || '';
    const yrs = (copyBlock.match(/20[0-2]\d/g) || []).map(Number);
    if (yrs.length) {
      const isRange = yrs.length >= 2;
      const endYear = Math.max(...yrs);
      const nowYear = new Date().getFullYear();
      const gap = nowYear - endYear;
      let fStatus, fDetail;
      if (gap <= 1) { fStatus = 'good'; fDetail = `©表記は ${copyBlock}（最新）`; }
      else if (isRange) { fStatus = 'bad'; fDetail = `©表記は ${copyBlock}。範囲の終端が${endYear}年で止まっており、更新停止＝放置の可能性が高いです`; }
      else { fStatus = 'warn'; fDetail = `©表記は ${endYear}年（単年）。設立年の固定表記かもしれませんが、範囲表記（例 ${endYear}–${nowYear}）にすると「今も動いている」印象になります`; }
      add('freshness', 'modern', '更新の鮮度（©表記）', fStatus, fDetail,
        '年号が古い＝更新停止に見える。範囲表記なら現役感が出る');
    }

    /* ── C. 集客・成約の導線 ── */
    // SPA（JS描画）判定：本文をJavaScriptで描くサイトはHTMLに導線が出ず、下記のキーワード判定が空振りする。
    // その場合は「無い」と断定せず warn に留める（誤って導線ゼロと表示して信頼を落とさないため）。
    const isSPA = /__NEXT_DATA__|_next\/static|__NUXT__|data-reactroot|ng-version/i.test(html);
    const visibleText = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const visibleLen = visibleText.length;
    const spaBlind = isSPA && visibleLen < 1200;
    const softBad = spaBlind ? 'warn' : 'bad';
    const spaNote = spaBlind ? '（JavaScript描画のサイトのため、HTMLから読み取れず判定を保留しました）' : '';
    // LINE予約中心の集客か（完全予約制の美容・医療・サロンでは電話・Webフォームが無いのが正しい設計）
    const hasLine = /lin\.ee|line\.me|LINE公式|友だち追加/i.test(html);

    const hasGTM = /googletagmanager\.com\/gtm|['"]GTM-[A-Z0-9]+['"]/i.test(html);
    const hasGtag = /gtag\s*\(|googletagmanager\.com\/gtag|['"]G-[A-Z0-9]{6,}['"]/i.test(html);
    const hasOldGA = /google-analytics\.com\/ga\.js|_gaq\.push|urchin\.js|['"]UA-\d{4,}/i.test(html);
    const hasModAnalytics = hasGTM || hasGtag;
    add('analytics', 'growth', 'アクセス解析（計測）', hasModAnalytics ? 'good' : (hasOldGA ? 'warn' : 'bad'),
      hasModAnalytics ? '計測タグ（GA4／GTM）が入っており、数字を見て改善できる状態です'
        : hasOldGA ? '旧世代の解析タグ（Universal Analytics等）です。2023年で計測停止済みの可能性が高く、今の数字が取れていません'
          : '計測タグが見当たりません。アクセスも問い合わせも数字で見えておらず、改善が勘になります',
      '計測が無い＝現状把握も効果検証もできない。集客改善の大前提');

    // 電話は必須ではない（近年は非掲載の企業も多い／B2Bはフォーム中心）。連絡導線が一つでもあればOK、皆無なら減点。
    const contactOk = hasTel || hasLine || hasCtaHint;
    add('tel', 'growth', 'すぐ連絡・予約できる導線', hasTel ? 'good' : (contactOk ? 'good' : 'warn'),
      hasTel ? 'スマホでワンタップ発信できる電話リンクがあります'
        : hasLine ? '電話は非掲載ですが、LINEでの予約・相談に集約されています（美容・医療・サロンで有効な形）'
          : contactOk ? '電話は非掲載ですが、問い合わせ・予約の導線はあります（近年は電話を載せない企業・B2Bも一般的です）'
            : '電話・LINE・問い合わせのいずれの連絡導線も見当たりません。すぐ動きたい客を受け止められていません',
      'すぐ連絡・予約できる手段が最低ひとつあるか');

    add('cta', 'growth', '問い合わせ・予約の導線', hasCtaHint ? 'good' : softBad,
      hasCtaHint ? '問い合わせ・予約・相談などの行動導線が見つかりました' : '問い合わせ・予約への明確な導線が見つかりませんでした' + spaNote,
      '「動く」段。ここが弱いと来訪しても成約しません');

    // 実績・数字の裏づけ（高CVサイトが共通して持つ社会的証明。例：導入5,000社／満足度98％／実績10万件）
    // 可視テキストだけを対象にし（CSSのwidth:100%やスクリプトのIDを除外）、桁数の多い日付・IDは弾く。
    const proofMatches = (visibleText.match(/[0-9０-９][0-9０-９,，.]*\s*(社|名|件|人|案件|店舗|拠点|万人|万件|万社|％|%)|満足度\s*[0-9０-９]|継続率\s*[0-9０-９]|リピート率?\s*[0-9０-９]|no\.?\s*1|シェア\s*[0-9０-９]/gi) || [])
      .filter(m => (m.match(/[0-9０-９]/g) || []).length <= 6);
    const proofN = proofMatches.length;
    add('proof', 'growth', '実績・数字の裏づけ', proofN >= 3 ? 'good' : (proofN >= 1 ? 'warn' : softBad),
      proofN === 0 ? ('導入数・満足度・件数などの「数字の裏づけ」が見当たりません' + spaNote)
        : `数字による実績訴求が${proofN}箇所（例：${[...new Set(proofMatches)].slice(0, 3).join(' / ')}）`,
      '「5,000社導入」等の数字は不安を消す最強の後押し。高CVサイトが必ず持つ');

    const snsHits = [];
    if (/instagram\.com/i.test(html)) snsHits.push('Instagram');
    if (/facebook\.com|fb\.com/i.test(html)) snsHits.push('Facebook');
    if (/twitter\.com|x\.com\//i.test(html)) snsHits.push('X');
    if (/youtube\.com|youtu\.be/i.test(html)) snsHits.push('YouTube');
    if (/tiktok\.com/i.test(html)) snsHits.push('TikTok');
    const socialList = [hasLine ? 'LINE' : null, ...snsHits].filter(Boolean);
    add('social', 'growth', 'LINE・SNS導線', socialList.length >= 2 ? 'good' : (socialList.length === 1 ? 'warn' : softBad),
      socialList.length === 0 ? ('LINEやSNSへの導線が見当たりません。地域・リピート集客の受け皿が弱い状態です' + spaNote)
        : `${socialList.join('・')} への導線があります`,
      'LINE・SNSは再訪・リピート集客の主力。特に地域ビジネスで効きます');

    const trustDefs = [
      ['実績・事例', /実績|導入事例|施工事例|症例|ビフォーアフター/],
      ['お客様の声', /お客様の声|口コミ|レビュー|利用者の声|患者様の声|体験談/],
      ['料金の明示', /料金|価格|費用|プラン|メニュー表|報酬|単価/],
      ['よくある質問', /よくある質問|q\s*&\s*a|faq/i],
      ['運営者情報', /会社概要|運営会社|スタッフ紹介|院長|代表挨拶|プロフィール|私たちについて/],
      ['安心の裏づけ', /プライバシーポリシー|個人情報保護|特定商取引|返金保証|保証制度|セキュリティ|pマーク|iso\s|国家資格|有資格/i],
    ];
    const trustHits = trustDefs.filter(([, re]) => re.test(html)).map(([n]) => n);
    add('trust', 'growth', '信頼づくりの要素', trustHits.length >= 3 ? 'good' : (trustHits.length >= 1 ? 'warn' : softBad),
      trustHits.length === 0 ? ('実績・お客様の声・料金などの「信じる」材料が見当たりません' + spaNote)
        : `見つかった要素：${trustHits.join('・')}` + (trustHits.length < 3 ? '（もう少し増やす余地があります）' : ''),
      '「信じる」段。不安を消せないと問い合わせ直前で離脱します');

    // フォームの作り込み（EFO）：高CVサイトは適切なinput型・autocomplete等で入力摩擦を消す。放置サイトはmailtoのみ or 素のtextだけ。
    const formCount = (html.match(/<form[\s>]/gi) || []).length;
    const efoHits = (/\bautocomplete\s*=/i.test(html) ? 1 : 0) + (/\binputmode\s*=/i.test(html) ? 1 : 0)
      + (/type\s*=\s*["']?email/i.test(html) ? 1 : 0) + (/type\s*=\s*["']?tel/i.test(html) ? 1 : 0);
    const mailtoOnly = /href=["']mailto:/i.test(html) && formCount === 0;
    let efoStatus, efoDetail;
    if (formCount === 0) {
      if (hasLine) {
        efoStatus = 'good';
        efoDetail = 'Webフォームの代わりにLINE予約・相談に集約されています（完全予約制の美容・医療で有効な形）';
      } else if (mailtoOnly) {
        efoStatus = spaBlind ? 'warn' : 'bad';
        efoDetail = '問い合わせがmailto（メール起動）だけで、Webフォームがありません。スマホで離脱しやすく、CVも計測できません';
      } else {
        efoStatus = 'warn';
        efoDetail = '入力フォームが見つかりませんでした' + spaNote;
      }
    } else if (efoHits >= 2) {
      efoStatus = 'good';
      efoDetail = `フォームあり。入力補助（autocomplete／type=email・tel／inputmode など${efoHits}種）が入っており、スマホでの入力離脱を抑えられています`;
    } else {
      efoStatus = 'warn';
      efoDetail = 'フォームはありますが、入力補助（autocomplete・type=email/tel・inputmode）が乏しく、スマホ入力の摩擦が残っています';
    }
    add('form', 'growth', 'フォームの作り込み（EFO）', efoStatus, efoDetail,
      '入力の手間＝離脱の最大要因。型・自動補完で完了率が上がる');

    // オファーの多様性（マルチCV）：検討段階の違う入口を複数持つほど強い（集客も採用も対象）
    const offerDefs = [
      ['資料', /資料請求|資料ダウンロード|ホワイトペーパー|ダウンロード資料/],
      ['問い合わせ・相談', /問い合わせ|お問合せ|お問合わせ|相談/],
      ['予約・面談', /予約|面談|来店|カウンセリング/],
      ['診断・体験', /診断|無料体験|お試し|シミュレーション/],
      ['セミナー', /セミナー|ウェビナー|イベント|説明会/],
      ['見積・デモ', /見積|お見積|デモ|トライアル/],
      ['登録・応募', /会員登録|新規登録|エントリー|応募|求人/],
    ];
    const offerHits = offerDefs.filter(([, re]) => re.test(html)).map(([n]) => n);
    add('multicv', 'growth', 'オファーの多様性（入口の数）', offerHits.length >= 3 ? 'good' : (offerHits.length >= 1 ? 'warn' : softBad),
      offerHits.length === 0 ? ('行動の入口（資料・相談・予約・診断など）が見当たりません' + spaNote)
        : `見つかった入口：${offerHits.join('・')}（${offerHits.length}種）` + (offerHits.length < 3 ? '／入口が少なめ。今すぐ客だけでなく検討中の客の受け皿も用意すると取りこぼしが減ります' : ''),
      '検討段階の違う客に別々の入口を用意すると、まだ相談したくない層もリード化できる');

    add('ogp', 'growth', 'SNSシェア表示（OGP）', (hasOgTitle && hasOgImage) ? 'good' : (hasOgTitle || hasOgImage ? 'warn' : 'bad'),
      (hasOgTitle && hasOgImage) ? 'SNSやLINEで共有したとき、画像付きで正しく表示されます' : 'OGP設定が不足。SNS/LINEで共有されてもタイトルや画像が出ず、クリックされにくい状態です',
      'LINE・SNSでの拡散時の見栄え＝クリック率');

    // --- カテゴリ別スコア（good=1, warn=0.5, bad=0）---
    const w = { good: 1, warn: 0.5, bad: 0 };
    const catLabels = { base: '土台（衛生）', modern: '見た目の新しさ', growth: '集客・成約の導線' };
    const categories = {};
    for (const key of Object.keys(catLabels)) {
      const cs = checks.filter(c => c.cat === key);
      categories[key] = {
        label: catLabels[key],
        score: cs.length ? Math.round(cs.reduce((s, c) => s + w[c.status], 0) / cs.length * 100) : null,
        counts: {
          good: cs.filter(c => c.status === 'good').length,
          warn: cs.filter(c => c.status === 'warn').length,
          bad: cs.filter(c => c.status === 'bad').length,
        },
      };
    }
    // 総合＝集客導線を最重視した加重平均（土台35%・見た目15%・集客導線50%）。
    // 高CV研究(CRO)の配点に合わせ、「集客に効く要素」で点差が付くようにする。
    const catW = { base: 0.35, modern: 0.15, growth: 0.50 };
    let wSum = 0, wTotal = 0;
    for (const k of Object.keys(catW)) {
      if (categories[k] && categories[k].score != null) { wSum += categories[k].score * catW[k]; wTotal += catW[k]; }
    }
    const score = wTotal ? Math.round(wSum / wTotal) : 0;
    const counts = {
      good: checks.filter(c => c.status === 'good').length,
      warn: checks.filter(c => c.status === 'warn').length,
      bad: checks.filter(c => c.status === 'bad').length,
    };

    return json({
      ok: true,
      url: finalUrl.toString(),
      fetchedAt: new Date().toISOString(),
      score, counts, categories,
      meta: { title, titleLen: tLen, ttfbMs, weightKB, langAttr, h1Count, charset },
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
