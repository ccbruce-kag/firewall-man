import { useEffect, useRef } from 'react'
import Layout from './components/Layout'
import type { LangCode } from './types'
import i18nData from './i18n'

const languageKey = "iptables_lang";
const storedLang = localStorage.getItem(languageKey);
const browserLang: LangCode = (() => {
  const l = (navigator.language || "en").toLowerCase();
  if (l.startsWith("zh")) return "zh";
  if (l.startsWith("ja")) return "ja";
  return "en";
})();
const langOrder: LangCode[] = ['zh', 'en', 'ja'];
const currentLang: LangCode = (storedLang as LangCode) || browserLang || 'zh';

Object.assign(window, {
  currentLang: langOrder.includes(currentLang) ? currentLang : 'zh',
  i18n: i18nData,
  langOrder,
  langNames: { zh: '中文', en: 'English', ja: '日本語' },
  currentProtocol: 'ipv4',
  currentPlatform: 'linux',
});

const SCRIPTS = [
  '/sneat/assets/vendor/libs/jquery/jquery.js',
  '/sneat/assets/vendor/libs/popper/popper.js',
  '/sneat/assets/vendor/js/bootstrap.js',
  '/sneat/assets/vendor/libs/perfect-scrollbar/perfect-scrollbar.js',
  '/sneat/assets/vendor/js/helpers.js',
  '/sneat/assets/js/config.js',
  '/sneat/assets/vendor/js/menu.js',
  '/sneat/libs/xterm/xterm.min.js',
  '/sneat/libs/xterm-addon-fit/xterm-addon-fit.min.js',
  '/app.js',
];

function loadScripts(urls: string[]): Promise<void> {
  return urls.reduce((p, src) => p.then(() => new Promise<void>((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { console.log('[boot] loaded:', src.split('/').pop()); resolve(); };
    s.onerror = () => { console.warn('[boot] fail (non-fatal):', src); resolve(); };
    document.body.appendChild(s);
  })), Promise.resolve());
}

function bootMenu() {
  const H = window.Helpers;
  const MC = window.Menu;
  if (!H || !MC) { console.warn('[boot] Helpers/Menu missing'); return; }

  document.querySelectorAll('#layout-menu').forEach((el) => {
    try {
      const m = new MC(el, { orientation: 'vertical', closeChildren: false });
      H.mainMenu = m;
      H.scrollToActive(false);
      el.querySelectorAll('.menu-toggle').forEach((toggle) => {
        if ((toggle as HTMLElement).dataset.fwmToggleBound === '1') return;
        (toggle as HTMLElement).dataset.fwmToggleBound = '1';
        toggle.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          m.toggle(toggle);
        });
      });
    } catch (e) { console.warn('[boot] Menu ctor:', e); }
  });

  document.querySelectorAll('.layout-menu-toggle').forEach((el) => {
    el.addEventListener('click', (e) => { e.preventDefault(); H.toggleCollapsed(); });
  });

  const menuEl = document.getElementById('layout-menu');
  if (menuEl) {
    let t: ReturnType<typeof setTimeout> | null = null;
    menuEl.onmouseenter = () => {
      t = setTimeout(() => document.querySelector('.layout-menu-toggle')?.classList.add('d-block'),
        H.isSmallScreen() ? 0 : 300);
    };
    menuEl.onmouseleave = () => {
      document.querySelector('.layout-menu-toggle')?.classList.remove('d-block');
      if (t) clearTimeout(t);
    };
  }

  const PerfectScrollbar = window.PerfectScrollbar;
  if (PerfectScrollbar) {
    document.querySelectorAll('.menu-inner').forEach((el) => {
      try { new PerfectScrollbar(el); } catch { /* */ }
    });
  }

  H.setAutoUpdate(true);

  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    try {
      if (window.bootstrap) new window.bootstrap.Tooltip(el);
    } catch { /* */ }
  });
}

function App() {
  const inited = useRef(false);

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;

    (async () => {
      const base = window.FWM_API_SCHEME
        ? `${window.FWM_API_SCHEME}://${window.FWM_API_HOST}:${window.FWM_API_PORT}`
        : '';
      const useProxy = !base || base.includes('localhost:10002') || base.includes('127.0.0.1:10002');

      try {
        const url = useProxy ? '/platform' : `${base}/platform`;
        const res = await fetch(url);
        const d = await res.json();
        window.currentPlatform = typeof d.data === 'string' ? d.data : (d.data?.platform || 'linux');
      } catch { /* */ }

      console.log('[boot] loading Sneat deps...', SCRIPTS.map(s=>s.split('/').pop()));
      await loadScripts(SCRIPTS);
      console.log('[boot] all Sneat deps loaded, Helpers=', typeof window.Helpers, 'Menu=', typeof window.Menu);

      console.log('[boot] initializing menu...');
      bootMenu();

      if (typeof window.setLanguage === 'function') {
        window.setLanguage(window.currentLang || 'zh');
      }
      if (typeof window.loadIptables === 'function') {
        setTimeout(() => window.loadIptables && window.loadIptables(), 200);
      }
    })();
  }, []);

  return <Layout />;
}

export default App
