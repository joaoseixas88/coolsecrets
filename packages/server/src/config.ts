import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  COOLIFY_BASE_URL: z
    .string()
    .url('COOLIFY_BASE_URL must be a valid absolute URL.')
    .refine((v) => v.startsWith('http://') || v.startsWith('https://'), {
      message: 'COOLIFY_BASE_URL must use http or https.',
    })
    .transform((v) => v.replace(/\/$/, '')),
  COOLIFY_API_TOKEN: z.string().min(1, 'COOLIFY_API_TOKEN is required.'),

  INFISICAL_API_URL: z
    .string()
    .url()
    .default('https://app.infisical.com')
    .transform((v) => v.replace(/\/$/, '')),
  INFISICAL_SIGNING_SECRET: z.string().min(1, 'INFISICAL_SIGNING_SECRET is required.'),
  INFISICAL_CLIENT_ID: z.string().min(1, 'INFISICAL_CLIENT_ID is required.'),
  INFISICAL_CLIENT_SECRET: z.string().min(1, 'INFISICAL_CLIENT_SECRET is required.'),

  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  SHUTDOWN_DRAIN_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type ServerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = schema.safeParse(env);
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid server configuration:\n${issues}`);
}
