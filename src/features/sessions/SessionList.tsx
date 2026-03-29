import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import type { Session, ChatHistoryResponse, ChatMessage } from '@/types';
import { getSessionKey } from '@/types';
import type { SpawnSessionOpts } from '@/contexts/SessionContext';
import { SessionSkeletonGroup } from '@/components/skeletons';
import { useGateway } from '@/contexts/GatewayContext';
import { processChatMessages } from '@/features/chat/operations';
import { buildSessionTree, flattenTree, getSessionType } from './sessionTree';
import { getSessionDisplayLabel, isTopLevelAgentSessionKey } from './sessionKeys';
import { SessionNode } from './SessionNode';
import type { GranularAgentState } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, PanelLeftClose, Plus, Search, X } from 'lucide-react';
import { SpawnAgentDialog } from './SpawnAgentDialog';

interface SessionListProps {
  displayMode?: 'session' | 'chat';
  sessions: Session[];
  currentSession: string;
  busyState: Record<string, boolean>;
  agentStatus?: Record<string, GranularAgentState>;
  unreadSessions?: Record<string, boolean>;
  onSelect: (key: string) => void;
  onSelectSearchResult?: (sessionKey: string, result: SessionSearchResult, query: string) => void;
  onDelete?: (sessionKey: string) => Promise<void>;
  onSpawn?: (opts: SpawnSessionOpts) => Promise<void | boolean>;
  onRename?: (sessionKey: string, label: string) => Promise<void>;
  onAbort?: (sessionKey: string) => Promise<void>;
  onCollapse?: () => void;
  isLoading?: boolean;
  agentName?: string;
  /** Render in compact dropdown mode (chat-first topbar panel). */
  compact?: boolean;
}

type SearchMode = 'titles' | 'all';

type SessionSearchResult = {
  sessionKey: string;
  kind: 'title' | 'content';
  snippet?: string;
  targetMessageText?: string;
};

function countDescendants(node: ReturnType<typeof buildSessionTree>[number]): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

function findNodeByKey(nodes: ReturnType<typeof buildSessionTree>, key: string): ReturnType<typeof buildSessionTree>[number] | null {
  const queue = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.key === key) return node;
    queue.push(...node.children);
  }
  return null;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function renderHighlightedSnippet(snippet: string, query: string): Array<{ text: string; match: boolean }> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [{ text: snippet, match: false }];

  const sourceLower = snippet.toLocaleLowerCase();
  const queryLower = normalizedQuery.toLocaleLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;

  while (cursor < snippet.length) {
    const index = sourceLower.indexOf(queryLower, cursor);
    if (index === -1) {
      parts.push({ text: snippet.slice(cursor), match: false });
      break;
    }
    if (index > cursor) {
      parts.push({ text: snippet.slice(cursor, index), match: false });
    }
    parts.push({ text: snippet.slice(index, index + normalizedQuery.length), match: true });
    cursor = index + normalizedQuery.length;
  }

  return parts.filter((part) => part.text.length > 0);
}

function buildSearchSnippet(messages: ChatMessage[], query: string): { snippet: string; targetMessageText: string } | null {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return null;

  const searchableMessages = processChatMessages(messages)
    .filter((msg) => {
      if (msg.role === 'user') return true;
      if (msg.role !== 'assistant') return false;
      return !msg.intermediate && !msg.isThinking;
    });

  for (let index = searchableMessages.length - 1; index >= 0; index -= 1) {
    const rawText = searchableMessages[index].rawText.replace(/\s+/g, ' ').trim();
    if (!rawText) continue;
    const normalizedText = rawText.toLocaleLowerCase();
    const matchIndex = normalizedText.indexOf(normalizedQuery);
    if (matchIndex === -1) continue;

    const start = Math.max(0, matchIndex - 42);
    const end = Math.min(rawText.length, matchIndex + normalizedQuery.length + 78);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < rawText.length ? '…' : '';
    return {
      snippet: `${prefix}${rawText.slice(start, end).trim()}${suffix}`,
      targetMessageText: searchableMessages[index].rawText,
    };
  }

  return null;
}

/** Sidebar list of agent sessions with tree structure and context menus. */
export function SessionList({ displayMode = 'session', sessions, currentSession, busyState, agentStatus, unreadSessions, onSelect, onSelectSearchResult, onDelete, onSpawn, onRename, onAbort, onCollapse, isLoading, agentName = 'Agent', compact = false }: SessionListProps) {
  const { connectionState, rpc } = useGateway();
  const [deleteTarget, setDeleteTarget] = useState<{ key: string; label: string; descendantCount: number; isRootAgent: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Record<string, SessionSearchResult>>({});
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const historySearchCacheRef = useRef<Map<string, { updatedAt?: number; messages: ChatMessage[] }>>(new Map());
  const searchRunIdRef = useRef(0);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.key);
    } catch (err) {
      console.error('Failed to delete session:', err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDelete]);

  const startRename = useCallback((sessionKey: string, currentLabel: string) => {
    setRenamingKey(sessionKey);
    setRenameValue(currentLabel);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingKey || !onRename) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      try { await onRename(renamingKey, trimmed); } catch (err) { console.error('Failed to rename session:', err); }
    }
    setRenamingKey(null);
  }, [renamingKey, renameValue, onRename]);

  const cancelRename = useCallback(() => {
    setRenamingKey(null);
  }, []);

  const handleRenameChange = useCallback((value: string) => {
    setRenameValue(value);
  }, []);

  const handleToggleExpand = useCallback((key: string) => {
    setExpandedState((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [searchOpen]);

  const prevPercentsRef = useRef<Record<string, number>>({});
  const prevTokensRef = useRef<Record<string, number>>({});

  // Calculate which sessions are growing (compare to previous render via ref)
  const growingSessions = useMemo(() => {
    const result: Record<string, boolean> = {};
    sessions.forEach(s => {
      const sessionKey = getSessionKey(s);
      const used = s.totalTokens || 0;
      const max = s.contextTokens || 200000;
      const pct = Math.min(100, Math.round((used / max) * 100));
      const prevPct = prevPercentsRef.current[sessionKey];
      result[sessionKey] = prevPct !== undefined && pct > prevPct;
    });
    return result;
  }, [sessions]);

  // Update refs AFTER render
  useEffect(() => {
    sessions.forEach(s => {
      const sessionKey = getSessionKey(s);
      const used = s.totalTokens || 0;
      const max = s.contextTokens || 200000;
      const pct = Math.min(100, Math.round((used / max) * 100));
      prevPercentsRef.current[sessionKey] = pct;
      if (used > 0) {
        prevTokensRef.current[sessionKey] = used;
      }
    });
  }, [sessions]);

  // Build tree and flatten for rendering
  const tree = useMemo(() => buildSessionTree(sessions), [sessions]);
  const flatNodes = useMemo(() => flattenTree(tree, expandedState), [tree, expandedState]);

  const handleSetDeleteTarget = useCallback((key: string, label: string) => {
    const targetNode = findNodeByKey(tree, key);
    setDeleteTarget({
      key,
      label,
      descendantCount: targetNode ? countDescendants(targetNode) : 0,
      isRootAgent: isTopLevelAgentSessionKey(key),
    });
  }, [tree]);

  const normalizedSearchQuery = useMemo(() => normalizeSearchValue(searchQuery), [searchQuery]);

  useEffect(() => {
    if (!searchOpen || !normalizedSearchQuery) {
      setSearchResults({});
      setSearchLoading(false);
      return;
    }

    const titleMatches = new Map<string, SessionSearchResult>();
    const titleMisses: Session[] = [];

    sessions.forEach((session) => {
      const sessionKey = getSessionKey(session);
      const label = getSessionDisplayLabel(session, agentName);
      if (normalizeSearchValue(label).includes(normalizedSearchQuery)) {
        titleMatches.set(sessionKey, { sessionKey, kind: 'title' });
      } else {
        titleMisses.push(session);
      }
    });

    if (searchMode === 'titles') {
      setSearchResults(Object.fromEntries(Array.from(titleMatches.entries())));
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const runId = searchRunIdRef.current + 1;
    searchRunIdRef.current = runId;
    setSearchResults(Object.fromEntries(Array.from(titleMatches.entries())));
    setSearchLoading(true);

    const timer = window.setTimeout(() => {
      void (async () => {
        const contentMatches = new Map(titleMatches);

        for (const session of titleMisses) {
          const sessionKey = getSessionKey(session);
          if (!sessionKey) continue;

          const cached = historySearchCacheRef.current.get(sessionKey);
          const sessionUpdatedAt = typeof session.updatedAt === 'number' ? session.updatedAt : undefined;
          let messages = cached?.messages;

          if (!messages || (sessionUpdatedAt && cached?.updatedAt !== sessionUpdatedAt)) {
            try {
              const history = await rpc('chat.history', { sessionKey, limit: 250 }) as ChatHistoryResponse;
              messages = history.messages || [];
              historySearchCacheRef.current.set(sessionKey, { updatedAt: sessionUpdatedAt, messages });
            } catch {
              messages = [];
            }
          }

          const match = buildSearchSnippet(messages || [], normalizedSearchQuery);
          if (match) {
            contentMatches.set(sessionKey, {
              sessionKey,
              kind: 'content',
              snippet: match.snippet,
              targetMessageText: match.targetMessageText,
            });
          }
        }

        if (cancelled || searchRunIdRef.current !== runId) return;
        setSearchResults(Object.fromEntries(Array.from(contentMatches.entries())));
        setSearchLoading(false);
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [agentName, normalizedSearchQuery, rpc, searchMode, searchOpen, sessions]);

  const displayedNodes = useMemo(() => {
    if (!searchOpen || !normalizedSearchQuery) return flatNodes;

    const titleRank = (result?: SessionSearchResult) => (result?.kind === 'title' ? 0 : 1);
    return flatNodes
      .filter((node) => Boolean(searchResults[node.key]))
      .sort((a, b) => {
        const resultA = searchResults[a.key];
        const resultB = searchResults[b.key];
        const rankDiff = titleRank(resultA) - titleRank(resultB);
        if (rankDiff !== 0) return rankDiff;

        const sessionA = sessions.find((session) => getSessionKey(session) === a.key);
        const sessionB = sessions.find((session) => getSessionKey(session) === b.key);
        const updatedA = typeof sessionA?.updatedAt === 'number' ? sessionA.updatedAt : 0;
        const updatedB = typeof sessionB?.updatedAt === 'number' ? sessionB.updatedAt : 0;
        return updatedB - updatedA;
      });
  }, [flatNodes, normalizedSearchQuery, searchOpen, searchResults, sessions]);

  const searchHasNoResults = searchOpen && normalizedSearchQuery.length > 0 && !searchLoading && displayedNodes.length === 0;

  return (
    <div className={compact ? 'flex flex-col max-h-[65vh]' : 'h-full flex flex-col min-h-0'}>
      <div className="panel-header border-l-[3px] border-l-info">
        <span className="panel-label text-info">
          <span className="panel-diamond">◆</span>
          {displayMode === 'chat' ? 'CHAT HISTORY' : 'AGENTS'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {displayMode === 'chat' && (
            <button
              type="button"
              onClick={() => {
                setSearchOpen((prev) => {
                  const next = !prev;
                  if (!next) {
                    setSearchQuery('');
                    setSearchResults({});
                    setSearchLoading(false);
                  }
                  return next;
                });
              }}
              aria-label={searchOpen ? 'Close chat search' : 'Search chat history'}
              title={searchOpen ? 'Close chat search' : 'Search chat history'}
              className="shell-icon-button size-10 px-0"
            >
              {searchOpen ? <X size={16} /> : <Search size={16} />}
            </button>
          )}
          {onSpawn && displayMode !== 'chat' && (
            <button
              type="button"
              onClick={() => setSpawnOpen(true)}
              aria-label="Create session"
              title="Create session"
              className="shell-icon-button size-10 px-0"
            >
              <Plus size={16} />
            </button>
          )}
          {displayMode === 'chat' && onCollapse && !compact && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse chat history"
              title="Collapse chat history"
              className="shell-icon-button size-10 px-0"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>
      {displayMode === 'chat' && searchOpen && (
        <div className="border-b border-border/60 bg-card/70 px-3 py-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchMode === 'titles' ? 'Search chat titles…' : 'Search titles and chat…'}
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchMode('titles')}
              className={`rounded-full border px-2.5 py-1 text-[0.667rem] font-medium ${searchMode === 'titles' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground'}`}
            >
              Titles
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('all')}
              className={`rounded-full border px-2.5 py-1 text-[0.667rem] font-medium ${searchMode === 'all' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground'}`}
            >
              Titles + Chat
            </button>
            {searchLoading && connectionState === 'connected' && (
              <span className="text-[0.667rem] text-muted-foreground">Searching chats…</span>
            )}
          </div>
        </div>
      )}
      <div className={compact ? 'overflow-y-auto' : 'flex-1 overflow-y-auto'}>
        {isLoading && !sessions.length ? (
          <SessionSkeletonGroup count={4} />
        ) : !sessions.length ? (
          <div className="text-muted-foreground px-3 py-2 text-[0.733rem]">No active sessions</div>
        ) : searchHasNoResults ? (
          <div className="px-3 py-3 text-[0.733rem] text-muted-foreground">
            No chat history matches for <span className="font-medium text-foreground">{searchQuery}</span>.
          </div>
        ) : displayedNodes.map((node) => {
          const sessionKey = node.key;
          const sessionType = getSessionType(sessionKey);
          const isSubagent = sessionType === 'subagent';
          const isCron = sessionType === 'cron';
          const isCronRun = sessionType === 'cron-run';
          const isRootAgent = isTopLevelAgentSessionKey(sessionKey);
          const label = getSessionDisplayLabel(node.session, agentName);
          const isGrowing = growingSessions[sessionKey] ?? false;
          const running = busyState[sessionKey] || node.session.state === 'running' || node.session.agentState === 'running' || node.session.busy || node.session.processing || node.session.status === 'running' || node.session.status === 'busy' || (isGrowing && isSubagent);
          const isActive = sessionKey === currentSession;
          const currentTokens = node.session.totalTokens || 0;
          const prevTokens = prevTokensRef.current[sessionKey] || 0;
          const displayTokens = Math.max(currentTokens, prevTokens);
          const isExpanded = expandedState[sessionKey] ?? !isCron;
          const searchResult = searchResults[sessionKey];

          if (searchOpen && normalizedSearchQuery) {
            return (
              <button
                key={sessionKey}
                type="button"
                onClick={() => {
                  if (searchResult && onSelectSearchResult) {
                    onSelectSearchResult(sessionKey, searchResult, searchQuery);
                    return;
                  }
                  onSelect(sessionKey);
                }}
                className={`w-full border-b border-border/40 px-3 py-2 text-left transition-colors hover:bg-secondary ${isActive ? 'border-l-[3px] border-l-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold text-foreground">{label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.08em] ${searchResult?.kind === 'title' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                    {searchResult?.kind === 'title' ? 'Title' : 'Chat'}
                  </span>
                </div>
                {searchResult?.snippet && (
                  <p className="mt-1 line-clamp-2 text-[0.68rem] text-foreground/80">
                    {renderHighlightedSnippet(searchResult.snippet, searchQuery).map((part, index) => (
                      part.match ? (
                        <mark key={index} className="rounded-sm bg-primary/20 px-0.5 text-primary">
                          {part.text}
                        </mark>
                      ) : (
                        <span key={index} className="text-muted-foreground">
                          {part.text}
                        </span>
                      )
                    ))}
                  </p>
                )}
              </button>
            );
          }

          return (
            <SessionNode
              key={sessionKey}
              displayMode={displayMode}
              node={node}
              isActive={isActive}
              isGrowing={isGrowing}
              running={running}
              displayTokens={displayTokens}
              label={label}
              isExpanded={isExpanded}
              hasChildren={node.children.length > 0}
              isRootAgent={isRootAgent}
              isSubagent={isSubagent}
              isCron={isCron}
              isCronRun={isCronRun}
              isUnread={unreadSessions?.[sessionKey] ?? false}
              isRenaming={renamingKey === sessionKey}
              renameValue={renameValue}
              renameInputRef={renameInputRef}
              granularStatus={agentStatus?.[sessionKey]}
              onSelect={onSelect}
              onToggleExpand={handleToggleExpand}
              onDelete={onDelete ? handleSetDeleteTarget : undefined}
              onStartRename={onRename ? startRename : undefined}
              onAbort={onAbort}
              onRenameChange={handleRenameChange}
              onRenameCommit={commitRename}
              onRenameCancel={cancelRename}
              compact={compact}
            />
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red font-mono text-sm tracking-wider uppercase flex items-center gap-2">
              <AlertTriangle size={16} />
              {deleteTarget?.descendantCount ? 'Delete Session Tree' : 'Delete Session'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              {deleteTarget?.isRootAgent
                ? 'This will permanently delete this root session and any nested child sessions attached to it.'
                : deleteTarget?.descendantCount
                ? `This will permanently delete this session and ${deleteTarget.descendantCount} nested child session${deleteTarget.descendantCount === 1 ? '' : 's'}.`
                : 'This will permanently delete the session and archive its transcript.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-background border border-border/60 px-3 py-2">
              <p className="text-[0.733rem] text-muted-foreground uppercase tracking-wider mb-1">Session:</p>
              <p className="text-[0.8rem] text-foreground font-mono">{deleteTarget?.label}</p>
              <p className="text-[0.667rem] text-muted-foreground font-mono mt-1 break-all">{deleteTarget?.key}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="font-mono text-xs bg-red text-foreground hover:bg-red/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session creation dialog */}
      {onSpawn && displayMode !== 'chat' && (
        <SpawnAgentDialog
          open={spawnOpen}
          onOpenChange={setSpawnOpen}
          onSpawn={onSpawn}
          mode="all"
        />
      )}
    </div>
  );
}
