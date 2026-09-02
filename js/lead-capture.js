/*!
 * lead-capture.js — 低コミットのリード獲得バー（全ページ共通パーツ）
 * URLで業種を自動判定してオファーを出し分け:
 *   ケアマネ/認定調査 → 特記10本 無料（/lp/caremane-ocr/ へ）
 *   Web/工務店/セキュリティ → 無料サイト診断（/site-check.html へ）
 *   それ以外(介護・クリニック等) → ムダ取りチェックシート（メール獲得フォーム）
 * 送信は既存GAS（gas-forms.js と同じエンドポイント）へ。GA4計測あり。
 * 使い方: <script src="/js/lead-capture.js"></script> を各ページに1行足すだけ。
 *   任意で <script src="/js/lead-capture.js" data-offer="ocr|sitecheck|checklist"></script> で強制指定。
 */
(function () {
  'use strict';
  if (window.__leadCaptureLoaded) return;
  window.__leadCaptureLoaded = true;

  var GAS_URL = '/api/lead-submit';
  var DISMISS_DAYS = 7;

  /* ---- オファー定義 ---- */
  var OFFERS = {
    ocr: {
      mode: 'link',
      accent: '#1e4a7a',
      icon: '📄',
      title: '認定調査票の特記、まず10本 無料で。',
      sub: 'スキャンしてメールで送るだけ。AIがテキスト化してお返しします。',
      btn: '無料お試しを見る',
      href: '/lp/caremane-ocr/'
    },
    sitecheck: {
      mode: 'link',
      accent: '#0891b2',
      icon: '🔍',
      title: 'あなたのサイト、"放置度"を無料診断。',
      sub: 'URLを入れるだけ。土台・見た目・集客の弱点を即採点します。',
      btn: '無料でサイト診断',
      href: '/site-check.html'
    },
    checklist: {
      mode: 'link',
      accent: '#0891b2',
      icon: '🗂️',
      title: 'AI業務自動化 ムダ取りチェックシート（無料）',
      sub: '現場のムダを5カテゴリ25項目でセルフ点検。その場で判定と優先度がわかります（登録不要）。',
      btn: 'その場でチェック',
      href: '/lp/muda-tori/?utm_source=lead_bar&utm_medium=bar&utm_campaign=checklist'
    }
  };

  /* ---- 業種の自動判定 ---- */
  function pickOffer() {
    var s = document.currentScript;
    var forced = s && s.getAttribute('data-offer');
    if (forced && OFFERS[forced]) return forced;
    var p = (location.pathname || '').toLowerCase();
    var has = function (arr) { for (var i = 0; i < arr.length; i++) { if (p.indexOf(arr[i]) !== -1) return true; } return false; };
    if (has(['ninteichosahyo', 'caremane', 'careplan', 'tokki'])) return 'ocr';
    if (has(['komuten', 'wordpress', 'ssl-', 'reform', 'kokoku', 'meo-', 'tenken', 'site-check', 'saiyo-site'])) return 'sitecheck';
    return 'checklist';
  }

  /* ---- 抑制（閉じた/送信済みは一定期間出さない）---- */
  function suppressed() {
    try {
      if (localStorage.getItem('lc_done')) return true;
      var t = parseInt(localStorage.getItem('lc_dismissed') || '0', 10);
      if (t && (Date.now() - t) < DISMISS_DAYS * 864e5) return true;
    } catch (e) {}
    return false;
  }
  function mark(k) { try { localStorage.setItem(k, String(Date.now())); } catch (e) {} }

  function track(ev, extra) {
    window.dataLayer = window.dataLayer || [];
    var o = { event: ev }; if (extra) for (var k in extra) o[k] = extra[k];
    window.dataLayer.push(o);
  }

  var offerKey = pickOffer();
  var O = OFFERS[offerKey];

  /* ---- スタイル ---- */
  var css = [
    '.lcbar{position:fixed;left:0;right:0;bottom:0;z-index:900;transform:translateY(110%);transition:transform .4s cubic-bezier(.22,1,.36,1);font-family:"Noto Sans JP",sans-serif;}',
    '.lcbar.show{transform:translateY(0);}',
    '.lcbar-inner{max-width:1000px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-bottom:none;border-radius:12px 12px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.12);padding:14px 18px;display:flex;align-items:center;gap:16px;}',
    '.lcbar-ic{width:44px;height:44px;flex-shrink:0;border-radius:10px;background:var(--lc-bg);display:flex;align-items:center;justify-content:center;font-size:22px;}',
    '.lcbar-txt{flex:1;min-width:0;}',
    '.lcbar-t{font-size:14px;font-weight:700;color:#16212e;line-height:1.5;}',
    '.lcbar-s{font-size:12px;color:#667;line-height:1.5;margin-top:2px;}',
    '.lcbar-btn{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;background:var(--lc-ac);color:#fff;border:none;cursor:pointer;padding:12px 22px;border-radius:6px;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap;transition:filter .2s,transform .1s;font-family:inherit;}',
    '.lcbar-btn:hover{filter:brightness(1.08);transform:translateY(-1px);}',
    '.lcbar-x{flex-shrink:0;width:28px;height:28px;border:none;background:none;cursor:pointer;color:#9aa4b0;font-size:20px;line-height:1;border-radius:50%;}',
    '.lcbar-x:hover{background:#f1f5f9;color:#556;}',
    '.lcbar-form{display:none;gap:8px;flex:1;flex-wrap:wrap;}',
    '.lcbar-form.on{display:flex;}',
    '.lcbar-form input{flex:1;min-width:150px;padding:11px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;}',
    '.lcbar-form input:focus{outline:none;border-color:var(--lc-ac);}',
    '.lcbar-thanks{flex:1;font-size:13px;color:#059669;font-weight:700;}',
    '@media(max-width:680px){',
    '  .lcbar-inner{flex-wrap:wrap;gap:10px;padding:12px 14px;}',
    '  .lcbar-ic{display:none;}',
    '  .lcbar-txt{flex:1 1 70%;}.lcbar-t{font-size:13px;}.lcbar-s{display:none;}',
    '  .lcbar-btn{flex:1 1 100%;justify-content:center;padding:13px;}',
    '  .lcbar-x{position:absolute;top:8px;right:8px;}',
    '  .lcbar-inner{position:relative;padding-top:16px;}',
    '  .lcbar-form{order:3;}',
    '}'
  ].join('');

  function init() {
    if (suppressed()) return;
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.className = 'lcbar';
    bar.style.setProperty('--lc-ac', O.accent);
    bar.style.setProperty('--lc-bg', O.accent + '1a');

    var right;
    if (O.mode === 'link') {
      right = '<a class="lcbar-btn" href="' + O.href + '" data-lc-link="1">' + O.btn + ' →</a>';
    } else {
      right =
        '<a class="lcbar-btn" href="#" data-lc-open="1">' + O.btn + ' →</a>' +
        '<form class="lcbar-form" data-lc-form="1">' +
        '<input type="text" name="company" placeholder="会社名・事業所名" required>' +
        '<input type="email" name="email" placeholder="メールアドレス" required>' +
        '<button type="submit" class="lcbar-btn">受け取る</button>' +
        '</form>';
    }

    bar.innerHTML =
      '<div class="lcbar-inner">' +
        '<div class="lcbar-ic">' + O.icon + '</div>' +
        '<div class="lcbar-txt"><div class="lcbar-t">' + O.title + '</div><div class="lcbar-s">' + O.sub + '</div></div>' +
        right +
        '<button class="lcbar-x" aria-label="閉じる">&times;</button>' +
      '</div>';
    document.body.appendChild(bar);

    var shown = false;
    function reveal() {
      if (shown) return;
      if (window.scrollY > 480 || (window.innerHeight + window.scrollY) > document.body.scrollHeight * 0.55) {
        shown = true;
        bar.classList.add('show');
        track('lead_bar_view', { offer: offerKey });
        window.removeEventListener('scroll', reveal);
      }
    }
    window.addEventListener('scroll', reveal, { passive: true });
    setTimeout(reveal, 100);

    bar.querySelector('.lcbar-x').addEventListener('click', function () {
      bar.classList.remove('show'); mark('lc_dismissed');
    });

    var linkEl = bar.querySelector('[data-lc-link]');
    if (linkEl) linkEl.addEventListener('click', function () { track('lead_bar_click', { offer: offerKey, href: O.href }); });

    var openEl = bar.querySelector('[data-lc-open]');
    if (openEl) openEl.addEventListener('click', function (e) {
      e.preventDefault();
      openEl.style.display = 'none';
      bar.querySelector('.lcbar-form').classList.add('on');
      bar.querySelector('.lcbar-form input').focus();
      track('lead_bar_open', { offer: offerKey });
    });

    var form = bar.querySelector('[data-lc-form]');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '送信中...';
      var fd = new FormData(form);
      var submissionId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      fd.append('page', document.title);
      fd.append('form_type', '資料ダウンロード');
      fd.append('request', '資料ダウンロード');
      fd.append('gift', O.gift || '');
      fd.append('source', 'lead_bar');
      fd.append('submission_id', submissionId);
      fd.append('page_path', location.pathname);
      var done = false;
      function thanks() {
        if (done) return; done = true;
        mark('lc_done');
        track('form_success', { form_id: 'lead-bar', service_name: document.title, lead_type: '資料ダウンロード', page_path: location.pathname, submission_id: submissionId, lead_source: 'lead_bar' });
        var inner = bar.querySelector('.lcbar-inner');
        inner.innerHTML = '<div class="lcbar-ic">✅</div><div class="lcbar-thanks">受け付けました。担当より資料をメールでお送りします（迷惑メールフォルダもご確認ください）。</div><button class="lcbar-x" aria-label="閉じる">&times;</button>';
        inner.querySelector('.lcbar-x').addEventListener('click', function () { bar.classList.remove('show'); });
      }
      fetch(GAS_URL, { method: 'POST', body: fd }).then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(result){if(!result.ok||result.submission_id!==submissionId)throw new Error();thanks();})['catch'](function(){btn.disabled=false;btn.textContent='受け取る';window.alert('送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。');});
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ── コラム記事末：ムダ取りチェックシート誘導CTA（全コラムに自動挿入・コラム別UTM）── */
(function () {
  var p = (location.pathname || '');
  if (p.indexOf('/column/') === -1) return;                 // コラム以外は出さない
  if (/\/column\/(index\.html)?$/.test(p)) return;          // 一覧ページは除外
  if (p.indexOf('komuten') !== -1) return;                  // 工務店系コラムはサイト診断バーに委ねる
  var m = p.match(/\/column\/([^\/]+)/);
  var slug = m ? m[1] : 'article';
  var href = '/lp/muda-tori/?utm_source=column&utm_medium=article&utm_campaign=' + encodeURIComponent(slug);

  var st = document.createElement('style');
  st.textContent = [
    '.clcta{max-width:760px;margin:40px auto;background:linear-gradient(135deg,#0e2a3d,#12324a);border-radius:16px;padding:32px 28px;color:#fff;text-align:center;font-family:"Noto Sans JP",sans-serif;box-shadow:0 12px 34px rgba(8,145,178,.18)}',
    '.clcta .e{font-size:12px;letter-spacing:.1em;font-weight:700;color:#7dd3e0;margin-bottom:8px}',
    '.clcta h3{font-size:21px;font-weight:900;margin:0 0 10px;color:#fff;line-height:1.5;font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif}',
    '.clcta p{font-size:14px;color:#d8e6ec;margin:0 auto 22px;max-width:560px;line-height:1.85}',
    '.clcta a{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(90deg,#22c1c3,#0891b2);color:#fff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;box-shadow:0 8px 20px rgba(8,145,178,.3);transition:transform .15s}',
    '.clcta a:hover{transform:translateY(-2px)}',
    '@media(max-width:560px){.clcta{margin:32px 16px;padding:26px 20px}.clcta h3{font-size:18px}}'
  ].join('');
  document.head.appendChild(st);

  var card = document.createElement('div');
  card.className = 'clcta';
  card.innerHTML =
    '<div class="e">無料・登録不要・その場で判定</div>' +
    '<h3>あなたの現場のムダ、どこに眠っていますか？</h3>' +
    '<p>記録・受付・請求・情報共有・シフトの5分野25項目でセルフ点検。チェックするとその場で判定と、まず着手すべき「優先ムダTOP3」がわかります。</p>' +
    '<a href="' + href + '" data-clcta="1">ムダ取りチェックシートで点検する →</a>';

  var anchor = document.querySelector('.back-section') || document.querySelector('footer');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor);
  else document.body.appendChild(card);

  card.querySelector('[data-clcta]').addEventListener('click', function () {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'column_checklist_cta', campaign: slug });
  });
})();
