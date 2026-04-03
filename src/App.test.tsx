import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

type SaveResult = { ok: boolean; conflict?: boolean };
type SaveAllResult = { ok: boolean; failedPath?: string; conflict?: boolean };

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
}

const {
  sessionContext,
  saveFileByAgent,
  saveAllDirtyFilesByAgent,
  discardAllDirtyFilesByAgent,
  dirtyStateByAgent,
  reloadCalls,
  tabRenderSnapshots,
  useOpenFilesMock,
} = vi.hoisted(() => {
  const sessionContext = {
    sessions: [
      { key: 'agent:alpha:main', label: 'Alpha' },
      { key: 'agent:alpha:subagent:abc', label: 'Alpha helper' },
      { key: 'agent:bravo:main', label: 'Bravo' },
    ],
    sessionsLoading: false,
    currentSession: 'agent:alpha:main',
    setCurrentSession: vi.fn(),
    busyState: {},
    agentStatus: {},
    unreadSessions: new Set<string>(),
    refreshSessions: vi.fn(),
    deleteSession: vi.fn(),
    abortSession: vi.fn(),
    spawnSession: vi.fn(),
    renameSession: vi.fn(),
    agentLogEntries: [],
    eventEntries: [],
    agentName: 'Nerve',
  };

  const saveFileByAgent = {
    main: vi.fn<[string], Promise<SaveResult>>(),
    alpha: vi.fn<[string], Promise<SaveResult>>(),
    bravo: vi.fn<[string], Promise<SaveResult>>(),
  };
  const saveAllDirtyFilesByAgent = {
    main: vi.fn<[], Promise<SaveAllResult>>(),
    alpha: vi.fn<[], Promise<SaveAllResult>>(),
    bravo: vi.fn<[], Promise<SaveAllResult>>(),
  };
  const discardAllDirtyFilesByAgent = {
    main: vi.fn<[], void>(),
    alpha: vi.fn<[], void>(),
    bravo: vi.fn<[], void>(),
  };
  const dirtyStateByAgent: Record<string, boolean> = {
    main: false,
    alpha: false,
    bravo: false,
  };
  const reloadCalls: Array<{ agentId: string; path: string }> = [];
  const tabRenderSnapshots: Array<{
    workspaceAgentId: string;
    hasSaveToast: boolean;
    saveToastPath: string | null;
  }> = [];

  const useOpenFilesMock = vi.fn((agentId: string) => ({
    openFiles: [{ path: 'shared.md', name: 'shared.md', content: 'draft', savedContent: 'draft', dirty: dirtyStateByAgent[agentId] ?? false }],
    activeTab: 'shared.md',
    setActiveTab: vi.fn(),
    openFile: vi.fn(),
    closeFile: vi.fn(),
    updateContent: vi.fn(),
    saveFile: saveFileByAgent[agentId as keyof typeof saveFileByAgent] ?? vi.fn().mockResolvedValue({ ok: true }),
    reloadFile: vi.fn((path: string) => {
      reloadCalls.push({ agentId, path });
    }),
    handleFileChanged: vi.fn(),
    remapOpenPaths: vi.fn(),
    closeOpenPathsByPrefix: vi.fn(),
    hasDirtyFiles: dirtyStateByAgent[agentId] ?? false,
    getDirtyFilePaths: vi.fn(() => (dirtyStateByAgent[agentId] ? ['shared.md'] : [])),
    saveAllDirtyFiles: saveAllDirtyFilesByAgent[agentId as keyof typeof saveAllDirtyFilesByAgent] ?? vi.fn().mockResolvedValue({ ok: true }),
    discardAllDirtyFiles: discardAllDirtyFilesByAgent[agentId as keyof typeof discardAllDirtyFilesByAgent] ?? vi.fn(),
  }));

  return {
    sessionContext,
    saveFileByAgent,
    saveAllDirtyFilesByAgent,
    discardAllDirtyFilesByAgent,
    dirtyStateByAgent,
    reloadCalls,
    tabRenderSnapshots,
    useOpenFilesMock,
  };
});

vi.mock('@/contexts/GatewayContext', () => ({
  useGateway: () => ({
    connectionState: 'connected',
    connectError: null,
    reconnectAttempt: 0,
    model: 'gpt-test',
    sparkline: [],
  }),
}));

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => sessionContext,
}));

vi.mock('@/contexts/ChatContext', () => ({
  useChat: () => ({
    messages: [],
    isGenerating: false,
    stream: null,
    processingStage: null,
    lastEventTimestamp: null,
    activityLog: [],
    currentToolDescription: null,
    handleSend: vi.fn(),
    handleSendToSession: vi.fn(),
    handleAbort: vi.fn(),
    handleReset: vi.fn(),
    loadMore: vi.fn(),
    hasMore: false,
    showResetConfirm: false,
    confirmReset: vi.fn(),
    cancelReset: vi.fn(),
  }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    soundEnabled: false,
    toggleSound: vi.fn(),
    ttsProvider: 'off',
    ttsModel: 'none',
    setTtsProvider: vi.fn(),
    setTtsModel: vi.fn(),
    sttProvider: 'local',
    setSttProvider: vi.fn(),
    sttInputMode: 'push-to-talk',
    setSttInputMode: vi.fn(),
    sttModel: 'whisper',
    setSttModel: vi.fn(),
    wakeWordEnabled: false,
    handleToggleWakeWord: vi.fn(),
    handleWakeWordState: vi.fn(),
    liveTranscriptionPreview: false,
    toggleLiveTranscriptionPreview: vi.fn(),
    panelRatio: 60,
    setPanelRatio: vi.fn(),
    eventsVisible: false,
    logVisible: false,
    toggleEvents: vi.fn(),
    toggleLog: vi.fn(),
    toggleTelemetry: vi.fn(),
    setTheme: vi.fn(),
    setFont: vi.fn(),
  }),
}));

vi.mock('@/hooks/useConnectionManager', () => ({
  useConnectionManager: () => ({
    dialogOpen: false,
    editableUrl: 'ws://localhost:18789/ws',
    setEditableUrl: vi.fn(),
    officialUrl: 'ws://localhost:18789/ws',
    editableToken: '',
    setEditableToken: vi.fn(),
    handleConnect: vi.fn(),
    handleReconnect: vi.fn(),
    serverSideAuth: true,
  }),
}));

vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    memories: [],
    memoriesLoading: false,
    tokenData: null,
    refreshMemories: vi.fn(),
  }),
}));

vi.mock('@/hooks/useGatewayRestart', () => ({
  useGatewayRestart: () => ({
    showGatewayRestartConfirm: false,
    gatewayRestarting: false,
    gatewayRestartNotice: null,
    handleGatewayRestart: vi.fn(),
    cancelGatewayRestart: vi.fn(),
    confirmGatewayRestart: vi.fn(),
    dismissNotice: vi.fn(),
  }),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/features/voice/useVoiceInput', () => ({
  invalidatePhrasesCache: vi.fn(),
  useVoiceInput: () => ({
    voiceState: 'idle',
    interimTranscript: '',
    startRecording: vi.fn(),
    stopAndTranscribe: vi.fn(),
    discardRecording: vi.fn(),
    wakeWordEnabled: false,
    toggleWakeWord: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock('@/features/command-palette/commands', () => ({
  createCommands: () => [],
}));

vi.mock('@/features/file-browser', () => ({
  useOpenFiles: useOpenFilesMock,
  FileTreePanel: () => <div data-testid="file-tree-panel" />,
  TabbedContentArea: ({ workspaceAgentId, onSaveFile, onReloadFile, saveToast }: {
    workspaceAgentId: string;
    onSaveFile: (path: string) => void;
    onReloadFile?: (path: string) => void;
    saveToast?: { path: string; type: 'conflict' } | null;
  }) => {
    tabRenderSnapshots.push({
      workspaceAgentId,
      hasSaveToast: Boolean(saveToast),
      saveToastPath: saveToast?.path ?? null,
    });

    return (
      <div>
        <div data-testid="workspace-agent">{workspaceAgentId}</div>
        <button type="button" onClick={() => onSaveFile('shared.md')}>Save shared.md</button>
        {saveToast && (
          <div>
            <span>File changed externally.</span>
            {onReloadFile && (
              <button type="button" onClick={() => onReloadFile(saveToast.path)}>Reload</button>
            )}
          </div>
        )}
      </div>
    );
  },
}));

vi.mock('@/features/connect/ConnectDialog', () => ({
  ConnectDialog: () => null,
}));

vi.mock('@/components/TopBar', () => ({
  TopBar: () => null,
}));

vi.mock('@/components/StatusBar', () => ({
  StatusBar: () => null,
}));

vi.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/features/chat/ChatPanel', () => ({
  ChatPanel: () => null,
}));

vi.mock('@/components/ResizablePanels', () => ({
  ResizablePanels: ({ left, right }: { left: ReactNode; right: ReactNode }) => (
    <div>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  ),
}));

vi.mock('@/components/PanelErrorBoundary', () => ({
  PanelErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/sessions/SpawnAgentDialog', () => ({
  SpawnAgentDialog: () => null,
}));

vi.mock('@/features/settings/SettingsDrawer', () => ({
  SettingsDrawer: () => null,
}));

vi.mock('@/features/command-palette/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('@/features/sessions/SessionList', () => ({
  SessionList: ({ onSelect, onSpawn }: {
    onSelect: (key: string) => void;
    onSpawn?: (opts: { kind: 'root' | 'subagent'; agentName?: string; parentSessionKey?: string; task: string; model: string; thinking: string; cleanup?: string }) => Promise<void>;
  }) => (
    <div>
      <button type="button" onClick={() => onSelect('agent:bravo:main')}>Select Bravo</button>
      <button type="button" onClick={() => onSelect('agent:alpha:subagent:abc')}>Select Alpha Subagent</button>
      {onSpawn && (
        <button
          type="button"
          onClick={() => onSpawn({
            kind: 'root',
            agentName: 'Charlie',
            task: 'Investigate workspace guard',
            model: 'test-model',
            thinking: 'medium',
          })}
        >
          Spawn Root Charlie
        </button>
      )}
      {onSpawn && (
        <button
          type="button"
          onClick={() => onSpawn({
            kind: 'subagent',
            parentSessionKey: 'agent:bravo:main',
            task: 'Help bravo',
            model: 'test-model',
            thinking: 'medium',
            cleanup: 'keep',
          })}
        >
          Spawn Bravo Subagent
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/features/workspace/WorkspacePanel', () => ({
  WorkspacePanel: () => null,
}));

vi.mock('@/features/kanban/KanbanPanel', () => ({
  KanbanPanel: () => null,
}));

describe('App save toast workspace scoping', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionContext.currentSession = 'agent:alpha:main';
    sessionContext.setCurrentSession.mockReset();
    sessionContext.spawnSession.mockReset();
    Object.values(saveFileByAgent).forEach((mockFn) => mockFn.mockReset());
    Object.values(saveAllDirtyFilesByAgent).forEach((mockFn) => mockFn.mockReset());
    Object.values(discardAllDirtyFilesByAgent).forEach((mockFn) => mockFn.mockReset());
    dirtyStateByAgent.alpha = false;
    dirtyStateByAgent.bravo = false;
    reloadCalls.length = 0;
    tabRenderSnapshots.length = 0;
    useOpenFilesMock.mockClear();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('keeps a late save conflict toast when switching chats because the shared workspace stays the same', async () => {
    const mainSave = createDeferred<SaveResult>();
    saveFileByAgent.main.mockReturnValue(mainSave.promise);

    const { rerender } = renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Save shared.md' }));

    sessionContext.currentSession = 'agent:bravo:main';
    rerender(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByTestId('workspace-agent')).toHaveTextContent('main');

    await act(async () => {
      mainSave.resolve({ ok: false, conflict: true });
      await Promise.resolve();
    });

    expect(await screen.findByText('File changed externally.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('keeps the shared workspace agent pinned to main after chat switches', async () => {
    saveFileByAgent.main.mockResolvedValue({ ok: false, conflict: true });

    const { rerender } = renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Save shared.md' }));

    expect(await screen.findByText('File changed externally.')).toBeInTheDocument();

    const snapshotsBeforeSwitch = tabRenderSnapshots.length;
    sessionContext.currentSession = 'agent:bravo:main';
    rerender(<MemoryRouter><App /></MemoryRouter>);

    const switchSnapshots = tabRenderSnapshots.slice(snapshotsBeforeSwitch);
    expect(switchSnapshots[0]).toMatchObject({
      workspaceAgentId: 'main',
      hasSaveToast: true,
      saveToastPath: 'shared.md',
    });
  });

  it('keeps an active save conflict toast across chat switches so reload still targets the shared workspace', async () => {
    saveFileByAgent.main.mockResolvedValue({ ok: false, conflict: true });

    const { rerender } = renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Save shared.md' }));

    expect(await screen.findByText('File changed externally.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();

    sessionContext.currentSession = 'agent:bravo:main';
    rerender(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByTestId('workspace-agent')).toHaveTextContent('main');
    expect(screen.getByText('File changed externally.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(reloadCalls).toEqual([]);
  });

  it('does not lose the shared-workspace save conflict toast after switching away and back', async () => {
    saveFileByAgent.main.mockResolvedValue({ ok: false, conflict: true });

    const { rerender } = renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Save shared.md' }));

    expect(await screen.findByText('File changed externally.')).toBeInTheDocument();

    sessionContext.currentSession = 'agent:bravo:main';
    rerender(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByText('File changed externally.')).toBeInTheDocument();

    sessionContext.currentSession = 'agent:alpha:main';
    rerender(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByTestId('workspace-agent')).toHaveTextContent('main');
    expect(screen.getByText('File changed externally.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});

describe('App shared workspace navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionContext.currentSession = 'agent:alpha:main';
    sessionContext.setCurrentSession.mockReset();
    sessionContext.spawnSession.mockReset();
    Object.values(saveAllDirtyFilesByAgent).forEach((mockFn) => mockFn.mockReset());
    Object.values(discardAllDirtyFilesByAgent).forEach((mockFn) => mockFn.mockReset());
    dirtyStateByAgent.main = true;
    dirtyStateByAgent.alpha = false;
    dirtyStateByAgent.bravo = false;
    saveAllDirtyFilesByAgent.main.mockResolvedValue({ ok: true });
    discardAllDirtyFilesByAgent.main.mockImplementation(() => {});
  });

  it('does not guard same-agent subagent navigation', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Select Alpha Subagent' }));

    expect(sessionContext.setCurrentSession).toHaveBeenCalledWith('agent:alpha:subagent:abc');
    expect(screen.queryByText('Unsaved workspace edits')).not.toBeInTheDocument();
  });

  it('does not guard cross-agent session selection because chat switches no longer switch workspaces', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Select Bravo' }));

    expect(sessionContext.setCurrentSession).toHaveBeenCalledWith('agent:bravo:main');
    expect(saveAllDirtyFilesByAgent.main).not.toHaveBeenCalled();
    expect(discardAllDirtyFilesByAgent.main).not.toHaveBeenCalled();
    expect(screen.queryByText('Unsaved workspace edits')).not.toBeInTheDocument();
  });

  it('does not surface the old workspace-switch confirmation on chat changes', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Select Bravo' }));

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save and switch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard and switch' })).not.toBeInTheDocument();
  });

  it('does not guard root-agent creation behind workspace prompts', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Spawn Root Charlie' }));

    await waitFor(() => {
      expect(sessionContext.spawnSession).toHaveBeenCalledWith({
        kind: 'root',
        agentName: 'Charlie',
        task: 'Investigate workspace guard',
        model: 'test-model',
        thinking: 'medium',
      });
    });

    expect(saveAllDirtyFilesByAgent.main).not.toHaveBeenCalled();
    expect(discardAllDirtyFilesByAgent.main).not.toHaveBeenCalled();
    expect(screen.queryByText('Unsaved workspace edits')).not.toBeInTheDocument();
  });

  it('does not guard cross-agent subagent creation either', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Spawn Bravo Subagent' }));

    await waitFor(() => {
      expect(sessionContext.spawnSession).toHaveBeenCalledWith({
        kind: 'subagent',
        parentSessionKey: 'agent:bravo:main',
        task: 'Help bravo',
        model: 'test-model',
        thinking: 'medium',
        cleanup: 'keep',
      });
    });

    expect(saveAllDirtyFilesByAgent.main).not.toHaveBeenCalled();
    expect(screen.queryByText('Unsaved workspace edits')).not.toBeInTheDocument();
  });
});
