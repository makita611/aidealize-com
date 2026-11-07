/* cta_click: ボタン/リンクのクリック位置・種類をGTM経由でGA4へ送る（lead-capture.js と同一内容・二重送信防止ガード付き） */
(function () {
  if (window.__ctaTrack) return; window.__ctaTrack = 1;
  window.dataLayer = window.dataLayer || [];
  function ctaType(a) {
    var h = a.getAttribute('href') || '';
    if (/lin\.ee|line\.me/.test(h)) return 'line';
    if (/^tel:/.test(h)) return 'tel';
    if (/^mailto:/.test(h)) return 'mail';
    if (/#contact|\/contact/.test(h)) return 'contact';
    if (/site-check|shindan|security-scan|ROI|\/tools\//i.test(h)) return 'tool';
    if (/\/lp\//.test(h)) return 'lp';
    if (/\/service\//.test(h)) return 'service';
    if (/\/works\//.test(h)) return 'works';
    if (/\/column\//.test(h)) return 'column';
    if (/\/bpr\/|\/company/.test(h)) return 'company';
    return '';
  }
  function position(a) {
    if (a.closest('.lcbar')) return 'lead_bar';
    if (a.closest('#mainNav,header')) return a.classList.contains('nav-cta') ? 'header_cta' : 'header';
    if (a.closest('footer')) return 'footer';
    if (a.closest('.float-cta,.floating,[class*=float]')) return 'floating';
    if (a.closest('.hero')) return 'hero';
    if (a.closest('.cta-section')) return 'bottom_cta';
    if (a.closest('.column-section,.column-topics')) return 'column_block';
    if (a.closest('article,.article-body')) return 'article';
    var s = a.closest('section[id]');
    return s ? ('sec_' + s.id) : 'other';
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var type = ctaType(a); if (!type) return;
    window.dataLayer.push({
      event: 'cta_click', cta_type: type, item_label: position(a),
      link_url: (a.href || '').slice(0, 100),
      click_text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
      page_path: location.pathname
    });
  }, true);
})();
