import { useState, useCallback, useEffect, useRef } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { KanbanBoard as KanbanBoardType, KanbanTask, TaskStatus } from './types';
import { useKanban } from './hooks/useKanban';
import { useProposals } from './hooks/useProposals';
import { KanbanHeader } from './KanbanHeader';
import { KanbanBoard } from './KanbanBoard';
import { CreateTaskDialog } from './CreateTaskDialog';
import { TaskDetailDrawer } from './TaskDetailDrawer';

interface KanbanPanelProps {
  /** If set, auto-open the drawer for this task ID on mount. */
  initialTaskId?: string | null;
  /** Called after the initial task drawer has been opened (to clear the ID). */
  onInitialTaskConsumed?: () => void;
}

/**
 * Main Kanban panel — replaces the placeholder from Wave 1.
 * Full board with header, columns, create dialog, and detail drawer.
 */
export function KanbanPanel({ initialTaskId, onInitialTaskConsumed }: KanbanPanelProps = {}) {
  const {
    tasks,
    boards,
    activeBoard,
    activeBoardId,
    setActiveBoardId,
    createBoard,
    renameBoard,
    reorderBoards,
    deleteBoard,
    loading,
    error,
    filters,
    setFilters,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    reorderTask,
    tasksByStatus,
    statusCounts,
    executeTask,
    approveTask,
    rejectTask,
    abortTask,
  } = useKanban();

  const {
    proposals,
    pendingCount: pendingProposalCount,
    approveProposal,
    rejectProposal,
  } = useProposals();

  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const [pendingBoardDelete, setPendingBoardDelete] = useState<KanbanBoardType | null>(null);
  const consumedRef = useRef<string | null>(null);

  // Auto-open drawer for initialTaskId
  useEffect(() => {
    if (!initialTaskId || initialTaskId === consumedRef.current) return;
    const match = tasks.find((t) => t.id === initialTaskId);
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync from prop
      setSelectedTask(match);
      consumedRef.current = initialTaskId;
      onInitialTaskConsumed?.();
    }
  }, [initialTaskId, tasks, onInitialTaskConsumed]);

  /* ── Card click → open drawer ── */
  const handleCardClick = useCallback((task: KanbanTask) => {
    setSelectedTask(task);
  }, []);

  /* ── Close drawer ── */
  const handleCloseDrawer = useCallback(() => {
    setSelectedTask(null);
  }, []);

  /* ── Create handler ── */
  const handleCreate = useCallback(async (payload: Parameters<typeof createTask>[0]) => {
    await createTask(payload);
  }, [createTask]);

  /* ── Update handler (refreshes selected task) ── */
  const handleUpdate = useCallback(async (...args: Parameters<typeof updateTask>) => {
    const updated = await updateTask(...args);
    setSelectedTask(updated);
    return updated;
  }, [updateTask]);

  /* ── Delete handler ── */
  const handleDelete = useCallback(async (id: string) => {
    await deleteTask(id);
  }, [deleteTask]);

  /* ── Open create dialog ── */
  const openCreateDialog = useCallback((status?: TaskStatus) => {
    setCreateStatus(status ?? null);
    setCreateOpen(true);
  }, []);

  const handleReorderBoards = useCallback(async (boardIds: string[]) => {
    await reorderBoards(boardIds);
  }, [reorderBoards]);

  const handleRequestDeleteBoard = useCallback((board: KanbanBoardType) => {
    setPendingBoardDelete(board);
  }, []);

  const handleConfirmDeleteBoard = useCallback(async () => {
    if (!pendingBoardDelete) return;
    await deleteBoard(pendingBoardDelete.id);
    setPendingBoardDelete(null);
  }, [deleteBoard, pendingBoardDelete]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Header with search, filters, stats, + New Task */}
      <KanbanHeader
        boards={boards}
        activeBoardId={activeBoardId}
        onSelectBoard={setActiveBoardId}
        onCreateBoard={async () => { await createBoard(); }}
        onRenameBoard={async (boardId, name) => { await renameBoard(boardId, name); }}
        onReorderBoards={handleReorderBoards}
        onRequestDeleteBoard={handleRequestDeleteBoard}
        filters={filters}
        onFiltersChange={setFilters}
        statusCounts={statusCounts}
        onCreateTask={openCreateDialog}
        proposals={proposals}
        pendingProposalCount={pendingProposalCount}
        onApproveProposal={async (id) => { await approveProposal(id); await fetchTasks(); }}
        onRejectProposal={async (id) => { await rejectProposal(id); }}
      />

      {/* Board body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 pb-4">
        <KanbanBoard
          tasksByStatus={tasksByStatus}
          onCardClick={handleCardClick}
          loading={loading}
          error={error}
          onRetry={() => fetchTasks()}
          hasAnyTasks={tasks.length > 0}
          onCreateTask={openCreateDialog}
          reorderTask={reorderTask}
        />
      </div>

      {/* Create Task Modal */}
      <CreateTaskDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateStatus(null);
        }}
        onCreate={handleCreate}
        boardName={activeBoard?.name ?? 'General'}
        boardConfig={activeBoard?.config ?? null}
        initialStatus={createStatus}
      />

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={handleCloseDrawer}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onExecute={executeTask}
        onApprove={approveTask}
        onReject={rejectTask}
        onAbort={abortTask}
      />

      <ConfirmDialog
        open={Boolean(pendingBoardDelete)}
        title="Delete board"
        message={pendingBoardDelete
          ? `Delete the board “${pendingBoardDelete.name}”? Its tasks will also be deleted. This can’t be undone.`
          : ''}
        confirmLabel="Delete board"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { void handleConfirmDeleteBoard(); }}
        onCancel={() => setPendingBoardDelete(null)}
      />
    </div>
  );
}
