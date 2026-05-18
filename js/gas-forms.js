(function () {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbweIGAPeJwD-U8D4Cks6fjGmp5hR2kpuwCx_9janRnGq3qdUFR4DDpYGgl33-bkFr3v/exec';

  /* ── スタイル注入 ── */
  var s = document.createElement('style');
  s.textContent = [
    '.gas-form{max-width:480px}',
    '.gas-form-group{margin-bottom:12px}',
    '.gas-form-group input,.gas-form-group select{width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:6px;font-size:14px;font-family:inherit;box-sizing:border-box}',
    '.gas-form-group input:focus,.gas-form-group select:focus{outline:none;border-color:#1a3f6f}',
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

      form.addEventListener('submit', function (e) {
        e.preventDefault();

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

        fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: fd })
          .catch(function () {})
          .finally(function () {
            /* GTM / GA4 イベント発火 */
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
              event: 'form_submit',
              form_type: form.dataset.formtype || 'unknown',
              page_name: form.dataset.page || ''
            });

            /* フォームを非表示にして Thanks を表示 */
            form.style.display = 'none';
            var thanks = form.nextElementSibling;
            if (thanks && thanks.classList.contains('gas-form-thanks')) {
              thanks.style.display = 'block';
            }
          });
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
