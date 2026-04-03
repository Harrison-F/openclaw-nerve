import { AlertTriangle, CheckCircle2, RotateCw, PlugZap, Mic, Loader2, Square } from 'lucide-react';

interface NotificationBannersProps {
  voiceState: string;
  voiceOriginSessionKey: string | null;
  voiceOriginSessionLabel: string | null;
  voiceElapsedMs: number;
  discardRecording: () => void;
  stopAndTranscribe: () => void;
  startupPending: boolean;
  connectionState: string;
  showManagedFallback: boolean;
  dialogOpen: boolean;
  connectError: string | null;
  handleReconnect: () => Promise<void> | void;
  openManualConnect: () => void;
  reconnectAttempt: number;
  gatewayRestarting: boolean;
  gatewayRestartNotice: { ok: boolean; message: string } | null;
  dismissNotice: () => void;
}

export function NotificationBanners({
  voiceState,
  voiceOriginSessionKey,
  voiceOriginSessionLabel,
  voiceElapsedMs,
  discardRecording,
  stopAndTranscribe,
  startupPending,
  connectionState,
  showManagedFallback,
  dialogOpen,
  connectError,
  handleReconnect,
  openManualConnect,
  reconnectAttempt,
  gatewayRestarting,
  gatewayRestartNotice,
  dismissNotice,
}: NotificationBannersProps) {
  return (
    <>
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
            <p className="font-semibold tracking-[-0.02em]">Couldn't connect automatically.</p>
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
    </>
  );
}
