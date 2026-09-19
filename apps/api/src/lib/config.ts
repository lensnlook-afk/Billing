import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(), SESSION_SECRET: z.string().min(32), PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url(), COOKIE_SECURE: z.enum(['true', 'false']).default('true'), DATABASE_SSL: z.enum(['true', 'false']).default('false'),
});
export const config = configSchema.parse(process.env);
