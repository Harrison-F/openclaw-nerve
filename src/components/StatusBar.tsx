import { ContextMeter } from './ContextMeter';
import { UpdateBadge } from './UpdateBadge';
import { useGateway } from '@/contexts/GatewayContext';

/** Props for {@link StatusBar}. */
interface StatusBarProps {
  /** Current WebSocket connection state to the gateway. */
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  /** ASCII sparkline string rendered at the right edge of the bar. */
  sparkline: string;
  /** Context tokens consumed in the active session (omit to hide the meter). */
  contextTokens?: number;
  /** Context window limit in tokens (omit to hide the meter). */
  contextLimit?: number;
}

/**
 * Bottom status bar for the Nerve cockpit.
 *
 * Shows connection state, session count,
 * an optional context-window meter, a sparkline, and the app version.
 */
export function StatusBar({ connectionState, sparkline, contextTokens, contextLimit }: StatusBarProps) {
  useGateway(); // Keep gateway context connected

  // Use connectionState as key to trigger CSS animation on change
  const flashKey = connectionState;

  const statusColor = connectionState === 'connected'
    ? 'border-green/30 bg-green/10 text-green'
    : connectionState === 'connecting' || connectionState === 'reconnecting'
    ? 'border-orange/30 bg-orange/10 text-orange animate-pulse-dot'
    : 'border-red/30 bg-red/10 text-red';

  const statusLabel = connectionState === 'connected'
    ? 'CONNECTED'
    : connectionState === 'connecting'
    ? 'CONNECTING'
    : connectionState === 'reconnecting'
    ? 'RECONNECTING'
    : 'OFFLINE';

  return (
    <div className="shell-panel mx-2 mb-2 flex min-h-10 flex-wrap items-center gap-y-1 overflow-hidden rounded-2xl px-3 py-2 text-[0.667rem] text-muted-foreground shrink-0 select-none max-[378px]:min-h-9 max-[378px]:gap-y-0.5 max-[378px]:px-2.5 max-[378px]:py-1.5 max-[378px]:text-[0.6rem] sm:mx-4 sm:mb-3 sm:flex-nowrap sm:gap-y-0 sm:overflow-x-auto sm:px-4 sm:text-[0.733rem]">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 overflow-visible whitespace-normal max-[378px]:gap-x-2 max-[378px]:gap-y-0.5 sm:flex-nowrap sm:gap-x-3 sm:gap-y-0 sm:whitespace-nowrap">
        {/* Connection status */}
        <span
          key={flashKey}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.08em] max-[378px]:gap-0.5 max-[378px]:px-1.5 max-[378px]:py-0.5 max-[378px]:text-[0.533rem] max-[378px]:tracking-[0.06em] sm:gap-1.5 sm:px-2.5 sm:tracking-[0.12em] ${statusColor} animate-status-flash`}
        >
          <span className="text-[0.533rem] max-[378px]:text-[0.4375rem]" aria-hidden="true">●</span>
          <span>{statusLabel}</span>
        </span>

        {/* Context Meter (always visible when available) */}
        {contextTokens != null && contextLimit != null && contextLimit > 0 && (
          <>
            <span className="text-border max-[378px]:text-[0.533rem]">•</span>
            <span className="inline-flex shrink-0">
              <ContextMeter used={contextTokens} limit={contextLimit} />
            </span>
          </>
        )}
      </div>

      {/* Right side telemetry (hidden on smaller screens) */}
      <div className="ml-3 hidden shrink-0 items-center gap-2 lg:flex">
        <span className="rounded-full border border-border/70 bg-background/75 px-2.5 py-1 font-mono text-[0.667rem] tracking-[-0.08em] text-muted-foreground">
          {sparkline}<span className="ml-1 text-primary animate-alive">_</span>
        </span>
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted-foreground/55">v{__APP_VERSION__}</span>
        <UpdateBadge />
      </div>
    </div>
  );
}
