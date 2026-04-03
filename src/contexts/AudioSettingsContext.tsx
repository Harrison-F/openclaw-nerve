/* eslint-disable react-refresh/only-export-components -- hook intentionally co-located with provider */
import { createContext, useContext, useCallback, useRef, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useTTS, migrateTTSProvider, type TTSProvider } from '@/features/tts/useTTS';

export type STTProvider = 'local' | 'openai';
export type STTInputMode = 'browser' | 'local' | 'hybrid';

export interface AudioSettingsContextValue {
  soundEnabled: boolean;
  toggleSound: () => void;
  ttsProvider: TTSProvider;
  ttsModel: string;
  setTtsProvider: (provider: TTSProvider) => void;
  setTtsModel: (model: string) => void;
  toggleTtsProvider: () => void;
  sttProvider: STTProvider;
  setSttProvider: (provider: STTProvider) => void;
  sttInputMode: STTInputMode;
  setSttInputMode: (mode: STTInputMode) => void;
  sttModel: string;
  setSttModel: (model: string) => void;
  wakeWordEnabled: boolean;
  setWakeWordEnabled: (enabled: boolean) => void;
  handleToggleWakeWord: () => void;
  handleWakeWordState: (enabled: boolean, toggle: () => void) => void;
  liveTranscriptionPreview: boolean;
  toggleLiveTranscriptionPreview: () => void;
  speak: (text: string) => Promise<void>;
}

export const AudioSettingsContext = createContext<AudioSettingsContextValue | null>(null);

export function AudioSettingsProvider({ children }: { children: ReactNode }) {
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem('oc-sound') === 'true');
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>(() => migrateTTSProvider(localStorage.getItem('oc-tts-provider') || 'edge'));
  const [ttsModel, setTtsModelState] = useState(() => localStorage.getItem('oc-tts-model') || '');
  const [sttProvider, setSttProviderState] = useState<STTProvider>(() => {
    const saved = localStorage.getItem('oc-stt-provider') as STTProvider | null;
    return saved === 'openai' ? 'openai' : 'local';
  });
  const [sttInputMode, setSttInputModeState] = useState<STTInputMode>(() => {
    const saved = localStorage.getItem('nerve:sttInputMode') as STTInputMode | null;
    return saved === 'browser' || saved === 'local' || saved === 'hybrid' ? saved : 'hybrid';
  });
  const [sttModel, setSttModelState] = useState(() => localStorage.getItem('oc-stt-model') || 'base');
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [liveTranscriptionPreview, setLiveTranscriptionPreview] = useState(() => {
    const saved = localStorage.getItem('nerve:liveTranscriptionPreview');
    return saved === 'true';
  });
  const { speak } = useTTS(soundEnabled, ttsProvider, ttsModel || undefined);
  const wakeWordToggleRef = useRef<(() => void) | null>(null);

  // Sync STT settings to server on mount
  useEffect(() => {
    if (!sttProvider) return;
    fetch('/api/transcribe/config')
      .then(resp => resp.ok ? resp.json() : null)
      .then(data => {
        const serverProvider = data?.provider as STTProvider | undefined;
        const serverModel = typeof data?.model === 'string' ? data.model : '';

        if (serverModel && serverModel !== sttModel) {
          setSttModelState(serverModel);
          localStorage.setItem('oc-stt-model', serverModel);
        }

        if (serverProvider !== sttProvider) {
          return fetch('/api/transcribe/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: sttProvider }),
          });
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('oc-sound', String(next));
      return next;
    });
  }, []);

  const toggleLiveTranscriptionPreview = useCallback(() => {
    setLiveTranscriptionPreview(prev => {
      const next = !prev;
      localStorage.setItem('nerve:liveTranscriptionPreview', String(next));
      return next;
    });
  }, []);

  const changeTtsProvider = useCallback((provider: TTSProvider) => {
    setTtsProvider(provider);
    localStorage.setItem('oc-tts-provider', provider);
    setTtsModelState('');
    localStorage.setItem('oc-tts-model', '');
  }, []);

  const changeTtsModel = useCallback((model: string) => {
    setTtsModelState(model);
    localStorage.setItem('oc-tts-model', model);
  }, []);

  const changeSttProvider = useCallback((provider: STTProvider) => {
    setSttProviderState(provider);
    localStorage.setItem('oc-stt-provider', provider);
    fetch('/api/transcribe/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    }).catch(() => {});
  }, []);

  const changeSttInputMode = useCallback((mode: STTInputMode) => {
    setSttInputModeState(mode);
    localStorage.setItem('nerve:sttInputMode', mode);
  }, []);

  const changeSttModel = useCallback((model: string) => {
    setSttModelState(model);
    localStorage.setItem('oc-stt-model', model);
    fetch('/api/transcribe/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).catch(() => {});
  }, []);

  const toggleTtsProvider = useCallback(() => {
    setTtsProvider(prev => {
      const order: TTSProvider[] = ['openai', 'replicate', 'xiaomi', 'edge'];
      const next = order[(order.indexOf(prev) + 1) % order.length]!;
      localStorage.setItem('oc-tts-provider', next);
      return next;
    });
  }, []);

  const handleWakeWordState = useCallback((enabled: boolean, toggle: () => void) => {
    setWakeWordEnabled(enabled);
    wakeWordToggleRef.current = toggle;
  }, []);

  const handleToggleWakeWord = useCallback(() => {
    wakeWordToggleRef.current?.();
  }, []);

  const value = useMemo<AudioSettingsContextValue>(() => ({
    soundEnabled,
    toggleSound,
    ttsProvider,
    ttsModel,
    setTtsProvider: changeTtsProvider,
    setTtsModel: changeTtsModel,
    toggleTtsProvider,
    sttProvider,
    setSttProvider: changeSttProvider,
    sttInputMode,
    setSttInputMode: changeSttInputMode,
    sttModel,
    setSttModel: changeSttModel,
    wakeWordEnabled,
    setWakeWordEnabled,
    handleToggleWakeWord,
    handleWakeWordState,
    liveTranscriptionPreview,
    toggleLiveTranscriptionPreview,
    speak,
  }), [
    soundEnabled, toggleSound, ttsProvider, ttsModel, changeTtsProvider, changeTtsModel, toggleTtsProvider,
    sttProvider, changeSttProvider, sttInputMode, changeSttInputMode, sttModel, changeSttModel,
    wakeWordEnabled, handleToggleWakeWord, handleWakeWordState,
    liveTranscriptionPreview, toggleLiveTranscriptionPreview, speak,
  ]);

  return <AudioSettingsContext.Provider value={value}>{children}</AudioSettingsContext.Provider>;
}

export function useAudioSettings() {
  const ctx = useContext(AudioSettingsContext);
  if (!ctx) throw new Error('useAudioSettings must be used within AudioSettingsProvider');
  return ctx;
}
