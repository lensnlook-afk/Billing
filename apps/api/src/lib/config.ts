import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(), SESSION_SECRET: z.string().min(32), PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url(), COOKIE_SECURE: z.enum(['true', 'false']).default('true'), DATABASE_SSL: z.enum(['true', 'false']).default('false'),
});
let config: z.infer<typeof configSchema>;
try {
  config = configSchema.parse(process.env);
} catch (err) {
  console.error('CONFIG VALIDATION FAILED:', JSON.stringify(err, null, 2));
  throw err;
}
export { config };
