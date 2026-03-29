import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { ChatPanel } from '@/features/chat/ChatPanel';
import type { ImageAttachment } from '@/features/chat/types';
import { SessionList } from '@/features/sessions/SessionList';
import { PanelErrorBoundary } from '@/components/PanelErrorBoundary';
import type { Session, GranularAgentState } from '@/types';
import type { SearchMatchTarget } from '@/features/chat/useMessageSearch';
import type { SpawnSessionOpts } from '@/contexts/SessionContext';
import type { ProcessingStage, ActivityLogEntry, ChatStreamState } from '@/contexts/ChatContext';
import type { VoiceState } from '@/features/voice/useVoiceInput';
import type { ChatMsg } from '@/features/chat/types';

interface MobileShellProps {
  sessions: Session[];
  currentSession: string;
  onSelectSession: (key: string) => void;
  busyState: Record<string, boolean>;
  agentStatus?: Record<string, GranularAgentState>;
  unreadSessions?: Record<string, boolean>;
  onSelectSearchResult?: (sessionKey: string, result: { targetMessageText?: string; kind: 'title' | 'content' }, query: string) => void;
  onDeleteSession?: (sessionKey: string) => Promise<void>;
  onSpawnSession?: (opts: SpawnSessionOpts) => Promise<void | boolean>;
  onRenameSessionList?: (sessionKey: string, label: string) => Promise<void>;
  onAbortSession?: (sessionKey: string) => Promise<void>;
  sessionsLoading?: boolean;
  agentName?: string;

  messages: ChatMsg[];
  onSend: (text: string, attachments?: ImageAttachment[]) => void;
  onAbort: () => void;
  isGenerating: boolean;
  stream: ChatStreamState;
  processingStage?: ProcessingStage;
  lastEventTimestamp?: number;
  currentToolDescription?: string | null;
  activityLog?: ActivityLogEntry[];
  onWakeWordState?: (enabled: boolean, toggle: () => void) => void;
  onReset?: () => void;
  agentDisplayName?: string;
  sessionTitle?: string;
  onRenameCurrentSession?: (nextTitle: string) => Promise<void> | void;
  loadMore?: () => boolean;
  hasMore?: boolean;
  searchTarget?: { requestId: number; target: SearchMatchTarget } | null;
  voiceState: VoiceState;
  interimTranscript: string;
  startRecording: () => Promise<void> | void;
  stopAndTranscribe: () => Promise<void> | void;
  wakeWordEnabled: boolean;
  toggleWakeWord: () => void;
  voiceError: string | null;
  clearVoiceError: () => void;
  voiceOriginSessionKey?: string | null;
}

export default function MobileShell({
  sessions,
  currentSession,
  onSelectSession,
  busyState,
  agentStatus,
  unreadSessions,
  onSelectSearchResult,
  onDeleteSession,
  onSpawnSession,
  onRenameSessionList,
  onAbortSession,
  sessionsLoading,
  agentName = 'Agent',
  messages,
  onSend,
  onAbort,
  isGenerating,
  stream,
  processingStage,
  lastEventTimestamp,
  currentToolDescription,
  activityLog,
  onWakeWordState,
  onReset,
  agentDisplayName = 'Chat',
  sessionTitle = 'Chat',
  onRenameCurrentSession,
  loadMore,
  hasMore,
  searchTarget,
  voiceState,
  interimTranscript,
  startRecording,
  stopAndTranscribe,
  wakeWordEnabled,
  toggleWakeWord,
  voiceError,
  clearVoiceError,
  voiceOriginSessionKey,
}: MobileShellProps) {
  const [activeView, setActiveView] = useState<'history' | 'chat'>('history');

  useEffect(() => {
    if (currentSession) setActiveView('chat');
  }, [currentSession]);

  const handleSelect = (key: string) => {
    onSelectSession(key);
    setActiveView('chat');
  };

  const handleCreateNewChat = () => {
    void onSpawnSession?.({
      kind: 'root',
      agentName: `chat-${Date.now().toString(36)}`,
      task: '',
    });
    setActiveView('chat');
  };

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      {activeView === 'history' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nerve</p>
              <h1 className="text-base font-semibold tracking-[-0.02em]">Chat History</h1>
            </div>
            <button
              type="button"
              onClick={handleCreateNewChat}
              className="shell-icon-button size-10 px-0"
              aria-label="New chat"
              title="New chat"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            <div className="shell-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[24px]">
              <PanelErrorBoundary name="Mobile Chat History">
                <SessionList
                  displayMode="chat"
                  sessions={sessions}
                  currentSession={currentSession}
                  busyState={busyState}
                  agentStatus={agentStatus}
                  unreadSessions={unreadSessions}
                  onSelect={handleSelect}
                  onSelectSearchResult={onSelectSearchResult}
                  onDelete={onDeleteSession}
                  onSpawn={onSpawnSession}
                  onRename={onRenameSessionList}
                  onAbort={onAbortSession}
                  isLoading={sessionsLoading}
                  agentName={agentName}
                />
              </PanelErrorBoundary>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-2">
          <div className="shell-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[24px]">
            <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
              <button
                type="button"
                onClick={() => setActiveView('history')}
                className="shell-icon-button size-10 shrink-0 px-0"
                aria-label="Back to chat history"
                title="Back to chat history"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-[-0.02em]">{sessionTitle}</p>
              </div>
            </div>
            <PanelErrorBoundary name="Mobile Chat">
              <ChatPanel
                id="mobile-chat"
                messages={messages}
                onSend={onSend}
                onAbort={onAbort}
                isGenerating={isGenerating}
                stream={stream}
                processingStage={processingStage}
                lastEventTimestamp={lastEventTimestamp}
                currentToolDescription={currentToolDescription}
                activityLog={activityLog}
                onWakeWordState={onWakeWordState}
                onReset={onReset}
                agentName={agentDisplayName}
                sessionTitle={sessionTitle}
                onRenameSession={onRenameCurrentSession}
                loadMore={loadMore}
                hasMore={hasMore}
                searchTarget={searchTarget}
                voiceState={voiceState}
                interimTranscript={interimTranscript}
                startRecording={startRecording}
                stopAndTranscribe={stopAndTranscribe}
                wakeWordEnabled={wakeWordEnabled}
                toggleWakeWord={toggleWakeWord}
                voiceError={voiceError}
                clearVoiceError={clearVoiceError}
                voiceOriginSessionKey={voiceOriginSessionKey}
              />
            </PanelErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}
