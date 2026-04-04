import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { KanbanTask, TaskStatus } from '@/features/kanban/types';

// Paperclip-style statuses (underscore) mapped to Nerve statuses (hyphenated)
const boardStatuses = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
] as const;

type PaperclipStatus = (typeof boardStatuses)[number];

/** Nerve status → Paperclip display status */
function toDisplayStatus(nerveStatus: TaskStatus): PaperclipStatus {
  const map: Record<string, PaperclipStatus> = {
    'in-progress': 'in_progress',
    review: 'in_review',
  };
  return (map[nerveStatus] ?? nerveStatus) as PaperclipStatus;
}

/** Paperclip display status → Nerve status */
function toNerveStatus(displayStatus: string): TaskStatus {
  const map: Record<string, TaskStatus> = {
    in_progress: 'in-progress',
    in_review: 'review',
    blocked: 'backlog', // Nerve has no 'blocked', map to backlog
  };
  return (map[displayStatus] ?? displayStatus) as TaskStatus;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface PaperclipKanbanBoardProps {
  tasks: KanbanTask[];
  onTaskUpdated?: () => void;
}

/* ── Priority Icon (inline, simplified from Paperclip) ── */

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-400',
    normal: 'bg-blue-400',
    low: 'bg-gray-400',
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${colors[priority] ?? 'bg-gray-400'}`}
      title={priority}
    />
  );
}

/* ── Droppable Column ── */

function KanbanColumn({
  status,
  tasks,
}: {
  status: PaperclipStatus;
  tasks: KanbanTask[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      <div className="flex items-center gap-2 px-2 py-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {statusLabel(status)}
        </span>
        <span className="text-xs text-muted-foreground/60 ml-auto tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-md p-1 space-y-1 transition-colors ${
          isOver ? 'bg-accent/40' : 'bg-muted/20'
        }`}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

/* ── Draggable Card ── */

function KanbanCard({
  task,
  isOverlay,
}: {
  task: KanbanTask;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border bg-card p-2.5 cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging && !isOverlay ? 'opacity-30' : ''
      } ${isOverlay ? 'shadow-lg ring-1 ring-primary/20' : 'hover:shadow-sm'}`}
    >
      <div className="flex items-start gap-1.5 mb-1.5">
        <span className="text-xs text-muted-foreground font-mono shrink-0">
          {task.id.slice(0, 8)}
        </span>
      </div>
      <p className="text-sm leading-snug line-clamp-2 mb-2">{task.title}</p>
      <div className="flex items-center gap-2">
        <PriorityDot priority={task.priority} />
        {task.assignee && (
          <span className="text-xs text-muted-foreground font-mono">
            {task.assignee}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Main Board ── */

export function PaperclipKanbanBoard({
  tasks,
  onTaskUpdated,
}: PaperclipKanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Group tasks into Paperclip-style columns
  const columnTasks = useMemo(() => {
    const grouped: Record<PaperclipStatus, KanbanTask[]> = {} as Record<PaperclipStatus, KanbanTask[]>;
    for (const status of boardStatuses) {
      grouped[status] = [];
    }
    for (const task of tasks) {
      const displayStatus = toDisplayStatus(task.status);
      if (grouped[displayStatus]) {
        grouped[displayStatus].push(task);
      }
    }
    return grouped;
  }, [tasks]);

  const activeTask = useMemo(
    () => (activeId ? tasks.find((t) => t.id === activeId) : null),
    [activeId, tasks],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Determine target display status
    let targetDisplayStatus: string | null = null;

    if ((boardStatuses as readonly string[]).includes(over.id as string)) {
      targetDisplayStatus = over.id as string;
    } else {
      const targetTask = tasks.find((t) => t.id === over.id);
      if (targetTask) {
        targetDisplayStatus = toDisplayStatus(targetTask.status);
      }
    }

    if (!targetDisplayStatus) return;

    const currentDisplayStatus = toDisplayStatus(task.status);
    if (targetDisplayStatus === currentDisplayStatus) return;

    const nerveStatus = toNerveStatus(targetDisplayStatus);

    try {
      const res = await fetch(`/api/kanban/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nerveStatus }),
      });
      if (res.ok) {
        onTaskUpdated?.();
      }
    } catch {
      // silent
    }
  }

  function handleDragOver(_event: DragOverEvent) {
    // Visual feedback placeholder
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {boardStatuses.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={columnTasks[status] ?? []}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <KanbanCard task={activeTask} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
