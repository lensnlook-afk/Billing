import { app } from '../apps/api/src/server.js';

/** Vercel's Node runtime supplies standard IncomingMessage/ServerResponse objects. */
export default async function handler(request: unknown, response: unknown) {
  await app.ready();
  app.server.emit('request', request, response);
}
