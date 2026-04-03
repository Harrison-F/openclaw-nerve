import { useCallback, useState } from 'react';
import { type EventEntry, type GatewayEvent, type EventPayload, type AgentEventPayload } from '@/types';

export function useEventLog() {
  const [eventEntries, setEventEntries] = useState<EventEntry[]>([]);

  const addEvent = useCallback((msg: GatewayEvent) => {
    const evt = msg.event || 'response';
    const p = (msg.payload || {}) as EventPayload;

    const chatStateDescs: Record<string, string> = {
      delta: 'Response streaming', final: 'Response complete',
      error: 'Chat error', aborted: 'Response aborted',
    };

    let badge = 'SYSTEM', badgeCls = 'badge-system', desc = evt;

    if (evt.startsWith('chat')) {
      badge = 'CHAT'; badgeCls = 'badge-chat';
      desc = chatStateDescs[p.state || ''] || (p.sessionKey ? 'Message from ' + p.sessionKey : 'Chat event');
    } else if (evt.startsWith('agent')) {
      badge = 'AGENT'; badgeCls = 'badge-agent';
      const ap = p as AgentEventPayload;
      if (ap.stream === 'lifecycle') {
        const phase = String((ap.data as Record<string, unknown> | undefined)?.phase || '');
        desc = 'Agent lifecycle: ' + (phase || 'unknown');
      } else if (ap.stream === 'assistant') {
        desc = 'Agent assistant output';
      } else {
        const state = p.state || p.agentState || '';
        desc = state ? 'Agent state: ' + state : 'Agent event';
      }
    } else if (evt.startsWith('cron')) {
      badge = 'CRON'; badgeCls = 'badge-cron';
      desc = p.name ? 'Cron job: ' + p.name : 'Cron job triggered';
    } else if (evt === 'connect.challenge') {
      desc = 'Connection challenge received';
    } else if (evt.startsWith('presence')) {
      desc = 'Presence update';
    } else if (evt.startsWith('exec.approval')) {
      desc = 'Exec approval ' + (evt.includes('request') ? 'requested' : 'resolved');
    } else if (evt.includes('error')) {
      badge = 'ERROR'; badgeCls = 'badge-error';
      desc = (typeof p.message === 'string' ? p.message : p.error) || 'Error occurred';
    }

    setEventEntries(prev => [{ badge, badgeCls, desc, ts: new Date() }, ...prev].slice(0, 50));
  }, []);

  return { eventEntries, addEvent };
}
