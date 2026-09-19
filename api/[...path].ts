let appPromise: Promise<any> | undefined;

async function getApp() {
  if (!appPromise) {
    appPromise = import('../apps/api/dist/src/server.js').then(({ app }) => app);
  }

  return appPromise;
}

export default async function handler(req: any, res: any) {
  const app = await getApp();

  await app.ready();

  const response = await app.inject({
    method: req.method,
    url: req.url,
    headers: req.headers,
    payload: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : req.body,
  });

  res.statusCode = response.statusCode;

  for (const [key, value] of Object.entries(response.headers)) {
    if (value !== undefined) {
      res.setHeader(key, value as any);
    }
  }

  res.end(response.body);
}
