/**
 * App.tsx - Main application layout component
 * 
 * This component focuses on layout and composition.
 * Connection management is handled by useConnectionManager.
 * Dashboard data fetching is handled by useDashboardData.
 */
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useReducer,
  lazy,
  Suspense,
} from 'react';
import { AlertTriangle, CheckCircle2, RotateCw, PlugZap, Mic, Loader2, Square } from 'lucide-react';
import type { SearchMatchTarget } from '@/features/chat/useMessageSearch';
import { useGateway } from '@/contexts/GatewayContext';
import { useSessionContext, type SpawnSessionOpts } from '@/contexts/SessionContext';
import { useChat } from '@/contexts/ChatContext';
import { useSettings, type STTInputMode } from '@/contexts/SettingsContext';
import { getSessionKey } from '@/types';
import { useConnectionManager } from '@/hooks/useConnectionManager';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useGatewayRestart } from '@/hooks/useGatewayRestart';
import { ConnectDialog } from '@/features/connect/ConnectDialog';
import { TopBar } from '@/components/TopBar';
import { StatusBar } from '@/components/StatusBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { WorkspaceSwitchDialog } from '@/components/WorkspaceSwitchDialog';
import { ChatPanel, type ChatPanelHandle } from '@/features/chat/ChatPanel';
import { invalidatePhrasesCache, useVoiceInput } from '@/features/voice/useVoiceInput';
import type { TTSProvider } from '@/features/tts/useTTS';
import type { ViewMode } from '@/features/command-palette/commands';
import { ResizablePanels } from '@/components/ResizablePanels';
import { getContextLimit } from '@/lib/constants';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { createCommands } from '@/features/command-palette/commands';
import { PanelErrorBoundary } from '@/components/PanelErrorBoundary';
import { SpawnAgentDialog } from '@/features/sessions/SpawnAgentDialog';
import { FileTreePanel, TabbedContentArea, useOpenFiles, type FileTreeChangeEvent } from '@/features/file-browser';
import { isImageFile } from '@/features/file-browser/utils/fileTypes';
import { buildAgentRootSessionKey, getSessionDisplayLabel, getTopLevelAgentSessions } from '@/features/sessions/sessionKeys';
import { getWorkspaceAgentId, getWorkspaceRootSessionKey } from '@/features/workspace/workspaceScope';
import { ToolPanel } from '@/features/tools/ToolPanel';

// Lazy-loaded features (not needed in initial bundle)
const SettingsDrawer = lazy(() => import('@/features/settings/SettingsDrawer').then(m => ({ default: m.SettingsDrawer })));
const CommandPalette = lazy(() => import('@/features/command-palette/CommandPalette').then(m => ({ default: m.CommandPalette })));

// Lazy-loaded side panels
const SessionList = lazy(() => import('@/features/sessions/SessionList').then(m => ({ default: m.SessionList })));
// Lazy-loaded view modes
const KanbanPanel = lazy(() => import('@/features/kanban/KanbanPanel').then(m => ({ default: m.KanbanPanel })));

interface AppProps {
  onLogout?: () => void;
}

interface PendingWorkspaceSwitch {
  targetLabel: string;
  execute: () => Promise<void>;
  resolve: (didSwitch: boolean) => void;
  reject: (error: unknown) => void;
}

const CHAT_VISIBILITY_STORAGE_KEY = 'nerve-visible-chat-session-keys-v1';
const CHAT_HISTORY_WIDTH_MIGRATION_KEY = 'nerve-chat-history-width-migrated-v2';
const DEFAULT_CHAT_HISTORY_PANEL_RATIO = 50;
const DEFAULT_CHAT_HISTORY_WIDTH_PX = 220;
const TOOL_PANEL_WIDTH_STORAGE_KEY = 'nerve-tool-panel-width-v3';
const TOOL_PANEL_CHAT_BASELINE_STORAGE_KEY = 'nerve-tool-panel-chat-baseline-v1';
const TOOL_PANEL_COLLAPSED_STORAGE_KEY = 'nerve-tool-panel-collapsed';
const TOOL_PANEL_SELECTED_STORAGE_KEY = 'nerve-tool-panel-selected-tool';
const TOOL_PANEL_RAIL_WIDTH_PX = 56;
const SHARED_WORKSPACE_AGENT_ID = 'main';

function buildWorkspaceSwitchErrorMessage(result: {
  failedPath?: string;
  conflict?: boolean;
}): string {
  const fileLabel = result.failedPath || 'a dirty file';
  if (result.conflict) {
    return `${fileLabel} changed on disk. Resolve it before switching agents.`;
  }
  return `Could not save ${fileLabel}. Resolve it before switching agents.`;
}

export default function App({ onLogout }: AppProps) {
  // Gateway state
  const {
    connectionState, connectError, reconnectAttempt, model, sparkline,
  } = useGateway();

  // Session state
  const {
    sessions, sessionsLoading, currentSession, setCurrentSession,
    busyState, agentStatus, unreadSessions, refreshSessions, deleteSession, abortSession, spawnSession, renameSession,
    agentLogEntries, eventEntries,
    agentName,
  } = useSessionContext();

  // Chat state
  const {
    messages, isGenerating, stream, processingStage,
    lastEventTimestamp, activityLog, currentToolDescription,
    handleSend, handleSendToSession, handleAbort, handleReset,
    loadMore, hasMore,
    showResetConfirm, confirmReset, cancelReset,
  } = useChat();

  // Settings state
  const {
    soundEnabled, toggleSound,
    ttsProvider, ttsModel, setTtsProvider, setTtsModel,
    sttProvider, setSttProvider, sttInputMode, setSttInputMode, sttModel, setSttModel,
    wakeWordEnabled, handleToggleWakeWord, handleWakeWordState,
    liveTranscriptionPreview, toggleLiveTranscriptionPreview,
    panelRatio, setPanelRatio,
    eventsVisible, logVisible,
    toggleEvents, toggleLog, toggleTelemetry,
    setTheme, setFont,
  } = useSettings();

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

  // Connection management (extracted hook)
  const {
    dialogOpen,
    editableUrl, setEditableUrl,
    officialUrl,
    editableToken, setEditableToken,
    handleConnect, handleReconnect,
    serverSideAuth,
    startupPending,
    showManagedFallback,
    openManualConnect,
  } = useConnectionManager();

  // Track file change events for tree refresh. Sequence keeps repeated same-path updates visible.
  const [lastChangedEvent, setLastChangedEvent] = useState<FileTreeChangeEvent | null>(null);
  const [revealRequest, setRevealRequest] = useState<{
    id: number;
    path: string;
    kind: 'file' | 'directory';
    agentId: string;
  } | null>(null);
  const fileTreeChangeSequenceRef = useRef(0);

  const initialCompactLayout = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const initialDesktopFileBrowserCollapsed = (() => {
    try {
      const saved = localStorage.getItem('nerve-file-tree-collapsed');
      if (saved !== null) return saved === 'true';
    } catch {
      // ignore storage errors and fall back to desktop default
    }

    return false;
  })();

  // File browser collapse state for mobile optimization
  const [fileBrowserCollapsed, setFileBrowserCollapsedState] = useState(() => (
    initialCompactLayout ? true : initialDesktopFileBrowserCollapsed
  ));
  const [desktopFileBrowserCollapsed, setDesktopFileBrowserCollapsed] = useState(initialDesktopFileBrowserCollapsed);

  // Responsive layout state (chat-first on smaller viewports)
  const [isCompactLayout, setIsCompactLayout] = useState(initialCompactLayout);

  const persistDesktopFileBrowserCollapsed = useCallback((collapsed: boolean) => {
    setDesktopFileBrowserCollapsed(collapsed);

    try {
      localStorage.setItem('nerve-file-tree-collapsed', String(collapsed));
    } catch {
      // ignore storage errors
    }
  }, []);

  const setFileBrowserCollapsed = useCallback((nextCollapsed: boolean | ((prev: boolean) => boolean)) => {
    setFileBrowserCollapsedState(prevCollapsed => {
      const resolvedCollapsed = typeof nextCollapsed === 'function'
        ? nextCollapsed(prevCollapsed)
        : nextCollapsed;

      if (!isCompactLayout) {
        persistDesktopFileBrowserCollapsed(resolvedCollapsed);
      }

      return resolvedCollapsed;
    });
  }, [isCompactLayout, persistDesktopFileBrowserCollapsed]);

  /** Toggle file browser collapse state (mobile). */
  const handleToggleFileBrowser = useCallback(() => {
    setFileBrowserCollapsed(prev => !prev);
  }, [setFileBrowserCollapsed]);

  const setToolPanelCollapsed = useCallback((nextCollapsed: boolean | ((prev: boolean) => boolean)) => {
    setToolPanelCollapsedState(prevCollapsed => {
      const resolvedCollapsed = typeof nextCollapsed === 'function'
        ? nextCollapsed(prevCollapsed)
        : nextCollapsed;

      try {
        localStorage.setItem(TOOL_PANEL_COLLAPSED_STORAGE_KEY, String(resolvedCollapsed));
      } catch {
        // ignore storage errors
      }

      return resolvedCollapsed;
    });
  }, []);

  const setSelectedToolId = useCallback((nextToolId: string | null) => {
    setSelectedToolIdState(nextToolId);
    try {
      if (nextToolId) localStorage.setItem(TOOL_PANEL_SELECTED_STORAGE_KEY, nextToolId);
      else localStorage.removeItem(TOOL_PANEL_SELECTED_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setToolPanelCollapsed(false);
  }, []);

  const setToolPanelWidth = useCallback((nextWidth: number) => {
    const clamped = Math.max(320, Math.min(1200, Math.round(nextWidth)));
    setToolPanelWidthState(clamped);
    try {
      localStorage.setItem(TOOL_PANEL_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  }, []);

  const setToolPanelChatBaselineWidth = useCallback((nextWidth: number) => {
    const clamped = Math.max(320, Math.min(2400, Math.round(nextWidth)));
    setToolPanelChatBaselineWidthState(clamped);
    try {
      localStorage.setItem(TOOL_PANEL_CHAT_BASELINE_STORAGE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleToggleToolPanel = useCallback(() => {
    setToolPanelCollapsed(prev => !prev);
  }, [setToolPanelCollapsed]);

  const sharedWorkspaceAgentId = SHARED_WORKSPACE_AGENT_ID;
  const [visibleChatKeys, setVisibleChatKeys] = useState<Set<string>>(() => new Set());
  const [chatVisibilityInitialized, setChatVisibilityInitialized] = useState(false);

  // File browser state stays pinned to the shared/main workspace.
  const {
    openFiles, activeTab, setActiveTab,
    openFile, closeFile, updateContent, saveFile, reloadFile,
    handleFileChanged, remapOpenPaths, closeOpenPathsByPrefix,
    saveAllDirtyFiles, discardAllDirtyFiles,
  } = useOpenFiles(sharedWorkspaceAgentId);

  // Save with workspace-scoped conflict toast
  const [saveToast, setSaveToast] = useState<{
    agentId: string;
    path: string;
    type: 'conflict';
    workspaceVersion: number;
  } | null>(null);
  const [workspaceVersion, bumpWorkspaceVersion] = useReducer((version: number) => version + 1, 0);
  const saveToastTimerRef = useRef<number | null>(null);
  const workspaceAgentIdRef = useRef(sharedWorkspaceAgentId);
  const [pendingWorkspaceSwitch, setPendingWorkspaceSwitch] = useState<PendingWorkspaceSwitch | null>(null);
  const [workspaceSwitchAction, setWorkspaceSwitchAction] = useState<'save' | 'discard' | null>(null);
  const [workspaceSwitchError, setWorkspaceSwitchError] = useState<string | null>(null);

  const clearSaveToastTimer = useCallback(() => {
    if (saveToastTimerRef.current !== null) {
      window.clearTimeout(saveToastTimerRef.current);
      saveToastTimerRef.current = null;
    }
  }, []);

  const dismissSaveToast = useCallback(() => {
    clearSaveToastTimer();
    setSaveToast(null);
  }, [clearSaveToastTimer]);

  const showSaveToastForAgent = useCallback((
    targetAgentId: string,
    nextToast: { path: string; type: 'conflict' },
  ) => {
    if (workspaceAgentIdRef.current !== targetAgentId) return;

    clearSaveToastTimer();
    const toastForAgent = {
      ...nextToast,
      agentId: targetAgentId,
      workspaceVersion,
    };
    setSaveToast(toastForAgent);
    saveToastTimerRef.current = window.setTimeout(() => {
      setSaveToast((currentToast) => (currentToast === toastForAgent ? null : currentToast));
      saveToastTimerRef.current = null;
    }, 5000);
  }, [clearSaveToastTimer, workspaceVersion]);

  useEffect(() => {
    workspaceAgentIdRef.current = sharedWorkspaceAgentId;
    bumpWorkspaceVersion();
    clearSaveToastTimer();
  }, [clearSaveToastTimer, sharedWorkspaceAgentId]);

  useEffect(() => () => clearSaveToastTimer(), [clearSaveToastTimer]);

  const handleSaveFile = useCallback(async (filePath: string) => {
    const requestAgentId = sharedWorkspaceAgentId;
    const result = await saveFile(filePath);

    if (workspaceAgentIdRef.current !== requestAgentId) {
      return;
    }

    if (!result.ok) {
      if (result.conflict) {
        showSaveToastForAgent(requestAgentId, { path: filePath, type: 'conflict' });
      }
      return;
    }

    dismissSaveToast();
  }, [dismissSaveToast, saveFile, showSaveToastForAgent, sharedWorkspaceAgentId]);

  // Single file.changed handler, feeds both open files and tree refresh.
  const onFileChanged = useCallback((path: string, targetAgentId: string) => {
    handleFileChanged(path, targetAgentId);
    setLastChangedEvent({
      path,
      agentId: targetAgentId,
      sequence: ++fileTreeChangeSequenceRef.current,
    });
  }, [handleFileChanged]);

  // Dashboard data (extracted hook) — single SSE connection handles all events
  const { tokenData, refreshMemories } = useDashboardData({
    agentId: sharedWorkspaceAgentId,
    onFileChanged,
  });

  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [logGlow, setLogGlow] = useState(false);
  const [isMobileTopBarHidden, setIsMobileTopBarHidden] = useState(false);
  const [desktopRightPanelWidth, setDesktopRightPanelWidth] = useState<number | null>(null);
  const [toolPanelCollapsed, setToolPanelCollapsedState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(TOOL_PANEL_COLLAPSED_STORAGE_KEY);
      return saved === null ? false : saved === 'true';
    } catch {
      return false;
    }
  });
  const [selectedToolId, setSelectedToolIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOOL_PANEL_SELECTED_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [toolPanelWidth, setToolPanelWidthState] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(TOOL_PANEL_WIDTH_STORAGE_KEY);
      if (!saved) return null;
      const parsed = Number(saved);
      return Number.isFinite(parsed) && parsed >= 320 ? parsed : null;
    } catch {
      return null;
    }
  });
  const [toolPanelChatBaselineWidth, setToolPanelChatBaselineWidthState] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(TOOL_PANEL_CHAT_BASELINE_STORAGE_KEY);
      if (!saved) return null;
      const parsed = Number(saved);
      return Number.isFinite(parsed) && parsed >= 320 ? parsed : null;
    } catch {
      return null;
    }
  });
  const [toolPanelDebugMetrics, setToolPanelDebugMetrics] = useState<{
    chatWidth: number | null;
    toolWidth: number | null;
    combinedWidth: number | null;
    baselineWidth: number | null;
  }>({
    chatWidth: null,
    toolWidth: null,
    combinedWidth: null,
    baselineWidth: null,
  });
  const prevLogCount = useRef(0);
  const chatPanelRef = useRef<ChatPanelHandle>(null);
  const activeChatPaneRef = useRef<HTMLDivElement | null>(null);
  const activeToolPaneRef = useRef<HTMLDivElement | null>(null);

  // Gateway restart
  const {
    showGatewayRestartConfirm,
    gatewayRestarting,
    gatewayRestartNotice,
    handleGatewayRestart,
    cancelGatewayRestart,
    confirmGatewayRestart,
    dismissNotice,
  } = useGatewayRestart();

  // Command palette state
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [spawnDialogOpen, setSpawnDialogOpen] = useState(false);
  const [chatSearchTarget, setChatSearchTarget] = useState<{ sessionKey: string; requestId: number; target: SearchMatchTarget } | null>(null);

  // View mode state (chat | kanban), persisted to localStorage
  const [viewMode, setViewModeRaw] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('nerve:viewMode');
      if (saved === 'kanban') return 'kanban';
    } catch { /* ignore */ }
    return 'chat';
  });
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeRaw(mode);

    if (mode === 'kanban' && isCompactLayout) {
      setFileBrowserCollapsed(true);
    }

    try { localStorage.setItem('nerve:viewMode', mode); } catch { /* ignore */ }
  }, [isCompactLayout, setFileBrowserCollapsed]);
  const openWorkspacePath = useCallback(async (targetPath: string) => {
    const params = new URLSearchParams({ path: targetPath, agentId: sharedWorkspaceAgentId });
    const res = await fetch(`/api/files/resolve?${params.toString()}`);
    const data = await res.json().catch(() => null) as {
      ok?: boolean;
      path?: string;
      type?: 'file' | 'directory';
      binary?: boolean;
    } | null;

    if (!res.ok || !data?.ok || !data.path || !data.type) return;

    if (data.type === 'file' && (!data.binary || isImageFile(data.path))) {
      setRevealRequest(null);
      await openFile(data.path);
      return;
    }

    setFileBrowserCollapsed(false);
    setRevealRequest({ id: Date.now(), path: data.path, kind: data.type, agentId: sharedWorkspaceAgentId });
  }, [openFile, setFileBrowserCollapsed, sharedWorkspaceAgentId]);

  const toggleMobileTopBar = useCallback(() => {
    setIsMobileTopBarHidden((prev) => !prev);
  }, []);

  // Build command list with stable references
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setChatSearchTarget(null);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const openSpawnDialog = useCallback(() => setSpawnDialogOpen(true), []);

  const commands = useMemo(() => createCommands({
    onNewSession: openSpawnDialog,
    onResetSession: handleReset,
    onToggleSound: toggleSound,
    onSettings: openSettings,
    onSearch: openSearch,
    onAbort: handleAbort,
    onSetTheme: setTheme,
    onSetFont: setFont,
    onTtsProviderChange: setTtsProvider,
    onToggleWakeWord: handleToggleWakeWord,
    onToggleEvents: toggleEvents,
    onToggleLog: toggleLog,
    onToggleTelemetry: toggleTelemetry,
    onOpenSettings: openSettings,
    onRefreshSessions: refreshSessions,
    onRefreshMemory: refreshMemories,
    onSetViewMode: setViewMode,
  }), [openSpawnDialog, handleReset, toggleSound, handleAbort, openSettings, openSearch,
    setTheme, setFont, setTtsProvider, handleToggleWakeWord, toggleEvents, toggleLog, toggleTelemetry,
    refreshSessions, refreshMemories, setViewMode]);

  // Keyboard shortcut handlers with useCallback
  const handleOpenPalette = useCallback(() => setPaletteOpen(true), []);
  const handleCtrlC = useCallback(() => {
    if (isGenerating) {
      handleAbort();
    }
  }, [isGenerating, handleAbort]);
  const toggleSearch = useCallback(() => setSearchOpen(prev => !prev), []);
  const handleEscape = useCallback(() => {
    if (paletteOpen) {
      setPaletteOpen(false);
    } else if (searchOpen) {
      setSearchOpen(false);
    } else if (isGenerating) {
      handleAbort();
    }
  }, [paletteOpen, searchOpen, isGenerating, handleAbort]);

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'k', meta: true, handler: handleOpenPalette },
    { key: 'b', meta: true, handler: handleToggleFileBrowser },  // Cmd+B → toggle file browser
    { key: 'f', meta: true, handler: toggleSearch, skipInEditor: true },  // Cmd+F → chat search (yields to CodeMirror search in editor)
    { key: 'c', ctrl: true, handler: handleCtrlC, preventDefault: false },  // Ctrl+C → abort (when generating), allow copy to still work
    { key: 'Escape', handler: handleEscape, skipInEditor: true },
  ]);

  // Get current session's context usage for StatusBar
  const currentSessionData = useMemo(() => {
    return sessions.find(s => getSessionKey(s) === currentSession);
  }, [sessions, currentSession]);

  // Get display name for current session (agent name for main, label for subagents)
  const currentSessionDisplayName = useMemo(() => {
    if (currentSessionData) return getSessionDisplayLabel(currentSessionData, agentName);
    return agentName;
  }, [currentSessionData, agentName]);

  const voiceOriginSessionLabel = useMemo(() => {
    if (!voiceOriginSessionKey) return null;
    const originSession = sessions.find((session) => getSessionKey(session) === voiceOriginSessionKey);
    if (originSession) return getSessionDisplayLabel(originSession, agentName);
    return voiceOriginSessionKey;
  }, [agentName, sessions, voiceOriginSessionKey]);

  const handleRenameCurrentSession = useCallback(async (nextTitle: string) => {
    if (!currentSession) return;
    await renameSession(currentSession, nextTitle);
  }, [currentSession, renameSession]);

  const handleSelectChatSearchResult = useCallback(async (
    sessionKey: string,
    result: { targetMessageText?: string; kind: 'title' | 'content' },
    query: string,
  ) => {
    setCurrentSession(sessionKey);
    if (result.kind === 'content' && result.targetMessageText && query.trim()) {
      setChatSearchTarget({
        sessionKey,
        requestId: Date.now(),
        target: { query, targetText: result.targetMessageText },
      });
      setSearchOpen(true);
      return;
    }

    setChatSearchTarget(null);
    setSearchOpen(false);
  }, [setCurrentSession]);

  const contextTokens = currentSessionData?.totalTokens ?? 0;
  const contextLimit = currentSessionData?.contextTokens || getContextLimit(model);

  const getWorkspaceSwitchLabel = useCallback((sessionKey: string) => {
    const targetSession = sessions.find((session) => getSessionKey(session) === sessionKey);
    if (targetSession) {
      return getSessionDisplayLabel(targetSession, agentName);
    }

    const targetAgentId = getWorkspaceAgentId(sessionKey);
    return targetAgentId === 'main' ? `${agentName} (main)` : `Agent ${targetAgentId}`;
  }, [agentName, sessions]);

  const requestWorkspaceTransition = useCallback((
    _targetSessionKey: string,
    _targetLabel: string,
    execute: () => Promise<void>,
  ) => {
    // Chat navigation is intentionally decoupled from the file browser workspace.
    // The shared workspace stays pinned to `main`, so switching chats should not
    // trigger save/discard prompts that were meant for cross-workspace navigation.
    return execute().then(() => true);
  }, []);

  const handleCancelWorkspaceSwitch = useCallback(() => {
    if (workspaceSwitchAction || !pendingWorkspaceSwitch) return;

    pendingWorkspaceSwitch.resolve(false);
    setPendingWorkspaceSwitch(null);
    setWorkspaceSwitchAction(null);
    setWorkspaceSwitchError(null);
  }, [pendingWorkspaceSwitch, workspaceSwitchAction]);

  const handleSaveAndSwitch = useCallback(async () => {
    if (!pendingWorkspaceSwitch || workspaceSwitchAction) return;

    const pendingSwitch = pendingWorkspaceSwitch;
    setWorkspaceSwitchAction('save');
    setWorkspaceSwitchError(null);

    const result = await saveAllDirtyFiles();
    if (!result.ok) {
      setWorkspaceSwitchAction(null);
      setWorkspaceSwitchError(buildWorkspaceSwitchErrorMessage(result));
      return;
    }

    try {
      await pendingSwitch.execute();
      pendingSwitch.resolve(true);
      setPendingWorkspaceSwitch(null);
      setWorkspaceSwitchError(null);
    } catch (error) {
      pendingSwitch.reject(error);
      setPendingWorkspaceSwitch(null);
      setWorkspaceSwitchError(null);
    } finally {
      setWorkspaceSwitchAction(null);
    }
  }, [pendingWorkspaceSwitch, saveAllDirtyFiles, workspaceSwitchAction]);

  const handleDiscardAndSwitch = useCallback(async () => {
    if (!pendingWorkspaceSwitch || workspaceSwitchAction) return;

    const pendingSwitch = pendingWorkspaceSwitch;
    setWorkspaceSwitchAction('discard');
    setWorkspaceSwitchError(null);
    discardAllDirtyFiles();

    try {
      await pendingSwitch.execute();
      pendingSwitch.resolve(true);
      setPendingWorkspaceSwitch(null);
      setWorkspaceSwitchError(null);
    } catch (error) {
      pendingSwitch.reject(error);
      setPendingWorkspaceSwitch(null);
      setWorkspaceSwitchError(null);
    } finally {
      setWorkspaceSwitchAction(null);
    }
  }, [discardAllDirtyFiles, pendingWorkspaceSwitch, workspaceSwitchAction]);

  const handleSessionChange = useCallback((key: string) => {
    setChatSearchTarget(null);
    void requestWorkspaceTransition(key, getWorkspaceSwitchLabel(key), async () => {
      setCurrentSession(key);
    });
  }, [getWorkspaceSwitchLabel, requestWorkspaceTransition, setCurrentSession]);

  const handleSpawnSession = useCallback((opts: SpawnSessionOpts) => {
    const targetSessionKey = opts.kind === 'root'
      ? buildAgentRootSessionKey(opts.agentName?.trim() || 'agent', sessions.map(getSessionKey))
      : opts.parentSessionKey?.trim() || getWorkspaceRootSessionKey(currentSession) || currentSession;
    const targetLabel = opts.kind === 'root'
      ? opts.agentName?.trim() || 'New agent'
      : getWorkspaceSwitchLabel(targetSessionKey);

    return requestWorkspaceTransition(targetSessionKey, targetLabel, async () => {
      await spawnSession(opts);
    });
  }, [currentSession, getWorkspaceSwitchLabel, requestWorkspaceTransition, sessions, spawnSession]);

  // Boot sequence: fade in panels when connected
  useEffect(() => {
    if (connectionState === 'connected' && !booted) {
      const timer = setTimeout(() => setBooted(true), 50);
      return () => clearTimeout(timer);
    }
  }, [connectionState, booted]);

  // Log header glow when new entries arrive
  // This effect legitimately needs to set state in response to prop changes
  // (visual feedback for new log entries)
  useEffect(() => {
    const currentCount = agentLogEntries.length;
    if (currentCount > prevLogCount.current) {
      setLogGlow(true);
      const timer = setTimeout(() => setLogGlow(false), 500);
      prevLogCount.current = currentCount;
      return () => clearTimeout(timer);
    }
    prevLogCount.current = currentCount;
  }, [agentLogEntries.length]);

  const handleCompactLayoutChange = useCallback((nextIsCompactLayout: boolean) => {
    setIsCompactLayout(nextIsCompactLayout);
    if (!nextIsCompactLayout) {
      setIsMobileTopBarHidden(false);
    }
    setFileBrowserCollapsedState(prevCollapsed => {
      if (nextIsCompactLayout) {
        persistDesktopFileBrowserCollapsed(prevCollapsed);
        return true;
      }

      return desktopFileBrowserCollapsed;
    });
  }, [desktopFileBrowserCollapsed, persistDesktopFileBrowserCollapsed]);

  // Responsive mode: switch to chat-first layout on smaller screens
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = (event: MediaQueryListEvent) => {
      handleCompactLayoutChange(event.matches);
    };

    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }

    // Safari fallback
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [handleCompactLayoutChange]);

  const topLevelChats = useMemo(() => getTopLevelAgentSessions(sessions), [sessions]);

  useEffect(() => {
    try {
      const migrated = localStorage.getItem(CHAT_HISTORY_WIDTH_MIGRATION_KEY) === 'true';
      if (migrated) return;
      setPanelRatio(DEFAULT_CHAT_HISTORY_PANEL_RATIO);
      localStorage.setItem(CHAT_HISTORY_WIDTH_MIGRATION_KEY, 'true');
    } catch {
      setPanelRatio(DEFAULT_CHAT_HISTORY_PANEL_RATIO);
    }
  }, [setPanelRatio]);

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

  useEffect(() => {
    if (!chatVisibilityInitialized) return;
    try {
      localStorage.setItem(CHAT_VISIBILITY_STORAGE_KEY, JSON.stringify(Array.from(visibleChatKeys)));
    } catch {
      // ignore storage failures
    }
  }, [chatVisibilityInitialized, visibleChatKeys]);

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

  // Handlers for TTS provider/model changes
  const handleTtsProviderChange = useCallback((provider: TTSProvider) => {
    setTtsProvider(provider);
  }, [setTtsProvider]);

  const handleTtsModelChange = useCallback((model: string) => {
    setTtsModel(model);
  }, [setTtsModel]);

  const handleSttProviderChange = useCallback((provider: 'local' | 'openai') => {
    setSttProvider(provider);
  }, [setSttProvider]);

  const handleSttInputModeChange = useCallback((mode: STTInputMode) => {
    setSttInputMode(mode);
  }, [setSttInputMode]);

  const handleSttModelChange = useCallback((model: string) => {
    setSttModel(model);
  }, [setSttModel]);

  useEffect(() => {
    if (!desktopRightPanelWidth || desktopRightPanelWidth <= 0) return;
    if (toolPanelCollapsed) {
      setToolPanelChatBaselineWidth(desktopRightPanelWidth);
    }
  }, [desktopRightPanelWidth, setToolPanelChatBaselineWidth, toolPanelCollapsed]);

  useEffect(() => {
    const baselineWidth = toolPanelChatBaselineWidth ?? desktopRightPanelWidth;
    if (!baselineWidth || baselineWidth <= 0) return;

    const exactHalfWidth = Math.max(320, Math.round(baselineWidth / 2));

    if (toolPanelWidth === null) {
      setToolPanelWidth(exactHalfWidth);
      return;
    }

    // Keep the live width aligned to exactly half of the pre-tool chat width.
    if (Math.abs(toolPanelWidth - exactHalfWidth) > 2) {
      setToolPanelWidth(exactHalfWidth);
    }
  }, [desktopRightPanelWidth, setToolPanelWidth, toolPanelChatBaselineWidth, toolPanelWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateMetrics = () => {
      const chatWidth = activeChatPaneRef.current ? Math.round(activeChatPaneRef.current.getBoundingClientRect().width) : null;
      const toolWidth = activeToolPaneRef.current ? Math.round(activeToolPaneRef.current.getBoundingClientRect().width) : null;
      setToolPanelDebugMetrics({
        chatWidth,
        toolWidth,
        combinedWidth: chatWidth !== null && toolWidth !== null ? chatWidth + toolWidth : null,
        baselineWidth: toolPanelChatBaselineWidth ?? desktopRightPanelWidth ?? null,
      });
    };

    updateMetrics();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateMetrics());
    if (activeChatPaneRef.current) observer.observe(activeChatPaneRef.current);
    if (activeToolPaneRef.current) observer.observe(activeToolPaneRef.current);
    return () => observer.disconnect();
  }, [desktopRightPanelWidth, toolPanelChatBaselineWidth, toolPanelCollapsed, toolPanelWidth]);

  const visibleSaveToast = saveToast?.agentId === sharedWorkspaceAgentId
    && saveToast.workspaceVersion === workspaceVersion
    ? saveToast
    : null;

  const activeChatSearchTarget = chatSearchTarget && chatSearchTarget.sessionKey === currentSession
    ? chatSearchTarget
    : null;

  const chatContent = (
    <TabbedContentArea
      activeTab={activeTab}
      openFiles={openFiles}
      workspaceAgentId={sharedWorkspaceAgentId}
      onSelectTab={setActiveTab}
      onCloseTab={closeFile}
      onContentChange={updateContent}
      onSaveFile={handleSaveFile}
      saveToast={visibleSaveToast}
      onDismissToast={dismissSaveToast}
      onReloadFile={reloadFile}
      onRetryFile={reloadFile}
      chatPanel={
        <PanelErrorBoundary name="Chat">
          <ChatPanel
            ref={chatPanelRef}
            id="main-chat"
            messages={messages}
            onSend={handleSend}
            onAbort={handleAbort}
            isGenerating={isGenerating}
            stream={stream}
            processingStage={processingStage}
            lastEventTimestamp={lastEventTimestamp}
            currentToolDescription={currentToolDescription}
            activityLog={activityLog}
            onWakeWordState={handleWakeWordState}
            onReset={handleReset}
            searchOpen={searchOpen}
            onSearchClose={closeSearch}
            agentName={currentSessionDisplayName}
            sessionTitle={currentSessionDisplayName}
            onRenameSession={handleRenameCurrentSession}
            loadMore={loadMore}
            hasMore={hasMore}
            onToggleFileBrowser={isCompactLayout ? handleToggleFileBrowser : fileBrowserCollapsed ? handleToggleFileBrowser : undefined}
            isFileBrowserCollapsed={fileBrowserCollapsed}
            onToggleMobileTopBar={isCompactLayout ? toggleMobileTopBar : undefined}
            isMobileTopBarHidden={isMobileTopBarHidden}
            onToggleToolPanel={handleToggleToolPanel}
            isToolPanelCollapsed={toolPanelCollapsed}
            selectedToolId={selectedToolId}
            onSelectTool={setSelectedToolId}
            onOpenWorkspacePath={openWorkspacePath}
            searchTarget={activeChatSearchTarget}
            voiceState={voiceState}
            interimTranscript={interimTranscript}
            startRecording={handleStartPersistentRecording}
            stopAndTranscribe={stopAndTranscribe}
            wakeWordEnabled={voiceWakeWordEnabled}
            toggleWakeWord={toggleWakeWord}
            voiceError={voiceError}
            clearVoiceError={clearVoiceError}
            voiceOriginSessionKey={voiceOriginSessionKey}
          />
        </PanelErrorBoundary>
      }
    />
  );

  const renderSidebarPanels = (onSelect: (key: string) => Promise<void> | void) => (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted-foreground text-xs bg-background">Loading…</div>}>
      <div className="shell-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[28px]">
        <PanelErrorBoundary name="Chat History">
          <SessionList
            displayMode="chat"
            sessions={visibleTopLevelChats}
            currentSession={currentSession}
            busyState={busyState}
            agentStatus={agentStatus}
            unreadSessions={unreadSessions}
            onSelect={onSelect}
            onSelectSearchResult={handleSelectChatSearchResult}
            onDelete={deleteSession}
            onSpawn={handleSpawnSession}
            onRename={renameSession}
            onAbort={abortSession}
            isLoading={sessionsLoading}
            agentName={agentName}
          />
        </PanelErrorBoundary>
      </div>
    </Suspense>
  );

  const compactSessionsPanel = (
    <Suspense fallback={<div className="p-4 text-muted-foreground text-xs">Loading sessions…</div>}>
      <PanelErrorBoundary name="Sessions">
        <SessionList
          displayMode="chat"
          sessions={visibleTopLevelChats}
          currentSession={currentSession}
          busyState={busyState}
          agentStatus={agentStatus}
          unreadSessions={unreadSessions}
          onSelect={handleSessionChange}
          onSelectSearchResult={handleSelectChatSearchResult}
          onDelete={deleteSession}
          onSpawn={handleSpawnSession}
          onRename={renameSession}
          onAbort={abortSession}
          isLoading={sessionsLoading}
          agentName={agentName}
          compact
        />
      </PanelErrorBoundary>
    </Suspense>
  );

  const compactWorkspacePanel = undefined;

  const showCompactFileBrowser = isCompactLayout && viewMode !== 'kanban' && !fileBrowserCollapsed;

  return (
    <div className="scan-lines relative h-screen flex flex-col overflow-hidden" data-booted={booted}>
      {/* Skip to main content link for keyboard navigation */}
      <a 
        href="#main-chat" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:font-bold focus:text-sm"
      >
        Skip to chat
      </a>
      {(voiceState === 'recording' || voiceState === 'transcribing') && voiceOriginSessionKey && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-border/80 bg-card/95 px-4 py-3 text-sm text-foreground shadow-[0_22px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-2xl ${voiceState === 'recording' ? 'bg-red-500/12 text-red-400' : 'bg-primary/12 text-primary'}`}>
              {voiceState === 'transcribing' ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-[-0.02em]">
                  {voiceState === 'recording' ? 'Recording in progress' : 'Transcribing voice note'}
                </span>
                {voiceElapsedMs > 0 && (
                  <span className="rounded-full bg-background/70 px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                    {Math.floor(voiceElapsedMs / 60000).toString().padStart(2, '0')}:{Math.floor((voiceElapsedMs % 60000) / 1000).toString().padStart(2, '0')}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {voiceState === 'recording'
                  ? `This recording will be sent to ${voiceOriginSessionLabel || 'the chat where it started'}.`
                  : `Finishing and delivering to ${voiceOriginSessionLabel || 'the originating chat'}.`}
              </p>
            </div>
            {voiceState === 'recording' && (
              <button
                type="button"
                onClick={() => { void discardRecording(); }}
                className="cockpit-toolbar-button"
              >
                <Square size={14} aria-hidden="true" />
                Discard
              </button>
            )}
            <button
              type="button"
              onClick={() => { void stopAndTranscribe(); }}
              disabled={voiceState !== 'recording'}
              className={`cockpit-toolbar-button ${voiceState !== 'recording' ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {voiceState === 'transcribing' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}
              {voiceState === 'recording' ? 'Stop + transcribe' : 'Transcribing…'}
            </button>
          </div>
        </div>
      )}

      <ConnectDialog
        open={dialogOpen && connectionState !== 'connected' && connectionState !== 'reconnecting'}
        onConnect={handleConnect}
        error={connectError}
        defaultUrl={editableUrl}
        defaultToken={editableToken}
        officialUrl={officialUrl}
        serverSideAuth={serverSideAuth}
      />

      {startupPending && connectionState !== 'connected' && (
        <div className="fixed left-1/2 top-12 z-50 flex max-w-[calc(100vw-1.067rem)] -translate-x-1/2 items-start gap-2 rounded-2xl border border-primary/25 bg-card/94 px-4 py-2 text-xs font-medium text-foreground shadow-[0_20px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <span className="inline-flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PlugZap size={14} aria-hidden="true" />
          </span>
          <span className="min-w-0 text-left leading-5">Connecting to your workspace…</span>
          <span className="size-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
        </div>
      )}

      {showManagedFallback && connectionState === 'disconnected' && !dialogOpen && (
        <div className="fixed left-1/2 top-12 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 items-start gap-3 rounded-3xl border border-border/75 bg-card/96 px-4 py-4 text-sm text-foreground shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-5">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-orange/10 text-orange">
            <AlertTriangle size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold tracking-[-0.02em]">Couldn’t connect automatically.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {connectError || 'Managed gateway connection failed. You can retry or open connection settings.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { void handleReconnect(); }}
                className="cockpit-toolbar-button"
              >
                <RotateCw size={14} aria-hidden="true" />
                Retry
              </button>
              <button
                type="button"
                onClick={openManualConnect}
                className="cockpit-toolbar-button"
              >
                Connection settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
       * Gateway state banners.
       * Kept compact and centered so they read as transient shell notices instead of old alarm strips.
       */}
      {connectionState === 'reconnecting' && !gatewayRestarting && (
        <div className="fixed left-1/2 top-12 z-50 flex max-w-[calc(100vw-1.067rem)] -translate-x-1/2 items-start gap-2 rounded-2xl border border-destructive/25 bg-card/94 px-4 py-2 text-xs font-medium text-foreground shadow-[0_20px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <span className="inline-flex size-7 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle size={14} aria-hidden="true" />
          </span>
          <span className="min-w-0 text-left leading-5">
            Signal lost. Reconnecting{reconnectAttempt > 1 ? `, attempt ${reconnectAttempt}` : ''}.
          </span>
          <span className="size-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
        </div>
      )}

      {gatewayRestarting && (
        <div className="fixed left-1/2 top-12 z-50 flex max-w-[calc(100vw-1.067rem)] -translate-x-1/2 items-start gap-2 rounded-2xl border border-orange/25 bg-card/94 px-4 py-2 text-xs font-medium text-foreground shadow-[0_20px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <span className="inline-flex size-7 items-center justify-center rounded-xl bg-orange/10 text-orange">
            <RotateCw size={14} className="animate-spin" aria-hidden="true" />
          </span>
          <span className="min-w-0 text-left leading-5">Gateway restarting…</span>
        </div>
      )}

      {!gatewayRestarting && gatewayRestartNotice && (
        <button
          type="button"
          onClick={dismissNotice}
          className={`fixed left-1/2 top-12 z-50 flex max-w-[calc(100vw-1.067rem)] -translate-x-1/2 cursor-pointer items-start gap-2 rounded-2xl border px-4 py-2 text-xs font-medium shadow-[0_20px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-transform hover:-translate-x-1/2 hover:-translate-y-px ${
            gatewayRestartNotice.ok
              ? 'border-green/25 bg-card/94 text-foreground'
              : 'border-destructive/25 bg-card/94 text-foreground'
          }`}
        >
          <span className={`inline-flex size-7 items-center justify-center rounded-xl ${
            gatewayRestartNotice.ok ? 'bg-green/10 text-green' : 'bg-destructive/10 text-destructive'
          }`}>
            {gatewayRestartNotice.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
          </span>
          <span className="min-w-0 text-left leading-5">{gatewayRestartNotice.message}</span>
        </button>
      )}
      
      {(!isCompactLayout || !isMobileTopBarHidden) && (
        <TopBar
          onSettings={openSettings}
          agentLogEntries={agentLogEntries}
          tokenData={tokenData}
          logGlow={logGlow}
          eventEntries={eventEntries}
          eventsVisible={eventsVisible}
          logVisible={logVisible}
          mobilePanelButtonsVisible={isCompactLayout}
          sessionsPanel={compactSessionsPanel}
          workspacePanel={compactWorkspacePanel}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}
      
      <PanelErrorBoundary name="Settings">
        <Suspense fallback={null}>
          <SettingsDrawer
            open={settingsOpen}
            onClose={closeSettings}
            gatewayUrl={editableUrl}
            gatewayToken={editableToken}
            onUrlChange={setEditableUrl}
            onTokenChange={setEditableToken}
            onReconnect={handleReconnect}
            connectionState={connectionState}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            ttsProvider={ttsProvider}
            ttsModel={ttsModel}
            onTtsProviderChange={handleTtsProviderChange}
            onTtsModelChange={handleTtsModelChange}
            sttProvider={sttProvider}
            sttInputMode={sttInputMode}
            sttModel={sttModel}
            onSttProviderChange={handleSttProviderChange}
            onSttInputModeChange={handleSttInputModeChange}
            onSttModelChange={handleSttModelChange}
            wakeWordEnabled={wakeWordEnabled}
            onToggleWakeWord={handleToggleWakeWord}
            liveTranscriptionPreview={liveTranscriptionPreview}
            onToggleLiveTranscriptionPreview={toggleLiveTranscriptionPreview}
            agentName={agentName}
            onLogout={onLogout}
            onGatewayRestart={handleGatewayRestart}
            gatewayRestarting={gatewayRestarting}
          />
        </Suspense>
      </PanelErrorBoundary>
      
      <div className="flex-1 flex gap-3 overflow-hidden min-h-0 px-2 pt-1.5 pb-2 sm:px-4 sm:pt-2 sm:pb-2">
        {/* File tree — desktop inline, mobile drawer */}
        {!isCompactLayout && (
          <div className={viewMode === 'kanban' ? 'hidden' : fileBrowserCollapsed ? 'contents' : 'h-full min-h-0'}>
            <PanelErrorBoundary name="File Explorer">
              <FileTreePanel
                workspaceAgentId={sharedWorkspaceAgentId}
                onOpenFile={openFile}
                lastChangedEvent={lastChangedEvent}
                revealRequest={revealRequest}
                onRemapOpenPaths={remapOpenPaths}
                onCloseOpenPaths={closeOpenPathsByPrefix}
                isCompactLayout={false}
                collapsed={fileBrowserCollapsed}
                onCollapseChange={setFileBrowserCollapsed}
              />
            </PanelErrorBoundary>
          </div>
        )}

        {showCompactFileBrowser && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 hidden bg-black/48 backdrop-blur-sm max-[900px]:block"
              onClick={() => setFileBrowserCollapsed(true)}
              aria-label="Close file explorer"
            />
            <div className={`pointer-events-none fixed inset-0 z-40 hidden px-2 pb-[4.25rem] max-[900px]:flex ${isMobileTopBarHidden ? 'pt-2' : 'pt-[4.5rem]'}`}>
              <div className="pointer-events-auto h-full w-[min(86vw,320px)] max-w-full animate-in slide-in-from-left-4 duration-200">
                <PanelErrorBoundary name="File Explorer">
                  <FileTreePanel
                    workspaceAgentId={sharedWorkspaceAgentId}
                    onOpenFile={openFile}
                    lastChangedEvent={lastChangedEvent}
                    revealRequest={revealRequest}
                    onRemapOpenPaths={remapOpenPaths}
                    onCloseOpenPaths={closeOpenPathsByPrefix}
                    isCompactLayout={true}
                    collapsed={false}
                    onCollapseChange={setFileBrowserCollapsed}
                  />
                </PanelErrorBoundary>
              </div>
            </div>
          </>
        )}

        {/*
         * Chat panel is always rendered but hidden when kanban is active.
         * This keeps ChatPanel → InputBar → useVoiceInput mounted so that
         * in-progress voice recording / STT transcription survives tab switches.
         * See: https://github.com/.../issues/64
         */}
        {viewMode === 'kanban' && (
          <div className="shell-panel boot-panel flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden rounded-[28px]">
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted-foreground text-xs bg-background">Loading…</div>}>
              <KanbanPanel initialTaskId={pendingTaskId} onInitialTaskConsumed={() => setPendingTaskId(null)} />
            </Suspense>
          </div>
        )}
        {isCompactLayout ? (
          <div ref={activeChatPaneRef} className={`shell-panel flex-1 min-w-0 min-h-0 overflow-hidden rounded-[28px] boot-panel${viewMode === 'kanban' ? ' hidden' : ''}`}>
            {chatContent}
          </div>
        ) : (
          <div style={{ display: viewMode === 'kanban' ? 'none' : 'contents' }}>
            <ResizablePanels
              leftPercent={panelRatio}
              leftWidthPx={DEFAULT_CHAT_HISTORY_WIDTH_PX}
              onResize={setPanelRatio}
              minLeftPercent={30}
              maxLeftPercent={85}
              rightWidthPx={fileBrowserCollapsed ? desktopRightPanelWidth : null}
              onRightWidthChange={fileBrowserCollapsed ? undefined : setDesktopRightPanelWidth}
              leftClassName="boot-panel flex flex-col"
              rightClassName="boot-panel flex flex-col"
              left={renderSidebarPanels(handleSessionChange)}
              right={(
                <div className="flex h-full min-h-0 min-w-0 gap-3 overflow-hidden">
                  <div
                    ref={activeChatPaneRef}
                    className="shell-panel boot-panel min-h-0 overflow-hidden rounded-[28px]"
                    style={toolPanelCollapsed
                      ? { flex: '1 1 auto', minWidth: 0 }
                      : { flex: '0 0 auto', width: `${toolPanelWidth ?? Math.max(320, Math.round(((toolPanelChatBaselineWidth ?? desktopRightPanelWidth ?? 640)) / 2))}px`, minWidth: 0 }}
                  >
                    {chatContent}
                  </div>
                  <div
                    ref={activeToolPaneRef}
                    className="boot-panel min-h-0"
                    style={toolPanelCollapsed
                      ? { flex: '0 0 auto', width: `${TOOL_PANEL_RAIL_WIDTH_PX}px`, minWidth: 0 }
                      : { flex: '0 0 auto', width: `${toolPanelWidth ?? Math.max(320, Math.round(((toolPanelChatBaselineWidth ?? desktopRightPanelWidth ?? 640)) / 2))}px`, minWidth: 0 }}
                  >
                    <ToolPanel
                      collapsed={toolPanelCollapsed}
                      onCollapseChange={setToolPanelCollapsed}
                      selectedToolId={selectedToolId}
                      onSelectTool={setSelectedToolId}
                      debugMetrics={toolPanelDebugMetrics}
                    />
                  </div>
                </div>
              )}
            />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="boot-panel" style={{ transitionDelay: '200ms' }}>
        <StatusBar
          connectionState={connectionState}
          sparkline={sparkline}
          contextTokens={contextTokens}
          contextLimit={contextLimit}
        />
      </div>

      {/* Command Palette */}
      <PanelErrorBoundary name="Command Palette">
        <Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onClose={closePalette}
            commands={commands}
          />
        </Suspense>
      </PanelErrorBoundary>

      {/* Reset Session Confirmation */}
      <ConfirmDialog
        open={showResetConfirm}
        title="Reset Session"
        message="This will start fresh and clear all context."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onConfirm={confirmReset}
        onCancel={cancelReset}
        variant="danger"
      />

      {/* Gateway Restart Confirmation */}
      <ConfirmDialog
        open={showGatewayRestartConfirm}
        title="Restart OpenClaw Gateway"
        message="This will briefly interrupt gateway connectivity. Continue?"
        confirmLabel="Restart"
        cancelLabel="Cancel"
        onConfirm={confirmGatewayRestart}
        onCancel={cancelGatewayRestart}
        variant="warning"
      />

      <WorkspaceSwitchDialog
        open={pendingWorkspaceSwitch !== null}
        targetLabel={pendingWorkspaceSwitch?.targetLabel || 'the other agent'}
        pendingAction={workspaceSwitchAction}
        error={workspaceSwitchError}
        onSaveAndSwitch={handleSaveAndSwitch}
        onDiscardAndSwitch={handleDiscardAndSwitch}
        onCancel={handleCancelWorkspaceSwitch}
      />

      {/* Spawn Agent Dialog (from command palette) */}
      <SpawnAgentDialog
        open={spawnDialogOpen}
        onOpenChange={setSpawnDialogOpen}
        onSpawn={handleSpawnSession}
      />
    </div>
  );
}
