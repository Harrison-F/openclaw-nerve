/**
 * GET /health and /api/health — Health check endpoints.
 * Includes optional gateway connectivity probe.
 */

import { Hono } from 'hono';
import { config } from '../lib/config.js';

const app = new Hono();

async function healthResponse() {
  let gateway: 'ok' | 'unreachable' = 'unreachable';
  try {
    const res = await fetch(`${config.gatewayUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) gateway = 'ok';
  } catch {
    // gateway unreachable — not a server failure
  }

  return { status: 'ok', uptime: process.uptime(), gateway };
}

app.get('/health', async (c) => c.json(await healthResponse()));
app.get('/api/health', async (c) => c.json(await healthResponse()));

export default app;
