# Nerve Refactoring Plan

## Task 1: Decompose App.tsx (1,671 → ~200 lines)

### Extract these modules:

**1a. `src/hooks/useVoiceManager.ts`** (~80 lines)
- All voice-related state: voiceLang, voicePhrasesVersion, voiceOriginSessionKey, voiceStartedAt, voiceElapsedMs
- useVoiceInput integration
- handleStartPersistentRecording
- Voice timer effect
- Language fetch effect
- voiceOriginSessionLabel computation

**1b. `src/hooks/usePanelLayout.ts`** (~200 lines)
- All panel state: fileBrowserCollapsed, toolPanelCollapsed, toolPanelWidth, chatHistoryCollapsed, chatHistoryWidth, isCompactLayout, isMobileTopBarHidden
- All localStorage persistence for panel widths/collapsed states
- Panel toggle handlers
- Responsive media query effect
- Tool panel debug metrics + resize observers

**1c. `src/hooks/useWorkspaceFiles.ts`** (~100 lines)
- openFiles integration (useOpenFiles)
- saveToast state and handlers
- workspaceVersion state
- File change handler
- handleSaveFile, onFileChanged

**1d. `src/hooks/useWorkspaceSwitch.ts`** (~60 lines)
- pendingWorkspaceSwitch state
- handleSaveAndSwitch, handleDiscardAndSwitch, handleCancelWorkspaceSwitch
- requestWorkspaceTransition

**1e. `src/hooks/useChatVisibility.ts`** (~50 lines)
- visibleChatKeys state
- chatVisibilityInitialized
- localStorage sync effects
- visibleTopLevelChats computation

**1f. `src/components/layout/MainLayout.tsx`** (~200 lines)
- The JSX return from App: shell structure, file browser, chat+tool panels, status bar
- Desktop vs compact layout branching
- Resize drag handles

**1g. `src/components/layout/NotificationBanners.tsx`** (~100 lines)
- Voice recording banner
- Connection pending banner
- Managed fallback banner
- Reconnecting banner
- Gateway restarting banner
- Gateway restart notice banner

**1h. `src/components/layout/Dialogs.tsx`** (~40 lines)
- ConnectDialog
- ConfirmDialog (reset session)
- ConfirmDialog (gateway restart)
- WorkspaceSwitchDialog
- SpawnAgentDialog

App.tsx then becomes a thin shell that composes hooks + layout.

## Task 2: Add Client-Side Router

Use React Router v7 (most mature, best React 19 support):
- `/` → Chat view (default)
- `/kanban` → Kanban board
- `/m` → Mobile shell (already handled via pathname check)
- Future: `/settings`, `/dashboard`

Replace the current viewMode state + pathname check with proper routes.
Wrap App in BrowserRouter in main.tsx.

## Task 3: Split Contexts

**SettingsContext** (367 lines → 3 pieces):
- `AudioSettingsContext` — TTS/STT/voice/sound settings
- `AppearanceContext` — theme, font, fontSize, editorFontSize
- `LayoutSettingsContext` — panelRatio, telemetryVisible, eventsVisible, logVisible

**SessionContext** (830 lines → 3-4 pieces):
- `SessionContext` (core) — sessions, sessionsLoading, CRUD operations
- `useAgentStatus` hook — agentStatus, busyState
- `useAgentLog` hook — agentLogEntries, feedAgentLog
- `useEventLog` hook — eventEntries

**ChatContext** — leave as-is for now (already decomposed into hooks internally)

## Task 4: Bundle Audit

- Add rollup-plugin-visualizer for visibility
- Lazy-load CodeMirror (already lazy but verify chunking)
- Move recharts + lightweight-charts into explicit manualChunks
- Limit highlight.js language imports
- Verify radix-ui tree-shaking
- Remove chunkSizeWarningLimit: 600 (stop masking the problem)
