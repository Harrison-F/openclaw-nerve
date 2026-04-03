/* eslint-disable react-refresh/only-export-components -- hook intentionally co-located with provider */
import { createContext, useContext, useCallback, useState, useEffect, useMemo, type ReactNode } from 'react';
import { type ThemeName, applyTheme, themeNames } from '@/lib/themes';
import { type FontName, applyFont, fontNames } from '@/lib/fonts';

export interface AppearanceContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  font: FontName;
  setFont: (font: FontName) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
}

export const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const FONT_REFRESH_STORAGE_KEY = 'nerve:font-refresh-20260312';
const ALLOWED_FONT_SIZES = new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24]);
const ALLOWED_EDITOR_FONT_SIZES = new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24]);

function normalizeFontSize(size: number): number {
  return Number.isFinite(size) && ALLOWED_FONT_SIZES.has(size) ? size : 15;
}

function normalizeEditorFontSize(size: number): number {
  return Number.isFinite(size) && ALLOWED_EDITOR_FONT_SIZES.has(size) ? size : 13;
}

function resolveInitialFont(): FontName {
  const saved = localStorage.getItem('oc-font');
  const hasRefreshedFont = localStorage.getItem(FONT_REFRESH_STORAGE_KEY) === 'true';

  if (!hasRefreshedFont) {
    const shouldAdoptInstrumentSans =
      saved === null ||
      saved === 'inter' ||
      saved === 'system' ||
      saved === 'jetbrains-mono';

    localStorage.setItem(FONT_REFRESH_STORAGE_KEY, 'true');

    if (shouldAdoptInstrumentSans) {
      localStorage.setItem('oc-font', 'instrument-sans');
      return 'instrument-sans';
    }

    if (saved && fontNames.includes(saved as FontName)) {
      return saved as FontName;
    }
  }

  return saved && fontNames.includes(saved as FontName) ? saved as FontName : 'instrument-sans';
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('oc-theme') as ThemeName | null;
    return saved && themeNames.includes(saved) ? saved : 'ayu-dark';
  });
  const [font, setFontState] = useState<FontName>(resolveInitialFont);
  const [fontSize, setFontSizeState] = useState<number>(() => {
    const saved = localStorage.getItem('nerve:font-size');
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return normalizeFontSize(parsed);
  });
  const [editorFontSize, setEditorFontSizeState] = useState<number>(() => {
    const saved = localStorage.getItem('nerve:editor-font-size');
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return normalizeEditorFontSize(parsed);
  });

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { applyFont(font); }, [font]);
  useEffect(() => { document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`); }, [fontSize]);
  useEffect(() => { document.documentElement.style.setProperty('--editor-font-size', `${editorFontSize}px`); }, [editorFontSize]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem('oc-theme', newTheme);
  }, []);

  const setFont = useCallback((newFont: FontName) => {
    setFontState(newFont);
    localStorage.setItem('oc-font', newFont);
  }, []);

  const setFontSize = useCallback((size: number) => {
    const normalized = normalizeFontSize(size);
    setFontSizeState(normalized);
    localStorage.setItem('nerve:font-size', String(normalized));
  }, []);

  const setEditorFontSize = useCallback((size: number) => {
    const normalized = normalizeEditorFontSize(size);
    setEditorFontSizeState(normalized);
    localStorage.setItem('nerve:editor-font-size', String(normalized));
  }, []);

  const value = useMemo<AppearanceContextValue>(() => ({
    theme, setTheme, font, setFont, fontSize, setFontSize, editorFontSize, setEditorFontSize,
  }), [theme, setTheme, font, setFont, fontSize, setFontSize, editorFontSize, setEditorFontSize]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider');
  return ctx;
}
