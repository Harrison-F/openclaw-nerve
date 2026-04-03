import { useCallback, useRef, useState, useEffect } from 'react';
import { getSessionKey, type Session, type AgentLogEntry, type EventPayload, type AgentEventPayload, type ContentBlock, type ChatMessage, type ChatHistoryResponse } from '@/types';
import { describeToolUse } from '@/utils/helpers';
import {
  getSessionDisplayLabel,
  isSubagentSessionKey,
  isTopLevelAgentSessionKey,
} from '@/features/sessions/sessionKeys';

export function useAgentLog(
  sessionsRef: React.RefObject<Session[]>,
  agentName: string,
  rpcRef: React.RefObject<((method: string, params?: Record<string, unknown>) => Promise<unknown>) | null>,
) {
  const [agentLogEntries, setAgentLogEntries] = useState<AgentLogEntry[]>([]);
  const logStateRef = useRef<Record<string, boolean>>({});
  const toolSeenRef = useRef<Map<string, number>>(new Map());

  const shouldLogTool = useCallback((toolId: string) => {
    if (!toolId) return false;
    const now = Date.now();
    const map = toolSeenRef.current;
    const DEDUP_MS = 5 * 60 * 1000;
    const last = map.get(toolId);
    if (last && now - last < DEDUP_MS) return false;
    map.set(toolId, now);
    if (map.size > 500) {
      for (const [key, ts] of map) {
        if (now - ts > DEDUP_MS) map.delete(key);
      }
    }
    return true;
  }, []);

  const addAgentLogEntry = useCallback((icon: string, text: string) => {
    const entry: AgentLogEntry = { icon, text, ts: Date.now() };
    setAgentLogEntries(prev => [entry, ...prev].slice(0, 100));
    fetch('/api/agentlog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    }).catch(() => {});
  }, []);

  const friendlyName = useCallback((sk: string) => {
    if (!sk) return 'unknown';
    const sess = sessionsRef.current.find(s => getSessionKey(s) === sk);
    if (sess) return getSessionDisplayLabel(sess, agentName);
    if (isSubagentSessionKey(sk)) return 'sub-agent ' + sk.split(':').pop()?.slice(0, 8);
    return sk.split(':').pop() || sk;
  }, [agentName, sessionsRef]);

  const feedAgentLog = useCallback((evt: string, p: EventPayload) => {
    const sk = p.sessionKey || '';
    const name = friendlyName(sk);
    const isSubagent = isSubagentSessionKey(sk);
    const isMain = isTopLevelAgentSessionKey(sk);

    const processToolBlocks = (blocks: ContentBlock[]) => {
      for (const block of blocks) {
        if (block.type !== 'tool_use' && block.type !== 'toolCall') continue;
        if (!block.name) continue;
        let toolInput: Record<string, unknown> = typeof block.input === 'object' && block.input ? block.input : {};
        if (!toolInput || Object.keys(toolInput).length === 0) {
          const args = block.arguments;
          if (typeof args === 'string') {
            try { toolInput = JSON.parse(args); } catch { toolInput = {}; }
          } else if (typeof args === 'object' && args) {
            toolInput = args;
          }
        }
        const toolId = String(block.id || block.toolCallId || block.name);
        if (shouldLogTool(toolId)) {
          const desc = describeToolUse(block.name, toolInput);
          if (desc) addAgentLogEntry('🔧', desc);
        }
      }
    };

    const processMessages = (msgs: ChatMessage[]) => {
      for (const m of msgs) {
        if (m.role === 'assistant' && Array.isArray(m.content)) {
          processToolBlocks(m.content as ContentBlock[]);
        }
      }
    };

    if (evt === 'agent') {
      const ap = p as AgentEventPayload;
      if (ap.stream === 'lifecycle') {
        const phase = (ap.data as Record<string, unknown> | undefined)?.phase;
        if (phase === 'start') {
          logStateRef.current['_conv_' + sk] = true;
          addAgentLogEntry(isMain ? '🧠' : '⚡', isMain ? 'thinking…' : isSubagent ? 'spawned ' + name : name + ' started');
        } else if (phase === 'end') {
          addAgentLogEntry(isMain ? '✦' : '✅', isMain ? 'finished response' : name + ' completed');
          delete logStateRef.current['_conv_' + sk];
        } else if (phase === 'error') {
          addAgentLogEntry('❌', isMain ? 'generation failed' : name + ' failed');
          delete logStateRef.current['_conv_' + sk];
        }
        return;
      }
    }

    if (evt === 'chat') {
      if ((p.state === 'delta' || p.state === 'started') && !logStateRef.current['_conv_' + sk]) {
        logStateRef.current['_conv_' + sk] = true;
        addAgentLogEntry(isMain ? '🧠' : '⚡', isMain ? 'thinking…' : isSubagent ? 'spawned ' + name : name + ' started');
      }
      if (Array.isArray(p.content)) processToolBlocks(p.content as ContentBlock[]);
      if (Array.isArray(p.messages)) processMessages(p.messages as ChatMessage[]);
      if (p.state === 'final') {
        if (sk && rpcRef.current) {
          rpcRef.current('chat.history', { sessionKey: sk, limit: 10 })
            .then((res: unknown) => processMessages((res as ChatHistoryResponse)?.messages || []))
            .catch(() => {});
        }
        addAgentLogEntry(isMain ? '✦' : '✅', isMain ? 'finished response' : name + ' completed');
        delete logStateRef.current['_conv_' + sk];
      } else if (p.state === 'error' || p.state === 'aborted') {
        const icon = p.state === 'error' ? '❌' : '⛔';
        const verb = p.state === 'error' ? 'failed' : 'aborted';
        addAgentLogEntry(icon, isMain ? (p.state === 'error' ? 'generation failed' : 'response aborted') : name + ' ' + verb);
        delete logStateRef.current['_conv_' + sk];
      }
    } else if (evt === 'cron') {
      addAgentLogEntry('⏰', 'cron: ' + (p.name || 'scheduled task fired'));
    } else if (evt === 'connect.challenge') {
      addAgentLogEntry('🔗', 'connected to gateway');
    } else if (evt.includes('error')) {
      addAgentLogEntry('❌', (typeof p.message === 'string' ? p.message : p.error) || 'something went wrong');
    } else if (evt === 'exec.approval.request') {
      addAgentLogEntry('🔐', 'requesting exec approval');
    } else if (evt === 'exec.approval.resolved') {
      addAgentLogEntry('🔓', 'exec approved');
    }
  }, [addAgentLogEntry, friendlyName, shouldLogTool, rpcRef]);

  // Load agent log on mount
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/agentlog', { signal: controller.signal });
        const entries: AgentLogEntry[] = await res.json();
        setAgentLogEntries(entries.slice().reverse().slice(0, 100));
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.debug('[useAgentLog] Failed to load agent log:', err.message);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  return { agentLogEntries, addAgentLogEntry, feedAgentLog, shouldLogTool };
}
