import { lazy, Suspense, useMemo, useState } from 'react';
import { ArrowLeft, Plus, MessageSquare, LayoutGrid, Settings as SettingsIcon } from 'lucide-react';
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

const KanbanPanel = lazy(() =>
  import('@/features/kanban/KanbanPanel').then(m => ({ default: m.KanbanPanel }))
);

type NavTab = 'chat' | 'kanban' | 'settings';

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
  const [activeTab, setActiveTab] = useState<NavTab>('chat');
  const [showChat, setShowChat] = useState(false);

  const hasChats = sessions.length > 0;
  const activeTitle = useMemo(() => sessionTitle || agentDisplayName || 'Chat', [agentDisplayName, sessionTitle]);

  const handleSelect = (key: string) => {
    onSelectSession(key);
    setShowChat(true);
  };

  const handleCreateNewChat = async () => {
    await onSpawnSession?.({
      kind: 'root',
      agentName: `chat-${Date.now().toString(36)}`,
      task: '',
    });
    setShowChat(true);
  };

  const handleBackToHistory = () => {
    setShowChat(false);
  };

  // Determine if we're in an active chat within the chat tab
  const inActiveChat = activeTab === 'chat' && showChat && currentSession;

  return (
    <div
      className="flex min-h-0 flex-col bg-background text-foreground"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Main content area — fills space above bottom nav */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* ── Chat Tab ── */}
        {activeTab === 'chat' && (
          <>
            {inActiveChat ? (
              <div className="flex min-h-0 flex-1 flex-col p-2">
                <div className="shell-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[24px]">
                  <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
                    <button
                      type="button"
                      onClick={handleBackToHistory}
                      className="shell-icon-button size-9 shrink-0 px-0"
                      aria-label="Back to chat history"
                      title="Back to chat history"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tracking-[-0.02em]">{activeTitle}</p>
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
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nerve</p>
                    <h1 className="text-base font-semibold tracking-[-0.02em]">{agentName}</h1>
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
                      {hasChats ? (
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
                      ) : (
                        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                          No chats yet. Tap the plus button to start one.
                        </div>
                      )}
                    </PanelErrorBoundary>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Kanban Tab ── */}
        {activeTab === 'kanban' && (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <div className="shell-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[24px]">
              <PanelErrorBoundary name="Mobile Kanban">
                <Suspense
                  fallback={
                    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                      Loading board…
                    </div>
                  }
                >
                  <KanbanPanel />
                </Suspense>
              </PanelErrorBoundary>
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {activeTab === 'settings' && (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <div className="shell-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] p-6">
              <h2 className="text-base font-semibold tracking-[-0.02em]">Settings</h2>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Agent</span>
                  <span className="font-medium">{agentName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Connection</span>
                  <span className="font-medium text-green-500">Connected</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Navigation Bar ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-start justify-around border-t border-border/70 bg-card"
        style={{
          height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {([
          { tab: 'chat' as const, label: 'Chat', Icon: MessageSquare },
          { tab: 'kanban' as const, label: 'Kanban', Icon: LayoutGrid },
          { tab: 'settings' as const, label: 'Settings', Icon: SettingsIcon },
        ]).map(({ tab, label, Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.65rem] transition-colors ${
              activeTab === tab
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/70'
            }`}
            aria-label={label}
          >
            <Icon size={20} strokeWidth={activeTab === tab ? 2.2 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
