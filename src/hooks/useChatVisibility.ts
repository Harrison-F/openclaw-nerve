import { useState, useEffect, useMemo } from 'react';
import { getSessionKey, type Session } from '@/types';

const CHAT_VISIBILITY_STORAGE_KEY = 'nerve-visible-chat-session-keys-v1';

export function useChatVisibility(
  currentSession: string | undefined,
  topLevelChats: Session[],
) {
  const [visibleChatKeys, setVisibleChatKeys] = useState<Set<string>>(() => new Set());
  const [chatVisibilityInitialized, setChatVisibilityInitialized] = useState(false);

  // Read from localStorage on init
  useEffect(() => {
    if (chatVisibilityInitialized) return;
    if (!currentSession) return;

    try {
      const raw = localStorage.getItem(CHAT_VISIBILITY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setVisibleChatKeys(new Set(parsed.filter((value): value is string => typeof value === 'string')));
          setChatVisibilityInitialized(true);
          return;
        }
      }
    } catch {
      // ignore storage parse failures and seed a fresh set below
    }

    setVisibleChatKeys(new Set([currentSession]));
    setChatVisibilityInitialized(true);
  }, [chatVisibilityInitialized, currentSession]);

  // Write to localStorage on change
  useEffect(() => {
    if (!chatVisibilityInitialized) return;
    try {
      localStorage.setItem(CHAT_VISIBILITY_STORAGE_KEY, JSON.stringify(Array.from(visibleChatKeys)));
    } catch {
      // ignore storage failures
    }
  }, [chatVisibilityInitialized, visibleChatKeys]);

  // Add currentSession to visible keys when it's a top-level chat
  useEffect(() => {
    if (!chatVisibilityInitialized || !currentSession) return;
    setVisibleChatKeys(prev => {
      const isCurrentTopLevel = topLevelChats.some((session) => getSessionKey(session) === currentSession);
      if (!isCurrentTopLevel || prev.has(currentSession)) return prev;
      const next = new Set(prev);
      next.add(currentSession);
      return next;
    });
  }, [chatVisibilityInitialized, currentSession, topLevelChats]);

  const visibleTopLevelChats = useMemo(() => {
    if (!chatVisibilityInitialized) return [];
    return topLevelChats.filter((session) => visibleChatKeys.has(getSessionKey(session)) || getSessionKey(session) === currentSession);
  }, [chatVisibilityInitialized, currentSession, topLevelChats, visibleChatKeys]);

  return { visibleChatKeys, visibleTopLevelChats };
}
