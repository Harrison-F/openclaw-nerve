import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { normalizeApiPath, shouldNormalizePath, trimTrailingSlash } from './normalize-api-path.js';

describe('normalizeApiPath', () => {
  it('detects trailing-slash API paths except the health endpoint aliases', () => {
    expect(shouldNormalizePath('/api/connect-defaults/')).toBe(true);
    expect(shouldNormalizePath('/api/health/')).toBe(false);
    expect(shouldNormalizePath('/health/')).toBe(false);
    expect(shouldNormalizePath('/api/connect-defaults')).toBe(false);
    expect(shouldNormalizePath('/settings/')).toBe(false);
  });

  it('trims one or more trailing slashes down to the canonical path', () => {
    expect(trimTrailingSlash('/api/connect-defaults/')).toBe('/api/connect-defaults');
    expect(trimTrailingSlash('/api/connect-defaults///')).toBe('/api/connect-defaults');
  });

  it('redirects trailing-slash API requests before auth/routes run', async () => {
    const app = new Hono();
    app.use('*', normalizeApiPath);
    app.get('/api/connect-defaults', (c) => c.json({ ok: true }));

    const res = await app.request('http://localhost/api/connect-defaults/?source=test');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('http://localhost/api/connect-defaults?source=test');
  });

  it('leaves canonical API paths alone', async () => {
    const app = new Hono();
    app.use('*', normalizeApiPath);
    app.get('/api/connect-defaults', (c) => c.json({ ok: true }));

    const res = await app.request('http://localhost/api/connect-defaults');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
