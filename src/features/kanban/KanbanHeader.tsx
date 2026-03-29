import { memo, useState, useCallback, useRef, useEffect, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { Filter, GripVertical, Plus, X, Inbox } from 'lucide-react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import type { KanbanBoard, TaskStatus, TaskPriority } from './types';
import type { KanbanFilters } from './hooks/useKanban';
import { ProposalInbox } from './ProposalInbox';
import type { KanbanProposal } from './hooks/useProposals';
import { TASK_PRIORITY_TONE, TASK_STATUS_TONE } from './tone';

/* ── Stats chip ── */
function StatChip({ label, count, status }: { label: string; count: number; status: TaskStatus }) {
  const tone = TASK_STATUS_TONE[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.733rem] font-medium ${tone.statClass}`}>
      <span>{label}</span>
      <span className="rounded-full bg-background/55 px-1.5 py-0.5 font-mono text-[0.667rem] tabular-nums text-current">
        {count}
      </span>
    </span>
  );
}

/* ── Priority filter pill ── */
function FilterPill({
  priority,
  label,
  active,
  onClick,
}: {
  priority: TaskPriority;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const tone = TASK_PRIORITY_TONE[priority];
  return (
    <button
      onClick={onClick}
      className={`h-8 rounded-full border px-3 text-[0.733rem] font-medium transition-colors cursor-pointer ${
        active
          ? tone.badgeClass
          : 'border-border/70 bg-background/40 text-muted-foreground hover:border-primary/24 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

interface KanbanHeaderProps {
  boards: KanbanBoard[];
  activeBoardId: string;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: () => void;
  onRenameBoard: (boardId: string, name: string) => Promise<void> | void;
  onReorderBoards: (boardIds: string[]) => Promise<void> | void;
  onRequestDeleteBoard: (board: KanbanBoard) => void;
  filters: KanbanFilters;
  onFiltersChange: (filters: KanbanFilters) => void;
  statusCounts: Record<TaskStatus, number>;
  onCreateTask: () => void;
  proposals?: KanbanProposal[];
  pendingProposalCount?: number;
  onApproveProposal?: (id: string) => void;
  onRejectProposal?: (id: string) => void;
}

type BoardTabProps = {
  board: KanbanBoard;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  renameInputRef: RefObject<HTMLInputElement | null>;
  onSelectBoard: (boardId: string) => void;
  onStartRenamingBoard: (board: KanbanBoard) => void;
  onRenameValueChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onContextMenu: (event: ReactMouseEvent, board: KanbanBoard) => void;
};

function BoardTab({
  board,
  active,
  renaming,
  renameValue,
  renameInputRef,
  onSelectBoard,
  onStartRenamingBoard,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onContextMenu,
}: BoardTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (renaming) {
    return (
      <input
        ref={renameInputRef}
        value={renameValue}
        onChange={(e) => onRenameValueChange(e.target.value)}
        onBlur={() => { void onCommitRename(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void onCommitRename(); }
          if (e.key === 'Escape') { onCancelRename(); }
        }}
        className="h-9 min-w-[120px] rounded-full border border-primary/40 bg-primary/10 px-3 text-[0.733rem] font-semibold text-foreground outline-none"
      />
    );
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      onClick={() => onSelectBoard(board.id)}
      onDoubleClick={() => onStartRenamingBoard(board)}
      onContextMenu={(event) => onContextMenu(event, board)}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[0.733rem] font-semibold transition-colors ${active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground'} ${isDragging ? 'opacity-60' : ''}`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground/80 hover:text-foreground active:cursor-grabbing"
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical size={12} />
      </span>
      <span>{board.name}</span>
    </button>
  );
}

export const KanbanHeader = memo(function KanbanHeader({
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onReorderBoards,
  onRequestDeleteBoard,
  filters,
  onFiltersChange,
  statusCounts,
  onCreateTask,
  proposals = [],
  pendingProposalCount = 0,
  onApproveProposal,
  onRejectProposal,
}: KanbanHeaderProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.q);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; board: KanbanBoard } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const filtersRef = useRef(filters);
  const inboxRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /* Keep filtersRef in sync (avoids stale closures in debounced search) */
  useEffect(() => { filtersRef.current = filters; });

  /* Close inbox popover / board context menu when clicking outside */
  useEffect(() => {
    if (!showInbox && !contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (showInbox && inboxRef.current && !inboxRef.current.contains(e.target as Node)) {
        setShowInbox(false);
      }
      if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu, showInbox]);

  /* Debounced search — reads filtersRef to avoid overwriting concurrent filter changes */
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filtersRef.current, q: value });
    }, 300);
  }, [onFiltersChange]);

  /* Cleanup debounce on unmount */
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    if (!renamingBoardId) return;
    const timer = setTimeout(() => renameInputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [renamingBoardId]);

  const togglePriority = useCallback((p: TaskPriority) => {
    const current = filters.priority;
    const next = current.includes(p) ? current.filter(x => x !== p) : [...current, p];
    onFiltersChange({ ...filters, priority: next });
  }, [filters, onFiltersChange]);

  const clearFilters = useCallback(() => {
    clearTimeout(debounceRef.current);
    setSearchValue('');
    onFiltersChange({ q: '', priority: [], assignee: '', labels: [] });
  }, [onFiltersChange]);

  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? boards[0] ?? null;
  const draggingBoard = boards.find((board) => board.id === draggingBoardId) ?? null;

  const startRenamingBoard = useCallback((board: KanbanBoard | null) => {
    if (!board) return;
    setRenamingBoardId(board.id);
    setRenameValue(board.name);
  }, []);

  const commitBoardRename = useCallback(async () => {
    if (!renamingBoardId) return;
    const nextName = renameValue.trim();
    const board = boards.find((entry) => entry.id === renamingBoardId);
    if (board && nextName && nextName !== board.name) {
      await onRenameBoard(renamingBoardId, nextName);
    }
    setRenamingBoardId(null);
    setRenameValue('');
  }, [boards, onRenameBoard, renameValue, renamingBoardId]);

  const cancelBoardRename = useCallback(() => {
    setRenamingBoardId(null);
    setRenameValue('');
  }, []);

  const handleBoardContextMenu = useCallback((event: React.MouseEvent, board: KanbanBoard) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, board });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingBoardId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = boards.findIndex((board) => board.id === active.id);
    const newIndex = boards.findIndex((board) => board.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(boards, oldIndex, newIndex).map((board) => board.id);
    void onReorderBoards(reordered);
  }, [boards, onReorderBoards]);

  const hasActiveFilters = filters.q || filters.priority.length > 0 || filters.assignee || filters.labels.length > 0;

  return (
    <div className="shrink-0 space-y-3 border-b border-border/50 px-4 py-4">
      {/* Row 1: title + stats + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Left: title + stats */}
        <div className="min-w-0 space-y-2">
          <div className="cockpit-kicker">
            <span className="text-primary">◆</span>
            Task board
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renamingBoardId === activeBoard?.id ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => { void commitBoardRename(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void commitBoardRename(); }
                  if (e.key === 'Escape') { setRenamingBoardId(null); setRenameValue(''); }
                }}
                className="min-w-[180px] rounded-xl border border-border/70 bg-background/70 px-3 py-1.5 text-lg font-semibold tracking-[-0.03em] text-foreground outline-none"
              />
            ) : (
              <h1
                className="cursor-text text-lg font-semibold tracking-[-0.03em] text-foreground"
                onDoubleClick={() => startRenamingBoard(activeBoard)}
                title="Double-click to rename board"
              >
                {activeBoard?.name ?? 'General'}
              </h1>
            )}
            <div className="hidden sm:flex items-center gap-1.5">
              <StatChip label="To Do" count={statusCounts.todo} status="todo" />
              <StatChip label="In Progress" count={statusCounts['in-progress']} status="in-progress" />
              <StatChip label="Review" count={statusCounts.review} status="review" />
              <StatChip label="Done" count={statusCounts.done} status="done" />
            </div>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(event) => setDraggingBoardId(String(event.active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDraggingBoardId(null)}
          >
            <SortableContext items={boards.map((board) => board.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
                {boards.map((board) => (
                  <BoardTab
                    key={board.id}
                    board={board}
                    active={board.id === activeBoardId}
                    renaming={renamingBoardId === board.id}
                    renameValue={renameValue}
                    renameInputRef={renameInputRef}
                    onSelectBoard={onSelectBoard}
                    onStartRenamingBoard={startRenamingBoard}
                    onRenameValueChange={setRenameValue}
                    onCommitRename={commitBoardRename}
                    onCancelRename={cancelBoardRename}
                    onContextMenu={handleBoardContextMenu}
                  />
                ))}
                <Button variant="outline" size="sm" onClick={onCreateBoard} className="h-9 rounded-full px-3 text-[0.733rem]">
                  <Plus size={14} />
                  Board
                </Button>
              </div>
            </SortableContext>
            <DragOverlay>
              {draggingBoard ? (
                <div className="inline-flex h-9 items-center gap-2 rounded-full border border-primary/40 bg-card/95 px-3 text-[0.733rem] font-semibold text-foreground shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
                  <GripVertical size={12} className="text-muted-foreground" />
                  {draggingBoard.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        <div className="flex-1" />

        {/* Right: search + filter toggle + create */}
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
          {/* Search */}
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <input
              type="text"
              value={searchValue}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search tasks…"
              className="cockpit-input h-10 w-full min-w-0 px-4 pr-12 text-sm sm:w-[280px]"
            />
            {searchValue && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="icon-sm"
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle filters"
            className={showFilters ? 'border-primary/30 bg-primary/12 text-primary' : ''}
          >
            <Filter size={14} />
          </Button>

          {/* Proposal inbox */}
          <div className="relative" ref={inboxRef}>
            <Button
              variant={showInbox ? 'secondary' : 'outline'}
              size="icon-sm"
              onClick={() => setShowInbox(!showInbox)}
              title="Agent proposals"
              className={showInbox ? 'border-primary/30 bg-primary/12 text-primary' : ''}
            >
              <Inbox size={14} />
              {pendingProposalCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[0.667rem] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                  {pendingProposalCount}
                </span>
              )}
            </Button>

            {/* Inbox popover */}
            {showInbox && (
              <div className="shell-panel absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-1.067rem))] max-w-[calc(100vw-1.067rem)] overflow-hidden rounded-3xl">
                <div className="border-b border-border/50 bg-secondary/38 px-4 py-3">
                  <span className="cockpit-kicker text-[0.6rem]">
                    <span className="text-primary">◆</span>
                    Agent proposals
                  </span>
                  {pendingProposalCount > 0 && (
                    <span className="ml-2 text-[0.733rem] text-muted-foreground">{pendingProposalCount} pending</span>
                  )}
                </div>
                <ProposalInbox
                  proposals={proposals}
                  onApprove={(id) => onApproveProposal?.(id)}
                  onReject={(id) => onRejectProposal?.(id)}
                />
              </div>
            )}
          </div>

          {/* Create */}
          <Button size="sm" onClick={onCreateTask}>
            <Plus size={14} />
            <span className="hidden sm:inline">New Task</span>
          </Button>
        </div>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[180px] rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-[0_22px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              onRequestDeleteBoard(contextMenu.board);
            }}
            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            Delete board
          </button>
        </div>
      )}

      {/* Row 2: Filter controls (collapsible) */}
      {showFilters && (
        <div className="cockpit-note flex flex-wrap items-center gap-2" data-tone="primary">
          <span className="text-[0.733rem] font-medium text-foreground">Priority</span>
          {(['critical', 'high', 'normal', 'low'] as TaskPriority[]).map(p => (
            <FilterPill
              key={p}
              priority={p}
              label={p.charAt(0).toUpperCase() + p.slice(1)}
              active={filters.priority.includes(p)}
              onClick={() => togglePriority(p)}
            />
          ))}

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-2 text-[0.733rem] text-muted-foreground underline hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
});
