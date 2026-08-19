import { z } from "zod";

// Semantic upper bounds guard against typos/abuse (a stray digit can turn a
// sane limit into a DoS knob). Bounds are far above any documented use.
export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  TRUST_PROXY: z.enum(["1"]).optional(),
  ENABLE_HSTS: z.enum(["1"]).optional(),
  FFMPEG_PATH: z.string().min(1).optional(),
  FFMPEG_MAX_CONCURRENCY: z.coerce.number().int().positive().max(64).default(2),
  FFMPEG_TIMEOUT_MS: z.coerce.number().int().positive().max(1_800_000).default(300000),
  FFMPEG_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().max(4_294_967_296).optional(),
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
