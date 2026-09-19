import { app } from '../apps/api/dist/src/server.js';

let ready: Promise<void> | undefined;

export default async function handler(req: any, res: any) {
  ready ??= app.ready();
  await ready;

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
