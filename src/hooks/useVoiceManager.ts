import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { STTInputMode } from '@/contexts/SettingsContext';
import type { Session } from '@/types';
import { getSessionKey } from '@/types';
import { getSessionDisplayLabel } from '@/features/sessions/sessionKeys';
import { invalidatePhrasesCache, useVoiceInput } from '@/features/voice/useVoiceInput';

export interface UseVoiceManagerParams {
  currentSession: string | null;
  sessions: Session[];
  agentName: string;
  sttProvider: string;
  sttInputMode: STTInputMode;
  handleSendToSession: (sessionKey: string, text: string) => Promise<void>;
}

export function useVoiceManager({
  currentSession,
  sessions,
  agentName,
  sttProvider,
  sttInputMode,
  handleSendToSession,
}: UseVoiceManagerParams) {
  const [voiceLang, setVoiceLang] = useState('en');
  const [voicePhrasesVersion, setVoicePhrasesVersion] = useState(0);
  const [voiceOriginSessionKey, setVoiceOriginSessionKey] = useState<string | null>(null);
  const voiceOriginSessionKeyRef = useRef<string | null>(null);
  const [voiceStartedAt, setVoiceStartedAt] = useState<number | null>(null);
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);

  useEffect(() => {
    voiceOriginSessionKeyRef.current = voiceOriginSessionKey;
  }, [voiceOriginSessionKey]);

  useEffect(() => {
    let currentController: AbortController | null = null;

    const fetchLang = () => {
      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;

      fetch('/api/language', { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!controller.signal.aborted && data?.language) {
            setVoiceLang(data.language);
          }
        })
        .catch((err) => {
          if ((err as DOMException)?.name === 'AbortError') return;
        });
    };

    const handlePhrasesChanged = () => {
      invalidatePhrasesCache();
      setVoicePhrasesVersion((v) => v + 1);
    };

    fetchLang();
    window.addEventListener('nerve:language-changed', fetchLang);
    window.addEventListener('nerve:voice-phrases-changed', handlePhrasesChanged);
    return () => {
      window.removeEventListener('nerve:language-changed', fetchLang);
      window.removeEventListener('nerve:voice-phrases-changed', handlePhrasesChanged);
      currentController?.abort();
    };
  }, []);

  const effectiveSttInputMode = sttProvider === 'openai' ? 'local' : sttInputMode;
  const {
    voiceState,
    interimTranscript,
    startRecording,
    stopAndTranscribe,
    discardRecording,
    wakeWordEnabled: voiceWakeWordEnabled,
    toggleWakeWord,
    error: voiceError,
    clearError: clearVoiceError,
  } = useVoiceInput((text) => {
    const targetSessionKey = voiceOriginSessionKeyRef.current;
    if (!targetSessionKey) return;
    void handleSendToSession(targetSessionKey, `[voice] ${text}`);
  }, agentName, voiceLang, voicePhrasesVersion, effectiveSttInputMode);

  useEffect(() => {
    if (voiceState === 'recording' && voiceStartedAt === null) {
      const startedAt = Date.now();
      setVoiceStartedAt(startedAt);
      setVoiceElapsedMs(0);
      return;
    }

    if (voiceState === 'idle' || voiceState === 'listening') {
      setVoiceStartedAt(null);
      setVoiceElapsedMs(0);
      setVoiceOriginSessionKey(null);
    }
  }, [voiceStartedAt, voiceState]);

  useEffect(() => {
    if (voiceStartedAt === null || (voiceState !== 'recording' && voiceState !== 'transcribing')) return;

    const tick = () => setVoiceElapsedMs(Date.now() - voiceStartedAt);
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [voiceStartedAt, voiceState]);

  const handleStartPersistentRecording = useCallback(async () => {
    if (!currentSession) return;
    setVoiceOriginSessionKey(currentSession);
    await startRecording();
  }, [currentSession, startRecording]);

  const voiceOriginSessionLabel = useMemo(() => {
    if (!voiceOriginSessionKey) return null;
    const originSession = sessions.find((session) => getSessionKey(session) === voiceOriginSessionKey);
    if (originSession) return getSessionDisplayLabel(originSession, agentName);
    return voiceOriginSessionKey;
  }, [agentName, sessions, voiceOriginSessionKey]);

  return {
    voiceLang,
    voicePhrasesVersion,
    voiceOriginSessionKey,
    voiceOriginSessionKeyRef,
    voiceStartedAt,
    voiceElapsedMs,
    effectiveSttInputMode,
    voiceState,
    interimTranscript,
    startRecording,
    stopAndTranscribe,
    discardRecording,
    voiceWakeWordEnabled,
    toggleWakeWord,
    voiceError,
    clearVoiceError,
    handleStartPersistentRecording,
    voiceOriginSessionLabel,
  };
}
