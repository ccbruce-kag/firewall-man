export interface I18nDict {
  [key: string]: string;
}

export interface I18nData {
  zh: I18nDict;
  en: I18nDict;
  ja: I18nDict;
}

export interface TabItem {
  id: string;
}

export interface TabState {
  tabs: TabItem[];
  activeId: string | null;
}

export type LangCode = 'zh' | 'en' | 'ja';

export const LANG_ORDER: LangCode[] = ['zh', 'en', 'ja'];
export const LANG_NAMES: Record<LangCode, string> = { zh: '中文', en: 'English', ja: '日本語' };
