    function bindMenuToggleFallback(menu) {
      var root = document.querySelector('#layout-menu');
      if (!root || !menu) return;
      root.querySelectorAll('.menu-toggle').forEach(function (toggle) {
        if (toggle.dataset.fwmToggleBound === '1') return;
        toggle.dataset.fwmToggleBound = '1';
        toggle.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          menu.toggle(toggle);
          console.log('[menu] toggle', toggle.textContent.trim());
        });
      });
      console.log('[menu] fallback bound', root.querySelectorAll('.menu-toggle').length);
    }

    // Re-init menu after DOM ready, or immediately when app.js is loaded late by React.
    function initMenuFallback() {
      if (typeof Menu !== 'undefined') {
        const el = document.querySelector('#layout-menu');
        if (el) bindMenuToggleFallback(new Menu(el, { orientation: 'vertical', closeChildren: false }));
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initMenuFallback);
    } else {
      initMenuFallback();
    }
  
