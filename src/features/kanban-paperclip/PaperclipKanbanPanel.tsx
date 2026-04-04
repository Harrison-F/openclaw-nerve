import { useState, useEffect, useCallback } from 'react';
import { PaperclipKanbanBoard } from './PaperclipKanbanBoard';
import type { KanbanTask } from '@/features/kanban/types';

const BOARD_ID = 'paperclip';

export function PaperclipKanbanPanel() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/kanban/tasks?boardId=${BOARD_ID}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : data.items ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const handleCreateTask = useCallback(async () => {
    const title = newTaskTitle.trim();
    if (!title) return;

    try {
      const res = await fetch('/api/kanban/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId: BOARD_ID,
          title,
          status: 'backlog',
          priority: 'normal',
        }),
      });
      if (res.ok) {
        setNewTaskTitle('');
        setShowCreate(false);
        void fetchTasks();
      }
    } catch {
      // silent
    }
  }, [newTaskTitle, fetchTasks]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-lg font-semibold">Paperclip Board</h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + New Task
        </button>
      </div>

      {/* Create task inline form */}
      {showCreate && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateTask();
              if (e.key === 'Escape') setShowCreate(false);
            }}
            placeholder="Task title..."
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <button
            type="button"
            onClick={() => void handleCreateTask()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading…
          </div>
        ) : (
          <PaperclipKanbanBoard tasks={tasks} onTaskUpdated={fetchTasks} />
        )}
      </div>
    </div>
  );
}
