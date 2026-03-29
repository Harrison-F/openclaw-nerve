/**
 * Security headers middleware.
 *
 * Adds essential security headers to all responses:
 * - Content-Security-Policy (CSP)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Strict-Transport-Security (HSTS)
 * - Referrer-Policy
 * - X-XSS-Protection
 */

import type { MiddlewareHandler } from 'hono';

/**
 * Content Security Policy
 * 
 * - default-src 'self': Only allow resources from same origin by default
 * - script-src 'self': Only allow scripts from same origin
 * - style-src: Allow self, inline styles (needed for some UI libraries), and Google Fonts
 * - font-src: Allow self and Google Fonts CDN
 * - connect-src: Allow self and WebSocket connections to localhost
 * - img-src: Allow self, data URIs, and blob URLs (for generated images)
 * - frame-ancestors 'none': Prevent framing (like X-Frame-Options: DENY)
 */
// Build connect-src dynamically: always include localhost, plus any extra CSP sources
const baseConnectSrc = "'self' ws://localhost:* wss://localhost:* http://localhost:* https://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://127.0.0.1:* https://127.0.0.1:* ws://*.ts.net:* wss://*.ts.net:* http://*.ts.net:* https://*.ts.net:* ws://100.102.143.17:* wss://100.102.143.17:* http://100.102.143.17:* https://100.102.143.17:*";

/**
 * Build CSP directives string lazily — env vars may not be loaded at import time
 * (dotenv/config runs in config.ts which may be imported after this module).
 */
let _cspDirectives: string | null = null;

function getCspDirectives(): string {
  if (_cspDirectives) return _cspDirectives;

  // CSP_CONNECT_EXTRA env var: space-separated additional connect-src entries
  // e.g. "wss://your-server.example.com:3443 https://your-server.example.com:3443"
  // Sanitize: strip semicolons and CR/LF to prevent directive injection
  const extraConnectSrc = process.env.CSP_CONNECT_EXTRA
    ?.replace(/[;\r\n]/g, '')
    .trim()
    .split(/\s+/)
    .filter(token => /^(https?|wss?):\/\//.test(token))
    .join(' ');
  const connectSrc = extraConnectSrc
    ? `${baseConnectSrc} ${extraConnectSrc}`
    : baseConnectSrc;

  _cspDirectives = [
    "default-src 'self'",
    "script-src 'self' https://s3.tradingview.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${connectSrc}`,
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",  // Allow blob: URLs for TTS audio playback
    "frame-src 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* http://*.ts.net:* https://*.ts.net:* http://100.102.143.17:* https://100.102.143.17:* https://s3.tradingview.com https://www.tradingview.com https://www.tradingview-widget.com https://s.tradingview.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return _cspDirectives;
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  const isEmbeddedToolRoute = c.req.path === '/tools/apartment'
    || c.req.path.startsWith('/tools/apartment/')
    || c.req.path === '/tools/lightning'
    || c.req.path.startsWith('/tools/lightning/');

  // Content Security Policy - defense in depth against XSS
  if (isEmbeddedToolRoute) {
    const toolCsp = [
      "default-src 'self' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:* https://*.ts.net:* https://100.102.143.17:*",
      "script-src 'self' 'unsafe-inline' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:* https://*.ts.net:* https://100.102.143.17:* https://mempool.space",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
      "media-src 'self' blob:",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    c.header('Content-Security-Policy', toolCsp);
  } else {
    c.header('Content-Security-Policy', getCspDirectives());
  }

  // Prevent clickjacking (except same-origin embedded tool routes)
  if (!isEmbeddedToolRoute) {
    c.header('X-Frame-Options', 'DENY');
  }

  // Prevent MIME type sniffing
  c.header('X-Content-Type-Options', 'nosniff');

  // Enable legacy XSS filter (mostly for older browsers)
  c.header('X-XSS-Protection', '1; mode=block');

  // Enforce HTTPS (1 year, include subdomains) — production only
  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Control referrer information
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Prevent browsers from caching sensitive responses
  // (can be overridden by cache-headers middleware for specific routes)
  if (!c.res.headers.get('Cache-Control')) {
    c.header('Cache-Control', 'no-store');
  }
};
