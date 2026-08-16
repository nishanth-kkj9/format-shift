import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  TRUST_PROXY: z.enum(["1"]).optional(),
  ENABLE_HSTS: z.enum(["1"]).optional(),
  FFMPEG_PATH: z.string().min(1).optional(),
  FFMPEG_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  FFMPEG_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  FFMPEG_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().optional(),
  FFMPEG_MIN_SECURITY_VERSION: z.string().min(1).optional(),
  FFMPEG_MIN_FEATURE_VERSION: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error("Invalid environment configuration:\n" + issues);
  process.exit(1);
}

export const env = parsed.data;
