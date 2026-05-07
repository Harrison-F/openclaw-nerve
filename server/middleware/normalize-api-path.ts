import { createMiddleware } from 'hono/factory';

function shouldNormalizePath(path: string): boolean {
  return path.length > 1 && path.endsWith('/') && path.startsWith('/api/') && path !== '/api/health/';
}

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

/**
 * Redirect API-style paths with a trailing slash to the canonical no-slash URL.
 * Prevents public endpoints like /api/connect-defaults/ from being auth-blocked
 * or 404ing when clients append a slash.
 */
export const normalizeApiPath = createMiddleware(async (c, next) => {
  const path = c.req.path;
  if (!shouldNormalizePath(path)) return next();

  const url = new URL(c.req.url);
  url.pathname = trimTrailingSlash(url.pathname);
  return c.redirect(url.toString(), 308);
});

export { shouldNormalizePath, trimTrailingSlash };
