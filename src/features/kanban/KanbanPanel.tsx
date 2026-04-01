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
  const [taskContextMenu, setTaskContextMenu] = useState<{ x: number; y: number; task: KanbanTask } | null>(null);
  const [moveTargetBoardId, setMoveTargetBoardId] = useState<string>('');
  const [moveTargetStatus, setMoveTargetStatus] = useState<TaskStatus>('todo');
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

  const handleTaskContextMenu = useCallback((event: React.MouseEvent, task: KanbanTask) => {
    event.preventDefault();
    setTaskContextMenu({ x: event.clientX, y: event.clientY, task });
    setMoveTargetBoardId(task.boardId);
    setMoveTargetStatus(task.status);
  }, []);

  const handleMoveTask = useCallback(async () => {
    if (!taskContextMenu) return;
    await updateTask(taskContextMenu.task.id, {
      version: taskContextMenu.task.version,
      boardId: moveTargetBoardId,
      status: moveTargetStatus,
    });
    setTaskContextMenu(null);
  }, [moveTargetBoardId, moveTargetStatus, taskContextMenu, updateTask]);

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
          onCardContextMenu={handleTaskContextMenu}
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

      {taskContextMenu && (
        <div
          className="fixed inset-0 z-50"
          onMouseDown={() => setTaskContextMenu(null)}
        >
          <div
            className="shell-panel absolute w-72 rounded-2xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.28)]"
            style={{ left: taskContextMenu.x, top: taskContextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Move task</div>
            <div className="mb-2 text-sm font-medium text-foreground line-clamp-2">{taskContextMenu.task.title}</div>
            <div className="space-y-3">
              <label className="block text-xs text-muted-foreground">
                Board
                <select
                  value={moveTargetBoardId}
                  onChange={(e) => setMoveTargetBoardId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-sm text-foreground outline-none"
                >
                  {boards.map((board) => (
                    <option key={board.id} value={board.id}>{board.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Category
                <select
                  value={moveTargetStatus}
                  onChange={(e) => setMoveTargetStatus(e.target.value as TaskStatus)}
                  className="mt-1 h-10 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-sm text-foreground outline-none"
                >
                  <option value="backlog">Backlog</option>
                  <option value="todo">To Do</option>
                  <option value="in-progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => { void handleMoveTask(); }}
                className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Move task
              </button>
            </div>
          </div>
        </div>
      )}

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
