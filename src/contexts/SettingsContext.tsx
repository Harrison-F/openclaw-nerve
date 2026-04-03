/* eslint-disable react-refresh/only-export-components -- hook intentionally co-located with provider */
import { type ReactNode } from 'react';
import { AudioSettingsProvider, useAudioSettings } from './AudioSettingsContext';
import { AppearanceProvider, useAppearance } from './AppearanceContext';
import { LayoutSettingsProvider, useLayoutSettings } from './LayoutSettingsContext';

// Re-export types for backward compatibility
export type { STTProvider, STTInputMode } from './AudioSettingsContext';

export function SettingsProvider({ children }: { children: ReactNode }) {
  return (
    <AudioSettingsProvider>
      <AppearanceProvider>
        <LayoutSettingsProvider>
          {children}
        </LayoutSettingsProvider>
      </AppearanceProvider>
    </AudioSettingsProvider>
  );
}

export function useSettings() {
  const audio = useAudioSettings();
  const appearance = useAppearance();
  const layout = useLayoutSettings();
  return { ...audio, ...appearance, ...layout };
}
