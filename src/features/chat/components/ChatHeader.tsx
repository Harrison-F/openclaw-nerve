import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, Gauge, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { InlineSelect } from '@/components/ui/InlineSelect';
import { TOOL_DEFINITIONS } from '@/features/tools/toolRegistry';
import { useModelEffort } from './useModelEffort';

interface ChatHeaderProps {
  onReset?: () => void;
  onAbort: () => void;
  isGenerating: boolean;
  sessionTitle?: string;
  onRenameSession?: (nextTitle: string) => Promise<void> | void;
  /** File explorer toggle button shown on smaller layouts. */
  onToggleFileBrowser?: () => void;
  /** Whether the file explorer is currently collapsed. */
  isFileBrowserCollapsed?: boolean;
  /** Mobile top bar toggle handler. */
  onToggleMobileTopBar?: () => void;
  /** Whether the mobile top bar is currently hidden. */
  isMobileTopBarHidden?: boolean;
  /** Toggle the far-right tools panel. */
  onToggleToolPanel?: () => void;
  /** Whether the tools panel is currently collapsed. */
  isToolPanelCollapsed?: boolean;
  /** Create a new chat immediately. */
  onNewChat?: () => void;
  /** Currently selected tool id. */
  selectedToolId?: string | null;
  /** Pick a tool from the header menu. */
  onSelectTool?: (toolId: string | null) => void;
}

/**
 * COMMS header with model/effort selectors and controls.
 *
 * Model and effort state management is delegated to useModelEffort() —
 * this component is purely presentational + event wiring.
 */
export function ChatHeader({
  onReset,
  onAbort,
  isGenerating,
  sessionTitle = '',
  onRenameSession,
  onToggleFileBrowser,
  isFileBrowserCollapsed = true,
  onToggleMobileTopBar,
  isMobileTopBarHidden = false,
  onNewChat,
  selectedToolId = null,
  onSelectTool,
}: ChatHeaderProps) {
  const {
    modelOptions,
    effortOptions,
    selectedModel,
    selectedEffort,
    handleModelChange,
    handleEffortChange,
    controlsDisabled,
    uiError,
  } = useModelEffort();
  const [draftTitle, setDraftTitle] = useState(sessionTitle);
  const toolOptions = useMemo(() => [
    { value: '__none__', label: 'No tool selected' },
    ...TOOL_DEFINITIONS.map((tool) => ({ value: tool.id, label: tool.label })),
  ], []);

  useEffect(() => {
    setDraftTitle(sessionTitle);
  }, [sessionTitle]);

  const commitTitle = async () => {
    const trimmed = draftTitle.trim();
    const fallbackTitle = sessionTitle.trim();
    const nextTitle = trimmed || fallbackTitle;
    setDraftTitle(nextTitle);
    if (!onRenameSession || !nextTitle || nextTitle === sessionTitle.trim()) return;
    await onRenameSession(nextTitle);
  };

  return (
    <div className="panel-header items-center gap-2 overflow-x-auto border-l-[3px] border-l-primary/70 px-2.5 py-2 whitespace-nowrap sm:gap-2.5 sm:px-3 sm:py-3">
      {/* Mobile chrome controls */}
      {onToggleMobileTopBar ? (
        <div className="shell-panel flex size-11 shrink-0 flex-col overflow-hidden max-[371px]:size-[38px]">
          <button
            type="button"
            onClick={onToggleMobileTopBar}
            className="flex flex-1 items-center justify-center border-b border-border/70 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            title={isMobileTopBarHidden ? 'Show header controls' : 'Hide header controls'}
            aria-label={isMobileTopBarHidden ? 'Show header controls' : 'Hide header controls'}
          >
            {isMobileTopBarHidden ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            type="button"
            onClick={onToggleFileBrowser}
            disabled={!onToggleFileBrowser}
            className="flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
            title={`${isFileBrowserCollapsed ? 'Open' : 'Collapse'} file explorer (Ctrl+B)`}
            aria-label={`${isFileBrowserCollapsed ? 'Open' : 'Collapse'} file explorer`}
          >
            {isFileBrowserCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>
      ) : onToggleFileBrowser && (
        <button
          onClick={onToggleFileBrowser}
          className="shell-icon-button size-11 shrink-0 px-0 sm:size-10"
          title="Open file explorer (Ctrl+B)"
          aria-label="Open file explorer"
        >
          <PanelLeftOpen size={17} />
        </button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-1">
        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            className="shell-icon-button size-10 shrink-0 px-0"
            title="New chat"
            aria-label="New chat"
          >
            <Plus size={16} />
          </button>
        )}
        <input
          type="text"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => { void commitTitle(); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              setDraftTitle(sessionTitle);
              event.currentTarget.blur();
            }
          }}
          placeholder="Name this chat"
          aria-label="Chat title"
          className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-[0.86rem] font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-1 focus:ring-primary/35 sm:max-w-[340px]"
        />
      </div>

      {/* Model + Effort selectors on the right */}
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap sm:gap-2">
        {uiError && (
          <span
            className="hidden max-w-[220px] truncate text-[0.733rem] text-red md:inline"
            title={uiError}
            role="status"
            aria-live="polite"
          >
            ⚠ {uiError}
          </span>
        )}
        <div className="hidden min-w-0 shrink-0 items-center gap-0.5 lg:flex sm:gap-1">
          <Cpu size={12} className="hidden shrink-0 text-foreground/70 sm:block" aria-hidden="true" />
          <span className="hidden text-[0.733rem] text-muted-foreground xl:inline">Model</span>
          <InlineSelect
            value={selectedModel}
            onChange={handleModelChange}
            ariaLabel="Model"
            disabled={controlsDisabled}
            title={controlsDisabled ? 'Connect to gateway to change model' : undefined}
            triggerClassName="max-w-[110px] rounded-xl border-border/75 bg-background/65 px-2.5 py-1.5 text-[0.733rem] font-sans text-foreground sm:max-w-[180px] sm:min-h-8 sm:px-2.5 sm:py-1"
            menuClassName="min-w-[180px] rounded-2xl border-border/80 bg-card/98 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.28)] sm:min-w-[220px]"
            options={modelOptions}
          />
        </div>
        <div className="hidden min-w-0 shrink-0 items-center gap-0.5 xl:flex sm:gap-1">
          <Gauge size={12} className="hidden shrink-0 text-foreground/70 sm:block" aria-hidden="true" />
          <span className="hidden text-[0.733rem] text-muted-foreground xl:inline">Effort</span>
          <InlineSelect
            value={selectedEffort}
            onChange={handleEffortChange}
            ariaLabel="Effort"
            disabled={controlsDisabled}
            title={controlsDisabled ? 'Connect to gateway to change effort' : undefined}
            triggerClassName="max-w-[82px] rounded-xl border-border/75 bg-background/65 px-2.5 py-1.5 text-[0.733rem] font-sans text-foreground sm:max-w-none sm:min-h-8 sm:px-2.5 sm:py-1"
            menuClassName="rounded-2xl border-border/80 bg-card/98 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.28)]"
            options={effortOptions}
          />
        </div>
        {onSelectTool && (
          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
            <InlineSelect
              value={selectedToolId ?? '__none__'}
              onChange={(nextValue) => {
                const nextToolId = nextValue === '__none__' ? null : nextValue;
                onSelectTool(nextToolId);
              }}
              ariaLabel="Tool panel menu"
              triggerClassName="rounded-xl border-border/75 bg-background/65 px-2.5 py-1.5 text-[0.733rem] font-sans text-foreground min-h-11 sm:min-h-9"
              menuClassName="min-w-[220px] rounded-2xl border-border/80 bg-card/98 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.28)]"
              options={toolOptions}
            />
          </div>
        )}
        {isGenerating && (
          <button
            onClick={onAbort}
            aria-label="Stop generating"
            title="Stop generating"
            className="cockpit-toolbar-button min-h-11 px-3 sm:min-h-9 sm:px-3"
            data-tone="danger"
          >
            <span aria-hidden="true">⏹</span>
            <span className="hidden sm:inline">Stop</span>
          </button>
        )}
        {onReset && (
          <button
            onClick={() => onReset()}
            title="Reset session (start fresh)"
            aria-label="Reset session"
            className="cockpit-toolbar-button min-h-11 px-3 sm:min-h-9 sm:px-3"
            data-tone="danger"
          >
            <span aria-hidden="true">↺</span>
          </button>
        )}
      </div>
    </div>
  );
}
