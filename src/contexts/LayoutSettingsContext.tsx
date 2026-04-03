/* eslint-disable react-refresh/only-export-components -- hook intentionally co-located with provider */
import { createContext, useContext, useCallback, useState, useMemo, type ReactNode } from 'react';

export interface LayoutSettingsContextValue {
  panelRatio: number;
  setPanelRatio: (ratio: number) => void;
  telemetryVisible: boolean;
  toggleTelemetry: () => void;
  eventsVisible: boolean;
  toggleEvents: () => void;
  logVisible: boolean;
  toggleLog: () => void;
}

export const LayoutSettingsContext = createContext<LayoutSettingsContextValue | null>(null);

export function LayoutSettingsProvider({ children }: { children: ReactNode }) {
  const [panelRatio, setPanelRatioState] = useState(() => {
    const saved = localStorage.getItem('oc-panel-ratio');
    return saved ? Number(saved) : 75;
  });
  const [telemetryVisible, setTelemetryVisible] = useState(() => {
    const saved = localStorage.getItem('oc-telemetry-visible');
    return saved !== 'false';
  });
  const [eventsVisible, setEventsVisible] = useState(() => {
    return localStorage.getItem('nerve:showEvents') === 'true';
  });
  const [logVisible, setLogVisible] = useState(() => {
    return localStorage.getItem('nerve:showLog') === 'true';
  });

  const setPanelRatio = useCallback((ratio: number) => {
    setPanelRatioState(ratio);
    localStorage.setItem('oc-panel-ratio', String(ratio));
  }, []);

  const toggleTelemetry = useCallback(() => {
    setTelemetryVisible(prev => {
      const next = !prev;
      localStorage.setItem('oc-telemetry-visible', String(next));
      return next;
    });
  }, []);

  const toggleEvents = useCallback(() => {
    setEventsVisible(prev => {
      const next = !prev;
      localStorage.setItem('nerve:showEvents', String(next));
      return next;
    });
  }, []);

  const toggleLog = useCallback(() => {
    setLogVisible(prev => {
      const next = !prev;
      localStorage.setItem('nerve:showLog', String(next));
      return next;
    });
  }, []);

  const value = useMemo<LayoutSettingsContextValue>(() => ({
    panelRatio, setPanelRatio, telemetryVisible, toggleTelemetry,
    eventsVisible, toggleEvents, logVisible, toggleLog,
  }), [panelRatio, setPanelRatio, telemetryVisible, toggleTelemetry, eventsVisible, toggleEvents, logVisible, toggleLog]);

  return <LayoutSettingsContext.Provider value={value}>{children}</LayoutSettingsContext.Provider>;
}

export function useLayoutSettings() {
  const ctx = useContext(LayoutSettingsContext);
  if (!ctx) throw new Error('useLayoutSettings must be used within LayoutSettingsProvider');
  return ctx;
}
