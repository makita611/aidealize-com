(function () {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbweIGAPeJwD-U8D4Cks6fjGmp5hR2kpuwCx_9janRnGq3qdUFR4DDpYGgl33-bkFr3v/exec';

  /* ── スタイル注入 ── */
  var s = document.createElement('style');
  s.textContent = [
    '.gas-form{max-width:480px}',
    '.gas-hp-field{position:absolute!important;left:-9999px!important;top:-9999px!important;width:1px;height:1px;opacity:0;overflow:hidden}',
    '.gas-form-group{margin-bottom:12px}',
    '.gas-form-group input,.gas-form-group select,.gas-form-group textarea{width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:6px;font-size:16px;font-family:inherit;box-sizing:border-box}',
    '.gas-form-group textarea{min-height:84px;resize:vertical;line-height:1.6}',
    '.gas-form-group input:focus,.gas-form-group select:focus,.gas-form-group textarea:focus{outline:none;border-color:#1a3f6f}',
    '.gas-radio-group{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0}',
    '.gas-radio-group label{display:inline-flex;align-items:center;padding:7px 16px;border:1.5px solid #ddd;border-radius:20px;font-size:13px;cursor:pointer;transition:all .15s;user-select:none}',
    '.gas-radio-group label:hover{border-color:#999}',
    '.gas-radio-group label:has(input:checked){border-color:#1a3f6f;background:#eef3fa;font-weight:700;color:#1a3f6f}',
    '.gas-radio-group label input[type="radio"]{display:none}',
    '.gas-form-btn{width:100%;padding:14px;border:none;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .2s;margin-top:4px}',
    '.gas-form-btn:hover{opacity:.85}',
    '.gas-form-btn:disabled{opacity:.6;cursor:not-allowed}',
    '.gas-form-thanks{padding:24px 20px;background:#f0f8f0;border:1px solid #4caf50;border-radius:8px;text-align:center;line-height:1.8}',
    '.gas-form-thanks p{font-size:15px;color:#333}',
    '.gas-form-note{font-size:12px;color:#888;margin-top:10px;line-height:1.7}'
  ].join('');
  document.head.appendChild(s);

  /* ── フォームへのイベントバインド ── */
  function bindForms() {
    document.querySelectorAll('.gas-form').forEach(function (form) {
      if (form.dataset.gasBound) return; // 二重バインド防止
      form.dataset.gasBound = '1';

      /* ── ハニーポット（ボット対策）──
         人間には見えない隠しフィールドを注入。自動入力ボットがここを埋めたら
         送信したフリだけして GAS には送らない（スパム弾き）。
         併せて「表示から3秒未満の即送信」も人間離れとして弾く。 */
      var hp = document.createElement('input');
      hp.type = 'text';
      hp.name = 'website_confirm';        // ボットが好む“URL/website”系の餌名
      hp.className = 'gas-hp-field';
      hp.tabIndex = -1;
      hp.setAttribute('autocomplete', 'off');
      hp.setAttribute('aria-hidden', 'true');
      form.appendChild(hp);
      form.dataset.gasReady = String(Date.now());

      form.addEventListener('submit', function (e) {
        e.preventDefault();

        /* ハニーポットに文字が入っている or 表示3秒未満の即送信 → ボット判定 */
        var elapsed = Date.now() - (parseInt(form.dataset.gasReady, 10) || 0);
        if (hp.value || elapsed < 3000) {
          var t = form.nextElementSibling; // 送信したフリ（ボットに気づかせない）
          form.style.display = 'none';
          if (t && t.classList.contains('gas-form-thanks')) t.style.display = 'block';
          return; // GAS には送らない
        }

        var btn = form.querySelector('.gas-form-btn');
        btn.disabled = true;
        btn.textContent = '送信中...';

        var fd = new FormData(form);
        fd.append('page', form.dataset.page || document.title);
        fd.append('form_type', form.dataset.formtype || '');

        /* ラジオ未選択の場合 data-formtype をフォールバック */
        if (!fd.get('request')) {
          fd.append('request', form.dataset.formtype || '');
        }

        /* 2秒でタイムアウト → 長い「送信中」を防止 */
        var done = false;
        function showThanks() {
          if (done) return;
          done = true;
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            event: 'form_submit',
            form_type: form.dataset.formtype || 'unknown',
            page_name: form.dataset.page || ''
          });
          form.style.display = 'none';
          var thanks = form.nextElementSibling;
          if (thanks && thanks.classList.contains('gas-form-thanks')) {
            thanks.style.display = 'block';
          }
        }

        setTimeout(showThanks, 2000); /* 2秒後に強制表示 */

        fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: fd })
          .catch(function () {})
          .finally(showThanks);
      });
    });
  }

  /* DOM ready チェック（スクリプト位置問わず確実に動作） */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindForms);
  } else {
    bindForms();
  }
})();
