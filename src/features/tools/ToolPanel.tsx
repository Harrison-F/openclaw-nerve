import { useMemo, useState } from 'react';
import { ExternalLink, PanelRightClose, PanelRightOpen, RotateCcw, SquareDashedMousePointer } from 'lucide-react';
import { InlineSelect } from '@/components/ui/InlineSelect';
import { cn } from '@/lib/utils';
import { TOOL_DEFINITIONS, getToolDefinition } from './toolRegistry';

interface ToolPanelProps {
  collapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  selectedToolId: string | null;
  onSelectTool: (toolId: string | null) => void;
  debugMetrics?: {
    chatWidth: number | null;
    toolWidth: number | null;
    combinedWidth: number | null;
    baselineWidth: number | null;
  };
}

export function ToolPanel({ collapsed, onCollapseChange, selectedToolId, onSelectTool, debugMetrics }: ToolPanelProps) {
  const [frameKey, setFrameKey] = useState(0);
  const selectedTool = useMemo(() => getToolDefinition(selectedToolId), [selectedToolId]);

  const toolOptions = useMemo(() => [
    { value: '__none__', label: 'No tool selected' },
    ...TOOL_DEFINITIONS.map((tool) => ({ value: tool.id, label: tool.label })),
  ], []);

  const handleSelect = (value: string) => {
    const nextToolId = value === '__none__' ? null : value;
    onSelectTool(nextToolId);
    if (collapsed) onCollapseChange(false);
  };

  if (collapsed) {
    return (
      <div className="relative flex h-full min-h-0 shrink-0" style={{ width: 56 }}>
        <div className="shell-panel flex h-full w-full min-h-0 flex-col items-center justify-between overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-b from-secondary/88 to-card/82 px-2 py-3">
          <button
            type="button"
            onClick={() => onCollapseChange(false)}
            className="shell-icon-button size-10 shrink-0 px-0"
            title="Open tool panel"
            aria-label="Open tool panel"
          >
            <PanelRightOpen size={16} />
          </button>

          <button
            type="button"
            onClick={() => onCollapseChange(false)}
            className="group flex flex-1 min-h-0 items-center justify-center text-[0.58rem] font-mono font-semibold uppercase tracking-[0.28em] text-muted-foreground transition-colors hover:text-foreground"
            title="Open tool panel"
            aria-label="Open tool panel"
          >
            <span className="pointer-events-none whitespace-nowrap [writing-mode:vertical-rl]" aria-hidden="true">
              Tools
            </span>
          </button>

          <div className="h-10 w-10 shrink-0" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className="shell-panel boot-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card/88">
      <div className="panel-header flex items-center gap-2 border-r-0 border-l-[3px] border-l-orange/65 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[0.64rem] font-mono font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Tool Panel
          </div>
          <div className="truncate text-sm font-medium text-foreground">
            {selectedTool?.label || 'No tool selected'}
          </div>
        </div>

        <InlineSelect
          value={selectedToolId ?? '__none__'}
          onChange={handleSelect}
          ariaLabel="Tool selection"
          triggerClassName="max-w-[190px] rounded-xl border-border/75 bg-background/65 px-2.5 py-1.5 text-[0.72rem] font-sans text-foreground"
          menuClassName="min-w-[220px] rounded-2xl border-border/80 bg-card/98 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.28)]"
          options={toolOptions}
        />

        {selectedTool && (
          <>
            <button
              type="button"
              onClick={() => setFrameKey((current) => current + 1)}
              className="shell-icon-button size-10 px-0"
              title="Reload tool"
              aria-label="Reload tool"
            >
              <RotateCcw size={15} />
            </button>
            <a
              href={selectedTool.url}
              target="_blank"
              rel="noreferrer"
              className="shell-icon-button inline-flex size-10 items-center justify-center px-0"
              title={`Open ${selectedTool.label} in a new tab`}
              aria-label={`Open ${selectedTool.label} in a new tab`}
            >
              <ExternalLink size={15} />
            </a>
          </>
        )}

        <button
          type="button"
          onClick={() => onCollapseChange(true)}
          className="shell-icon-button size-10 px-0"
          title="Collapse tool panel"
          aria-label="Collapse tool panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <div className="border-b border-border/55 bg-background/45 px-3 py-2 text-[0.68rem] font-mono text-muted-foreground">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span>Chat: <span className="text-foreground">{debugMetrics?.chatWidth ?? '—'}px</span></span>
          <span>Tool: <span className="text-foreground">{debugMetrics?.toolWidth ?? '—'}px</span></span>
          <span>Total: <span className="text-foreground">{debugMetrics?.combinedWidth ?? '—'}px</span></span>
          <span>Baseline: <span className="text-foreground">{debugMetrics?.baselineWidth ?? '—'}px</span></span>
        </div>
      </div>

      {!selectedTool ? (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-[1.4rem] border border-border/80 bg-background/65 text-muted-foreground shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
            <SquareDashedMousePointer size={24} />
          </div>
          <div className="max-w-sm space-y-2">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">No tool selected</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Use the tool menu in the top-right corner to open a dashboard here. Nerve will remember your last tool across refreshes.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {TOOL_DEFINITIONS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => handleSelect(tool.id)}
                className="rounded-full border border-border/75 bg-background/70 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
              >
                {tool.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative flex flex-1 min-h-0 bg-background/60">
          <div className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-background/92 via-background/38 to-transparent transition-opacity',
            selectedTool ? 'opacity-100' : 'opacity-0'
          )} aria-hidden="true" />
          <iframe
            key={`${selectedTool.id}:${frameKey}`}
            src={selectedTool.url}
            title={selectedTool.label}
            className="h-full w-full border-0 bg-white"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
