/* eslint-disable react-refresh/only-export-components -- hook intentionally co-located with provider */
import { createContext, useContext, useCallback, useRef, useEffect, useState, useMemo, type ReactNode } from 'react';
import { useGateway } from './GatewayContext';
import { getSessionKey, type Session, type AgentEventPayload, type ChatEventPayload, type EventPayload, type SessionsListResponse, type GatewayEvent, type GranularAgentState } from '@/types';
import { describeToolUse } from '@/utils/helpers';
import { buildSessionTree } from '@/features/sessions/sessionTree';
import {
  buildAgentRootSessionKey,
  getRootAgentSessionKey,
  getTopLevelAgentSessions,
  isSubagentSessionKey,
  isRootChildSession,
  pickDefaultSessionKey,
} from '@/features/sessions/sessionKeys';
import { buildSpawnSubagentMessage, type SubagentCleanupMode } from '@/features/sessions/buildSpawnSubagentMessage';
import { useAgentLog } from '@/hooks/useAgentLog';
import { useEventLog } from '@/hooks/useEventLog';

const BUSY_STATES = new Set(['running', 'thinking', 'tool_use', 'delta', 'started']);
const IDLE_STATES = new Set(['idle', 'done', 'error', 'final', 'aborted', 'completed']);

const SESSIONS_ACTIVE_MINUTES = 24 * 60;
const SESSIONS_LIMIT = 200;
const FULL_SESSIONS_LIMIT = 1000;
const SUBAGENT_DISCOVERY_TIMEOUT_MS = 60_000;
const SUBAGENT_DISCOVERY_POLL_MS = 1_000;
const CURRENT_SESSION_STORAGE_KEY = 'nerve-current-session';

export interface SpawnSessionOpts {
  kind: 'root' | 'subagent';
  task: string;
  model?: string;
  thinking?: string;
  label?: string;
  cleanup?: SubagentCleanupMode;
  agentName?: string;
  parentSessionKey?: string;
}

interface SessionContextValue {
  sessions: Session[];
  sessionsLoading: boolean;
  currentSession: string;
  setCurrentSession: (key: string) => void;
  busyState: Record<string, boolean>;
  agentStatus: Record<string, GranularAgentState>;
  unreadSessions: Record<string, boolean>;
  markSessionRead: (key: string) => void;
  abortSession: (sessionKey: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  deleteSession: (sessionKey: string) => Promise<void>;
  spawnSession: (opts: SpawnSessionOpts) => Promise<void>;
  renameSession: (sessionKey: string, label: string) => Promise<void>;
  updateSession: (sessionKey: string, updates: Partial<Session>) => void;
  agentLogEntries: import('@/types').AgentLogEntry[];
  eventEntries: import('@/types').EventEntry[];
  agentName: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { connectionState, rpc, subscribe } = useGateway();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [currentSession, setCurrentSessionRaw] = useState(() => {
    try { return localStorage.getItem(CURRENT_SESSION_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [agentStatus, setAgentStatus] = useState<Record<string, GranularAgentState>>({});
  const [agentName, setAgentName] = useState('Agent');
  const [unreadSessionKeys, setUnreadSessionKeys] = useState<Set<string>>(new Set());
  const doneTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const delayedRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busyState = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const [key, state] of Object.entries(agentStatus)) {
      result[key] = state.status !== 'IDLE' && state.status !== 'DONE';
    }
    return result;
  }, [agentStatus]);
  
  const unreadSessions = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const key of unreadSessionKeys) {
      result[key] = true;
    }
    return result;
  }, [unreadSessionKeys]);

  const markSessionRead = useCallback((key: string) => {
    setUnreadSessionKeys(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const setCurrentSession = useCallback((key: string) => {
    setCurrentSessionRaw(key);
    try {
      if (key) localStorage.setItem(CURRENT_SESSION_STORAGE_KEY, key);
      else localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    markSessionRead(key);
  }, [markSessionRead]);

  const fetchHiddenCronSessions = useCallback(async (activeMinutes: number, limit: number): Promise<Session[]> => {
    try {
      const params = new URLSearchParams({
        activeMinutes: String(activeMinutes),
        limit: String(limit),
      });
      const res = await fetch(`/api/sessions/hidden?${params.toString()}`);
      if (!res.ok) return [];
      const data = await res.json() as { ok?: boolean; sessions?: Session[] };
      return Array.isArray(data.sessions) ? data.sessions : [];
    } catch {
      return [];
    }
  }, []);

  const mergeSessionLists = useCallback((primary: Session[], supplemental: Session[]): Session[] => {
    if (supplemental.length === 0) return primary;
    const merged = [...primary];
    const seen = new Set(primary.map(getSessionKey));
    for (const session of supplemental) {
      const key = getSessionKey(session);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(session);
    }
    return merged;
  }, []);

  // Fetch agent name from server-info on mount
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/server-info', { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (data.agentName) {
          setAgentName(data.agentName);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          // silent fail - use default
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  
  const currentSessionRef = useRef(currentSession);
  useEffect(() => { currentSessionRef.current = currentSession; }, [currentSession]);

  const rpcRef = useRef(rpc);
  useEffect(() => { rpcRef.current = rpc; }, [rpc]);

  // Use extracted hooks
  const { agentLogEntries, feedAgentLog } = useAgentLog(sessionsRef, agentName, rpcRef);
  const { eventEntries, addEvent } = useEventLog();

  const findDescendantSessionKeys = useCallback((sessionKey: string, sourceSessions: Session[] = sessionsRef.current) => {
    const roots = buildSessionTree(sourceSessions);
    const queue = [...roots];
    let targetNode: (typeof roots)[number] | null = null;

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node.key === sessionKey) {
        targetNode = node;
        break;
      }
      queue.push(...node.children);
    }

    if (!targetNode) return [] as string[];

    const descendants: string[] = [];
    const collectPostOrder = (node: (typeof roots)[number]) => {
      for (const child of node.children) collectPostOrder(child);
      descendants.push(node.key);
    };
    for (const child of targetNode.children) collectPostOrder(child);

    return descendants;
  }, []);

  const listAuthoritativeSessions = useCallback(async () => {
    if (connectionState !== 'connected') return sessionsRef.current;
    try {
      const [res, hiddenCronSessions] = await Promise.all([
        rpc('sessions.list', { limit: FULL_SESSIONS_LIMIT }) as Promise<SessionsListResponse>,
        fetchHiddenCronSessions(24 * 60, FULL_SESSIONS_LIMIT),
      ]);
      return mergeSessionLists(res?.sessions ?? [], hiddenCronSessions);
    } catch (err) {
      console.debug('[SessionContext] Failed to fetch authoritative session list:', err);
      return sessionsRef.current;
    }
  }, [connectionState, fetchHiddenCronSessions, mergeSessionLists, rpc]);

  const setGranularStatus = useCallback((sessionKey: string, state: GranularAgentState) => {
    if (!sessionKey) return;
    if (doneTimeoutsRef.current[sessionKey]) {
      clearTimeout(doneTimeoutsRef.current[sessionKey]);
      delete doneTimeoutsRef.current[sessionKey];
    }
    if (state.status === 'DONE') {
      if (isSubagentSessionKey(sessionKey) && currentSessionRef.current !== sessionKey) {
        setUnreadSessionKeys(prev => {
          if (prev.has(sessionKey)) return prev;
          const next = new Set(prev);
          next.add(sessionKey);
          return next;
        });
      }
      doneTimeoutsRef.current[sessionKey] = setTimeout(() => {
        setAgentStatus(prev => {
          const current = prev[sessionKey];
          if (!current || current.status !== 'DONE') return prev;
          return { ...prev, [sessionKey]: { status: 'IDLE', since: Date.now() } };
        });
        delete doneTimeoutsRef.current[sessionKey];
      }, 3000);
    }
    setAgentStatus(prev => {
      const existing = prev[sessionKey];
      if (existing && existing.status === state.status && existing.toolName === state.toolName) return prev;
      return { ...prev, [sessionKey]: state };
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    if (connectionState !== 'connected') return;
    try {
      const newSessions = await listAuthoritativeSessions();
      const nextCurrentSession = pickDefaultSessionKey(newSessions, currentSessionRef.current);
      
      setSessions(prev => {
        if (prev.length !== newSessions.length) return newSessions;
        
        const prevMap = new Map(prev.map(s => [getSessionKey(s), s]));
        
        let hasChanges = false;
        const merged = newSessions.map(newSession => {
          const key = getSessionKey(newSession);
          const existing = prevMap.get(key);
          
          if (!existing) {
            hasChanges = true;
            return newSession;
          }
          
          const changed = (
            existing.state !== newSession.state ||
            existing.totalTokens !== newSession.totalTokens ||
            existing.contextTokens !== newSession.contextTokens ||
            existing.model !== newSession.model ||
            existing.thinking !== newSession.thinking ||
            existing.thinkingLevel !== newSession.thinkingLevel ||
            existing.label !== newSession.label ||
            existing.displayName !== newSession.displayName ||
            existing.parentId !== newSession.parentId
          );
          
          if (changed) {
            hasChanges = true;
            return newSession;
          }
          
          return existing;
        });
        
        return hasChanges ? merged : prev;
      });
      try {
        if (nextCurrentSession) localStorage.setItem(CURRENT_SESSION_STORAGE_KEY, nextCurrentSession);
        else localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
      setCurrentSessionRaw(nextCurrentSession);
    } catch (err) {
      console.debug('[SessionContext] Failed to refresh sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  }, [connectionState, listAuthoritativeSessions]);

  const updateSessionFromEvent = useCallback((sessionKey: string, updates: Partial<Session>) => {
    setSessions(prev => {
      const idx = prev.findIndex(s => getSessionKey(s) === sessionKey);
      if (idx === -1) {
        setTimeout(() => refreshSessions(), 100);
        return prev;
      }
      
      const existing = prev[idx];
      const hasChanges = Object.entries(updates).some(
        ([key, value]) => existing[key as keyof Session] !== value
      );
      
      if (!hasChanges) return prev;
      
      return prev.map((s, i) => {
        if (i !== idx) return s;
        return { ...s, ...updates, lastActivity: Date.now() };
      });
    });
  }, [refreshSessions]);

  const extractSessionUpdates = useCallback((state: string | undefined, payload: AgentEventPayload | ChatEventPayload): Partial<Session> => {
    const updates: Partial<Session> = {};
    if (state) updates.state = state;
    if ('totalTokens' in payload && typeof payload.totalTokens === 'number') updates.totalTokens = payload.totalTokens;
    if ('contextTokens' in payload && typeof payload.contextTokens === 'number') updates.contextTokens = payload.contextTokens;
    return updates;
  }, []);

  const scheduleDelayedRefresh = useCallback(() => {
    if (delayedRefreshTimeoutRef.current) {
      clearTimeout(delayedRefreshTimeoutRef.current);
    }
    delayedRefreshTimeoutRef.current = setTimeout(() => {
      delayedRefreshTimeoutRef.current = null;
      refreshSessions();
    }, 1500);
  }, [refreshSessions]);

  // Subscribe to gateway events
  useEffect(() => {
    const unsub = subscribe((msg: GatewayEvent) => {
      const evt = msg.event;
      const p = (msg.payload || {}) as EventPayload;

      addEvent(msg);

      if ((evt === 'agent' || evt === 'chat') && p.sessionKey) {
        const sk = p.sessionKey;
        const typedPayload = evt === 'agent'
          ? (msg.payload || {}) as AgentEventPayload
          : (msg.payload || {}) as ChatEventPayload;

        if (evt === 'agent') {
          const ap = typedPayload as AgentEventPayload;

          if (ap.stream === 'lifecycle') {
            const phase = (ap.data as Record<string, unknown> | undefined)?.phase;
            if (phase === 'start') {
              setGranularStatus(sk, { status: 'THINKING', since: Date.now() });
            } else if (phase === 'end') {
              setGranularStatus(sk, { status: 'DONE', since: Date.now() });
              refreshSessions();
              scheduleDelayedRefresh();
            } else if (phase === 'error') {
              setGranularStatus(sk, { status: 'ERROR', since: Date.now() });
              refreshSessions();
            }
          } else if (ap.stream === 'tool' && ap.data) {
            if (ap.data.phase === 'start' && ap.data.name) {
              const toolDesc = describeToolUse(ap.data.name, ap.data.args || {});
              setGranularStatus(sk, {
                status: 'THINKING',
                toolName: ap.data.name,
                toolDescription: toolDesc || undefined,
                since: Date.now(),
              });
            } else if (ap.data.phase === 'result') {
              setGranularStatus(sk, { status: 'THINKING', since: Date.now() });
            }
          } else if (ap.stream === 'assistant') {
            setGranularStatus(sk, { status: 'STREAMING', since: Date.now() });
          }
        }

        if (evt === 'chat') {
          const cp = typedPayload as ChatEventPayload;
          const state = cp.state || '';

          if (state === 'started') {
            setGranularStatus(sk, { status: 'THINKING', since: Date.now() });
          } else if (state === 'delta') {
            setGranularStatus(sk, { status: 'STREAMING', since: Date.now() });
          } else if (state === 'final') {
            setGranularStatus(sk, { status: 'DONE', since: Date.now() });
            refreshSessions();
            scheduleDelayedRefresh();
          } else if (state === 'error') {
            setGranularStatus(sk, { status: 'ERROR', since: Date.now() });
          } else if (state === 'aborted') {
            setGranularStatus(sk, { status: 'IDLE', since: Date.now() });
          }
        }

        const state = evt === 'agent'
          ? ((typedPayload as AgentEventPayload).state || (typedPayload as AgentEventPayload).agentState || '')
          : ((typedPayload as ChatEventPayload).state || '');

        if (evt === 'agent' && !(typedPayload as AgentEventPayload).stream) {
          if (BUSY_STATES.has(state)) {
            setGranularStatus(sk, { status: 'THINKING', since: Date.now() });
          } else if (IDLE_STATES.has(state)) {
            if (state === 'error') {
              setGranularStatus(sk, { status: 'ERROR', since: Date.now() });
            } else if (state === 'aborted') {
              setGranularStatus(sk, { status: 'IDLE', since: Date.now() });
            } else {
              setGranularStatus(sk, { status: 'DONE', since: Date.now() });
            }
            if (state === 'final' || state === 'done' || state === 'completed') {
              refreshSessions();
            }
          }
        }

        const updates = extractSessionUpdates(state || undefined, typedPayload);
        if (Object.keys(updates).length > 0) {
          updateSessionFromEvent(sk, updates);
        }
      }

      feedAgentLog(evt, p);
    });

    return () => {
      unsub();
      for (const key of Object.keys(doneTimeoutsRef.current)) {
        clearTimeout(doneTimeoutsRef.current[key]);
      }
      doneTimeoutsRef.current = {};
      if (delayedRefreshTimeoutRef.current) {
        clearTimeout(delayedRefreshTimeoutRef.current);
        delayedRefreshTimeoutRef.current = null;
      }
    };
  }, [subscribe, addEvent, setGranularStatus, feedAgentLog, updateSessionFromEvent, extractSessionUpdates, refreshSessions, scheduleDelayedRefresh]);

  // Poll sessions when connected
  useEffect(() => {
    if (connectionState !== 'connected') return;
    refreshSessions();
    const iv = setInterval(() => refreshSessions(), 30000);
    return () => clearInterval(iv);
  }, [connectionState, refreshSessions]);

  const deleteSession = useCallback(async (sessionKey: string) => {
    const authoritativeSessions = await listAuthoritativeSessions();
    const descendants = findDescendantSessionKeys(sessionKey, authoritativeSessions);
    const keysToDelete = [...descendants, sessionKey];
    const shouldReplaceCurrent = keysToDelete.includes(currentSessionRef.current);
    const remaining = sessionsRef.current.filter(s => !keysToDelete.includes(getSessionKey(s)));
    const nextCurrentSession = shouldReplaceCurrent ? pickDefaultSessionKey(remaining) : currentSessionRef.current;

    for (const key of keysToDelete) {
      await rpc('sessions.delete', { key, deleteTranscript: true });
    }

    setSessions(prev => prev.filter(s => !keysToDelete.includes(getSessionKey(s))));
    setUnreadSessionKeys(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const key of keysToDelete) next.delete(key);
      return next;
    });
    if (shouldReplaceCurrent) {
      if (nextCurrentSession) {
        setCurrentSession(nextCurrentSession);
      } else {
        try { localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY); } catch { /* ignore */ }
        setCurrentSessionRaw('');
      }
    }
  }, [findDescendantSessionKeys, listAuthoritativeSessions, rpc, setCurrentSession]);

  const spawnSession = useCallback(async (opts: SpawnSessionOpts) => {
    const authoritativeSessions = await listAuthoritativeSessions();
    const before = new Set(authoritativeSessions.map(getSessionKey));

    if (opts.kind === 'root') {
      const rootName = opts.agentName?.trim();
      if (!rootName) throw new Error('Agent name is required');

      const sessionKey = buildAgentRootSessionKey(
        rootName,
        authoritativeSessions.map(getSessionKey),
      );
      const thinkingLevel = opts.thinking && opts.thinking !== 'off' ? opts.thinking : null;

      await rpc('sessions.patch', {
        key: sessionKey,
        label: rootName,
        model: opts.model,
        thinkingLevel,
      });

      const idempotencyKey = `spawn-root-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (opts.task.trim()) {
        await rpc('chat.send', {
          sessionKey,
          message: opts.task,
          deliver: false,
          idempotencyKey,
        });
      }

      await refreshSessions();
      setCurrentSession(sessionKey);
      return;
    }

    const fallbackRootSession = getTopLevelAgentSessions(sessionsRef.current)[0];
    const parentSessionKey = opts.parentSessionKey
      || getRootAgentSessionKey(currentSessionRef.current)
      || (fallbackRootSession ? getSessionKey(fallbackRootSession) : '');
    if (!parentSessionKey) {
      throw new Error('Create a top-level agent before launching a subagent');
    }
    const message = buildSpawnSubagentMessage({
      task: opts.task,
      label: opts.label,
      model: opts.model,
      thinking: opts.thinking,
      cleanup: opts.cleanup,
    });
    const idempotencyKey = `spawn-subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await rpc('chat.send', { sessionKey: parentSessionKey, message, idempotencyKey });

    const deadline = Date.now() + SUBAGENT_DISCOVERY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await rpc('sessions.list', { activeMinutes: SESSIONS_ACTIVE_MINUTES, limit: SESSIONS_LIMIT }) as SessionsListResponse;
        const fresh = res?.sessions ?? [];
        const newSession = fresh.find((session) => {
          const sessionKey = getSessionKey(session);
          return isSubagentSessionKey(sessionKey) && isRootChildSession(sessionKey, parentSessionKey) && !before.has(sessionKey);
        });
        if (newSession) {
          await refreshSessions();
          setCurrentSession(getSessionKey(newSession));
          return;
        }
      } catch { /* keep polling */ }
      await new Promise(r => setTimeout(r, SUBAGENT_DISCOVERY_POLL_MS));
    }
    await refreshSessions();
    throw new Error('Timed out waiting for the new subagent session to appear');
  }, [listAuthoritativeSessions, rpc, refreshSessions, setCurrentSession]);

  const renameSession = useCallback(async (sessionKey: string, label: string) => {
    await rpc('sessions.patch', { key: sessionKey, label });
    updateSessionFromEvent(sessionKey, { label });
  }, [rpc, updateSessionFromEvent]);

  const abortSession = useCallback(async (sessionKey: string) => {
    try {
      await rpc('chat.abort', { sessionKey });
    } catch (err) {
      console.error('[SessionContext] Failed to abort session:', err);
    }
  }, [rpc]);

  const value = useMemo<SessionContextValue>(() => ({
    sessions,
    sessionsLoading,
    currentSession,
    setCurrentSession,
    busyState,
    agentStatus,
    unreadSessions,
    markSessionRead,
    abortSession,
    refreshSessions,
    deleteSession,
    spawnSession,
    renameSession,
    updateSession: updateSessionFromEvent,
    agentLogEntries,
    eventEntries,
    agentName,
  }), [
    sessions, sessionsLoading, currentSession, setCurrentSession, busyState, agentStatus,
    unreadSessions, markSessionRead,
    abortSession, refreshSessions, deleteSession, spawnSession, renameSession,
    updateSessionFromEvent, agentLogEntries, eventEntries, agentName,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSessionContext must be used within SessionProvider');
  return ctx;
}
