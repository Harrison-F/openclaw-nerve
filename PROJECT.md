# Nerve — Project Overview & Audit

## What Is Nerve
The cockpit for OpenClaw/Hermes. A React + Hono web app that provides chat, kanban, file browsing, voice, and dashboard functionality on top of the Hermes AI agent gateway.

- **Frontend:** React 19, Tailwind CSS 4, shadcn/ui, Vite 7 (port 3080)
- **Backend:** Hono 4 on Node.js (port 3081)
- **Gateway:** Hermes/OpenClaw on port 18789 (custom WebSocket JSON-RPC protocol)

## Who Uses It
Harrison + Wren (the AI agent). Shared workspace for task management, chat, file browsing, and project coordination.

## Codebase Audit (2026-04-02)

### Stats
- **~78,200 lines** of TypeScript/TSX
- **241 frontend files** (114 .tsx, 126 .ts) across 16 feature modules
- **118 server files**
- **100 test files** (strong coverage)
- **48 dependencies** (31 prod, 17 dev)
- **Build time:** 3.15 seconds
- **Bundle:** ~2.1MB / ~674KB gzipped

### Architecture — GOOD
```
src/
  features/     16 modules (chat, kanban, file-browser, voice, settings, workspace, auth, etc.)
  contexts/     4 React contexts (Session, Chat, Gateway, Settings) — 2,099 lines total
  hooks/        18 shared hooks
  components/   8 shadcn UI primitives + layout components
  lib/          utilities, themes
server/
  routes/       25+ route files
  lib/          ws-proxy, gateway-rpc, gateway-client, kanban-store, updater
  middleware/   auth, rate-limit, security-headers, error-handler, cache
  services/     TTS, whisper, claude-usage
```

Feature-based organization. Clean frontend/server separation. Well-layered middleware.

### Strengths
1. **Clean codebase** — zero console.logs, zero TODO/FIXME/HACK comments
2. **Strong test coverage** — 100 test files with Vitest + Testing Library
3. **Modern stack** — React 19, Vite 7, TS 5.9, Tailwind 4
4. **Good security** — auth middleware, rate limiting, security headers, zod validation, DOMPurify
5. **Mobile support** — responsive patterns in 20+ components, dedicated mobile directory
6. **Gateway integration** — complex but well-tested (4 files, all with test coverage)
7. **Fast builds** — 3.15s

### Pain Points to Address
1. **App.tsx is 1,671 lines** — biggest red flag. Needs decomposition into layout/routing modules
2. **Large context files** — ChatContext (731 lines) and SessionContext (830 lines) getting unwieldy
3. **No client-side router** — can't deep-link or bookmark views
4. **Heavy editor deps** — CodeMirror is 11 packages for file editing (336KB chunk)
5. **Duplicate charting** — both recharts AND lightweight-charts (could consolidate)
6. **Kanban module** — 2,520 lines across store + routes, may be over-engineered

### Gateway Integration Layer (1,403 lines)
The hardest and most valuable part of the codebase:
- `server/lib/ws-proxy.ts` (534 lines) — proxies browser WS to gateway, handles auth injection
- `server/routes/gateway.ts` (533 lines) — HTTP endpoints for models, sessions, restart
- `server/lib/gateway-rpc.ts` (284 lines) — privileged persistent WS connection for restricted ops
- `server/lib/gateway-client.ts` (52 lines) — HTTP client for tool invocations
- All four have dedicated test files

Protocol: Custom JSON-RPC over WebSocket with challenge-nonce auth, Ed25519 device identity, restricted method routing. No off-the-shelf UI speaks this — Nerve is the only frontend that does.

### Verdict: KEEP AND IMPROVE
The codebase is healthy. The issues are refactoring tasks, not architectural problems. A fresh start would mean rebuilding 78K lines of working, tested code — including the gateway integration layer that is genuinely hard to build. 

### Recommended Cleanup Plan
1. **Decompose App.tsx** — extract layout, routing, panel management into separate modules
2. **Add client-side router** (React Router or TanStack Router) — enable deep-linking
3. **Split large contexts** — break ChatContext and SessionContext into smaller, focused pieces
4. **Audit bundle weight** — evaluate if CodeMirror and dual charting libs are justified
5. **Simplify kanban** — assess if the 2,520-line implementation matches actual usage needs

## Key Files
- `src/App.tsx` — main app layout (needs refactoring)
- `src/features/sessions/SessionList.tsx` — chat history panel
- `src/features/chat/` — chat interface
- `src/features/kanban/` — kanban board
- `src/features/file-browser/` — workspace file browsing
- `server/lib/ws-proxy.ts` — gateway WebSocket proxy
- `server/routes/gateway.ts` — gateway HTTP routes

## Git Workflow
- Repo: `/Users/harrison/nerve`
- Branch: `harrison/nerve-ui-checkpoints`
- Backup remote: `backup` → `Harrison-F/openclaw-nerve`

## Related
- Handover doc: `NERVE-HANDOVER-2026-03-29.md`
- Kanban API skill: `skills/nerve-kanban/`
- Hermes config: `~/.hermes/config.yaml`
