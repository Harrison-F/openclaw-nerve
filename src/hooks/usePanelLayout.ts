import { useState, useEffect, useRef, useCallback } from 'react';

// Storage key constants
const TOOL_PANEL_WIDTH_STORAGE_KEY = 'nerve-tool-panel-width-v3';
const TOOL_PANEL_CHAT_BASELINE_STORAGE_KEY = 'nerve-tool-panel-chat-baseline-v1';
const TOOL_PANEL_COLLAPSED_STORAGE_KEY = 'nerve-tool-panel-collapsed';
const TOOL_PANEL_SELECTED_STORAGE_KEY = 'nerve-tool-panel-selected-tool';
const CHAT_HISTORY_COLLAPSED_STORAGE_KEY = 'nerve-chat-history-collapsed';
const CHAT_HISTORY_WIDTH_STORAGE_KEY = 'nerve-chat-history-width';

// Exported layout constants
export const TOOL_PANEL_RAIL_WIDTH_PX = 56;
export const CHAT_HISTORY_RAIL_WIDTH_PX = 56;

export interface ToolPanelDebugMetrics {
  chatWidth: number | null;
  toolWidth: number | null;
  combinedWidth: number | null;
  baselineWidth: number | null;
}

export function usePanelLayout() {
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

  const [isMobileTopBarHidden, setIsMobileTopBarHidden] = useState(false);
  const [desktopRightPanelWidth] = useState<number | null>(null);
  const [chatHistoryCollapsed, setChatHistoryCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CHAT_HISTORY_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [chatHistoryWidth, setChatHistoryWidthState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(CHAT_HISTORY_WIDTH_STORAGE_KEY);
      const parsed = saved ? Number(saved) : NaN;
      return Number.isFinite(parsed) ? Math.max(240, Math.min(520, parsed)) : 320;
    } catch {
      return 320;
    }
  });
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
  const [toolPanelDebugMetrics, setToolPanelDebugMetrics] = useState<ToolPanelDebugMetrics>({
    chatWidth: null,
    toolWidth: null,
    combinedWidth: null,
    baselineWidth: null,
  });
  const [chatToolRegionWidth, setChatToolRegionWidth] = useState<number | null>(null);
  const [toolPanelManualWidth, setToolPanelManualWidth] = useState(false);

  const activeChatPaneRef = useRef<HTMLDivElement | null>(null);
  const activeToolPaneRef = useRef<HTMLDivElement | null>(null);
  const chatToolRegionRef = useRef<HTMLDivElement | null>(null);
  const toolDragFrameRef = useRef<number | null>(null);
  const toolDragPendingWidthRef = useRef<number | null>(null);

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
    const clamped = Math.max(240, Math.min(1600, Math.round(nextWidth)));
    console.debug('[setToolPanelWidth]', { nextWidth, clamped });
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

  const setChatHistoryCollapsed = useCallback((nextCollapsed: boolean | ((prev: boolean) => boolean)) => {
    setChatHistoryCollapsedState(prevCollapsed => {
      const resolved = typeof nextCollapsed === 'function' ? nextCollapsed(prevCollapsed) : nextCollapsed;
      try {
        localStorage.setItem(CHAT_HISTORY_COLLAPSED_STORAGE_KEY, String(resolved));
      } catch {
        // ignore storage errors
      }
      return resolved;
    });
  }, []);

  const handleToggleChatHistory = useCallback(() => {
    setChatHistoryCollapsed(prev => !prev);
  }, [setChatHistoryCollapsed]);

  const setChatHistoryWidth = useCallback((nextWidth: number) => {
    const clamped = Math.max(240, Math.min(520, Math.round(nextWidth)));
    setChatHistoryWidthState(clamped);
    try {
      localStorage.setItem(CHAT_HISTORY_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleMobileTopBar = useCallback(() => {
    setIsMobileTopBarHidden((prev) => !prev);
  }, []);

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

  // desktopRightPanelWidth -> toolPanelChatBaselineWidth effect
  useEffect(() => {
    if (!desktopRightPanelWidth || desktopRightPanelWidth <= 0) return;
    if (toolPanelCollapsed) {
      setToolPanelChatBaselineWidth(desktopRightPanelWidth);
    }
  }, [desktopRightPanelWidth, setToolPanelChatBaselineWidth, toolPanelCollapsed]);

  // chatToolRegion resize observer
  useEffect(() => {
    if (typeof window === 'undefined' || !chatToolRegionRef.current) return;
    const update = () => {
      if (!chatToolRegionRef.current) return;
      setChatToolRegionWidth(Math.round(chatToolRegionRef.current.getBoundingClientRect().width));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => update());
    observer.observe(chatToolRegionRef.current);
    return () => observer.disconnect();
  }, [toolPanelCollapsed]);

  // Tool panel auto-sizing effect
  useEffect(() => {
    const measuredBaselineWidth = toolPanelCollapsed
      ? desktopRightPanelWidth
      : chatToolRegionWidth;
    const baselineWidth = measuredBaselineWidth ?? toolPanelChatBaselineWidth ?? desktopRightPanelWidth;
    if (!baselineWidth || baselineWidth <= 0) return;

    const gapPx = toolPanelCollapsed ? 0 : 12;
    const exactHalfWidth = Math.max(320, Math.round((baselineWidth - gapPx) / 2));

    if (toolPanelWidth === null) {
      setToolPanelWidth(exactHalfWidth);
      return;
    }

    if (!toolPanelManualWidth && Math.abs(toolPanelWidth - exactHalfWidth) > 2) {
      setToolPanelWidth(exactHalfWidth);
    }
  }, [chatToolRegionWidth, desktopRightPanelWidth, setToolPanelWidth, toolPanelChatBaselineWidth, toolPanelCollapsed, toolPanelManualWidth, toolPanelWidth]);

  // Debug metrics resize observer
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

  return {
    // File browser state
    fileBrowserCollapsed,
    setFileBrowserCollapsed,
    desktopFileBrowserCollapsed,
    initialCompactLayout,
    initialDesktopFileBrowserCollapsed,

    // Compact layout
    isCompactLayout,
    setIsCompactLayout,
    handleCompactLayoutChange,

    // Tool panel state
    toolPanelCollapsed,
    setToolPanelCollapsed,
    selectedToolId,
    setSelectedToolId,
    toolPanelWidth,
    setToolPanelWidth,
    toolPanelChatBaselineWidth,
    setToolPanelChatBaselineWidth,
    toolPanelManualWidth,
    setToolPanelManualWidth,
    toolPanelDebugMetrics,
    chatToolRegionWidth,

    // Chat history state
    chatHistoryCollapsed,
    setChatHistoryCollapsed,
    chatHistoryWidth,
    setChatHistoryWidth,

    // Mobile top bar
    isMobileTopBarHidden,
    setIsMobileTopBarHidden,

    // Desktop right panel
    desktopRightPanelWidth,

    // Toggle handlers
    handleToggleFileBrowser,
    handleToggleToolPanel,
    handleToggleChatHistory,
    toggleMobileTopBar,

    // Refs
    activeChatPaneRef,
    activeToolPaneRef,
    chatToolRegionRef,
    toolDragFrameRef,
    toolDragPendingWidthRef,
  };
}
