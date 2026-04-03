import { ConnectDialog } from '@/features/connect/ConnectDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { WorkspaceSwitchDialog } from '@/components/WorkspaceSwitchDialog';
import { SpawnAgentDialog } from '@/features/sessions/SpawnAgentDialog';
import type { SpawnSessionOpts } from '@/contexts/SessionContext';

interface AppDialogsProps {
  // ConnectDialog
  dialogOpen: boolean;
  connectionState: string;
  handleConnect: (url: string, token: string) => Promise<void>;
  connectError: string | null;
  editableUrl: string;
  editableToken: string;
  officialUrl: string | null;
  serverSideAuth: boolean;

  // Reset session
  showResetConfirm: boolean;
  confirmReset: () => void;
  cancelReset: () => void;

  // Gateway restart
  showGatewayRestartConfirm: boolean;
  confirmGatewayRestart: () => void;
  cancelGatewayRestart: () => void;

  // Workspace switch
  pendingWorkspaceSwitch: { targetLabel: string } | null;
  workspaceSwitchAction: 'save' | 'discard' | null;
  workspaceSwitchError: string | null;
  handleSaveAndSwitch: () => void;
  handleDiscardAndSwitch: () => void;
  handleCancelWorkspaceSwitch: () => void;

  // Spawn agent
  spawnDialogOpen: boolean;
  setSpawnDialogOpen: (open: boolean) => void;
  handleSpawnSession: (opts: SpawnSessionOpts) => Promise<boolean>;
}

export function AppDialogs({
  dialogOpen,
  connectionState,
  handleConnect,
  connectError,
  editableUrl,
  editableToken,
  officialUrl,
  serverSideAuth,
  showResetConfirm,
  confirmReset,
  cancelReset,
  showGatewayRestartConfirm,
  confirmGatewayRestart,
  cancelGatewayRestart,
  pendingWorkspaceSwitch,
  workspaceSwitchAction,
  workspaceSwitchError,
  handleSaveAndSwitch,
  handleDiscardAndSwitch,
  handleCancelWorkspaceSwitch,
  spawnDialogOpen,
  setSpawnDialogOpen,
  handleSpawnSession,
}: AppDialogsProps) {
  return (
    <>
      <ConnectDialog
        open={dialogOpen && connectionState !== 'connected' && connectionState !== 'reconnecting'}
        onConnect={handleConnect}
        error={connectError ?? ''}
        defaultUrl={editableUrl}
        defaultToken={editableToken}
        officialUrl={officialUrl}
        serverSideAuth={serverSideAuth}
      />

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
    </>
  );
}
