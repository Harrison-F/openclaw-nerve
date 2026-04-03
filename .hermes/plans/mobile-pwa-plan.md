# Mobile PWA Plan — Nerve on Pixel 7 (GrapheneOS/Vanadium)

## Goal
Make Nerve a full Telegram replacement on mobile. Chat with Wren, manage kanban, voice input — all from a PWA on Harrison's Pixel 7.

## Target Device
- Pixel 7, GrapheneOS (Android 16), Vanadium browser (hardened Chromium)
- Full PWA support, Web Speech API, MediaRecorder API all available

## What Exists
- MobileShell.tsx (218 lines) — chat history list + chat panel with voice
- /m route already renders MobileShell
- ChatPanel has voice input (push-to-talk, transcription)
- Session management (create, rename, delete, switch)
- No PWA manifest, no service worker, no install prompt

## Phase 1: PWA Foundation
1. Create web app manifest (manifest.webmanifest)
2. Generate PWA icons (192x192, 512x512) from existing favicon
3. Add manifest link + theme-color meta to index.html
4. Create basic service worker for offline shell caching
5. Add "standalone" display mode so it feels native when installed

## Phase 2: Mobile UX Polish
1. Bottom navigation bar: Chat, Kanban, Settings (like Paperclip's MobileBottomNav)
2. Swipe gestures: swipe right from chat to go back to history
3. Pull-to-refresh on chat history
4. Safe area insets (notch/status bar padding)
5. Viewport height fix (100dvh instead of 100vh for mobile browsers)
6. Input bar: auto-grow, keyboard-aware positioning
7. Haptic feedback on interactions (navigator.vibrate)

## Phase 3: Kanban on Mobile
1. Add kanban view accessible from bottom nav
2. Simplified mobile kanban: vertical scrolling columns, tap to move between statuses
3. Quick-add task from mobile
4. Swipe card to change status

## Phase 4: Voice Input Optimization
1. Large mic button in input bar (thumb-friendly)
2. Voice recording indicator that doesn't obstruct chat
3. One-tap record, release to send (Telegram-style)
4. Verify Vanadium MediaRecorder codec support

## Phase 5: Notifications (Future)
1. Service worker push notifications
2. Notify when agent responds
3. Background sync for queued messages
