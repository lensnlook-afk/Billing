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

  // Vercel pre-parses JSON bodies into objects. Fastify's inject() expects
  // a string/Buffer, so we must re-serialize to avoid silent body corruption.
  let payload: string | undefined;
  if (!['GET', 'HEAD'].includes(req.method ?? '') && req.body !== undefined) {
    payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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
