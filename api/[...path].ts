let appPromise: Promise<any> | undefined;

async function getApp() {
  if (!appPromise) {
    appPromise = import('../apps/api/dist/src/server.js').then(({ app }) => app);
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  // Diagnostic: expose which env vars are present at runtime (values hidden)
  if (req.url === '/api/v1/debug-env') {
    const keys = ['DATABASE_URL','SESSION_SECRET','WEB_ORIGIN','COOKIE_SECURE','DATABASE_SSL'];
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(Object.fromEntries(keys.map(k => [k, process.env[k] ? '✓ set' : '✗ MISSING']))));
    return;
  }

  let app: any;
  try {
    app = await getApp();
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'App failed to load', message: err?.message, stack: err?.stack }));
    return;
  }

  await app.ready();

  // Vercel pre-parses JSON bodies. Always normalize to a JSON string for Fastify.
  let payload: string | undefined;
  if (!['GET', 'HEAD'].includes(req.method ?? '') && req.body !== undefined) {
    if (typeof req.body === 'string') {
      // Already a string — try to parse+re-stringify to ensure valid JSON
      try { payload = JSON.stringify(JSON.parse(req.body)); } catch { payload = req.body; }
    } else if (Buffer.isBuffer(req.body)) {
      payload = req.body.toString('utf8');
    } else {
      payload = JSON.stringify(req.body);
    }
  }

  const response = await app.inject({
    method: req.method,
    url: req.url,
    headers: req.headers,
    payload,
  });

  res.statusCode = response.statusCode;

  for (const [key, value] of Object.entries(response.headers)) {
    if (value !== undefined) {
      res.setHeader(key, value as any);
    }
  }

  res.end(response.body);
}
