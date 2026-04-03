# Nerve Handover — 2026-03-29

## What changed tonight
- Fixed Nerve workspace root/file-browser issue by pointing Nerve at the real OpenClaw workspace.
- Replaced hardcoded `Comms` header with inline chat-title rename.
- Added visible mic button between attachment and send.
- Made Enter/Send stop + transcribe during voice recording.
- Set up secure HTTPS Tailscale URL for Nerve.
- Fixed Nerve/OpenClaw origin allowlists.
- Enabled `NERVE_AUTH=true` so remote Nerve sessions can use managed server-side gateway auth.
- Changed startup flow so the gateway handshake screen is fallback/recovery instead of the default front door.
- Reframed manual connect UI as advanced/recovery.
- Created git checkpoint + backup workflow to Harrison fork remote.
- Reworked AGENTS into a chat-oriented model.
- Chat History now shows top-level chats, single-click open, double-click rename.
- Left layout keeps workspace tree on the far left and Chat History next to it.
- Chat History width aligned to workspace tree width target.
- Removed progress/context bar and token count from Chat History rows so names fit better.
- New Chat now skips the root/subagent choice in the normal Chat History flow.
- Set up overnight Nerve bug-fix cron + morning summary cron.
- Fixed noisy Composio warning spam by removing stale installed-plugin metadata from OpenClaw config.

## Important files
- `src/App.tsx`
- `src/components/ResizablePanels.tsx`
- `src/components/StatusBar.tsx`
- `src/components/TopBar.tsx`
- `src/features/sessions/SessionList.tsx`
- `src/features/sessions/SessionNode.tsx`
- `src/features/sessions/SpawnAgentDialog.tsx`
- `src/features/sessions/sessionKeys.ts`
- `server/routes/gateway.ts`
- `server/routes/gateway.test.ts`

## Git / backup workflow
- Repo: `/Users/harrison/nerve`
- Branch: `harrison/nerve-ui-checkpoints`
- Backup remote: `backup` → `Harrison-F/openclaw-nerve`
- Commit frequently after stable fixes, then push to `backup`

## Relevant commits
- `d23a52d` — `feat: improve startup connection flow and core Nerve UX`
- `13832c5` — `feat: reshape Nerve chat history workflow`
- `257078b` — `fix: harden Nerve layout and gateway model loading`

## Cron/debugging workflow
### Bug-fix cron
- Name: `nerve-overnight-bugfix`
- Schedule: 5:00, 6:00, 7:00 AM ET
- Behavior per run:
  1. focused smoke pass
  2. find one high-confidence bug
  3. fix only if low-risk + testable
  4. validate
  5. commit
  6. push to backup
  7. stop

### Summary cron
- Name: `nerve-overnight-summary`
- Schedule: 8:05 AM ET
- Purpose: summarize whether each overnight run executed, fixed anything, committed, and pushed

## Current state
- Harrison is switching entirely to Nerve for this work.
- Continue productizing Nerve as an intentional chat/workspace UI.
- Likely next major area after current UI polish: search in Chat History.

## Notes on session model
- Nerve top-level chats are best thought of as explicit project lanes.
- Telegram topic sessions and Nerve top-level chats are different session origins/surfaces, even if both live inside OpenClaw.
- This Telegram thread was not directly injected into Nerve Chat History; this handoff file is the bridge.

## Recommended next prompt inside Nerve
"Read `NERVE-HANDOVER-2026-03-29.md` and continue the Nerve UI work from there. Start by confirming the current UI state and propose the next highest-value improvement."
