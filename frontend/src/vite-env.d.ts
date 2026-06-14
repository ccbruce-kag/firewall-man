/// <reference types="vite/client" />

interface SneatMenuInstance {
  toggle: (el: Element) => void;
  update?: () => void;
}

interface Window {
  FWM_API_SCHEME?: string;
  FWM_API_HOST?: string;
  FWM_API_PORT?: string;
  currentLang?: string;
  currentPlatform?: string;
  currentProtocol?: string;
  i18n?: unknown;
  langOrder?: unknown;
  langNames?: unknown;
  Helpers?: {
    mainMenu?: SneatMenuInstance;
    scrollToActive: (animate: boolean) => void;
    toggleCollapsed: () => void;
    isMobileDevice?: () => boolean;
    isSmallScreen: () => boolean;
    setAutoUpdate: (enabled: boolean) => void;
  };
  Menu?: new (el: Element, opts: { orientation: string; closeChildren: boolean }) => SneatMenuInstance;
  PerfectScrollbar?: new (el: Element) => unknown;
  bootstrap?: {
    Tooltip: new (el: Element) => unknown;
  };
  setLanguage?: (lang: string) => void;
  loadIptables?: () => void;
}
