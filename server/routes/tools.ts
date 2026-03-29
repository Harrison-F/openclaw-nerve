import { Hono } from 'hono';

const app = new Hono();

const APARTMENT_TARGETS = [
  'http://127.0.0.1:3334',
  'http://127.0.0.1:3333',
];

const LIGHTNING_TARGETS = [
  'http://127.0.0.1:8092',
  'http://127.0.0.1:8091',
];

function joinTarget(base: string, subpath: string, search: string): string {
  const normalizedBase = base.replace(/\/$/, '');
  const normalizedPath = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `${normalizedBase}${normalizedPath}${search}`;
}

async function proxyToTargets(c: any, targets: string[], stripPrefix: string): Promise<Response> {
  const url = new URL(c.req.url);
  const subpath = url.pathname.replace(stripPrefix, '') || '/';
  const method = c.req.method.toUpperCase();
  const requestHeaders = new Headers(c.req.raw.headers);
  requestHeaders.delete('host');

  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : await c.req.arrayBuffer();

  let lastError: unknown = null;

  for (const base of targets) {
    const targetUrl = joinTarget(base, subpath, url.search);
    try {
      const upstream = await fetch(targetUrl, {
        method,
        headers: requestHeaders,
        body,
        redirect: 'manual',
      });

      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete('x-frame-options');
      const csp = responseHeaders.get('content-security-policy');
      if (csp && /frame-ancestors/i.test(csp)) {
        responseHeaders.set(
          'content-security-policy',
          csp.replace(/frame-ancestors\s+[^;]+;?/i, '').replace(/;;+/g, ';').trim().replace(/;$/, '')
        );
      }
      responseHeaders.delete('content-length');

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err) {
      lastError = err;
    }
  }

  return c.json({
    error: 'Tool upstream unavailable',
    detail: lastError instanceof Error ? lastError.message : String(lastError || 'unknown error'),
  }, 502);
}

app.all('/tools/apartment', (c) => proxyToTargets(c, APARTMENT_TARGETS, '/tools/apartment'));
app.all('/tools/apartment/*', (c) => proxyToTargets(c, APARTMENT_TARGETS, '/tools/apartment'));
app.all('/tools/lightning', (c) => proxyToTargets(c, LIGHTNING_TARGETS, '/tools/lightning'));
app.all('/tools/lightning/*', (c) => proxyToTargets(c, LIGHTNING_TARGETS, '/tools/lightning'));

export default app;
