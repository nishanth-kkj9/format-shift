import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";

// The /api/code-template rate limiter stays mounted even in test mode because
// its ceiling is env-configurable (CODE_TEMPLATE_RATE_LIMIT_MAX), so this file
// boots a fresh app graph with a tiny limit to exercise the real 429 path.
// It cannot live in integration.test.ts, which imports the app statically
// with the production-default limits.

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.CODE_TEMPLATE_RATE_LIMIT_MAX = "3";
  vi.resetModules();
  const { app } = await import("./app");
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      base = `http://127.0.0.1:${(addr as { port: number }).port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
  delete process.env.CODE_TEMPLATE_RATE_LIMIT_MAX;
});

function postTemplate() {
  return fetch(`${base}/api/code-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "data", sourceFormat: "json", targetFormat: "csv" }),
  });
}

describe("POST /api/code-template rate limit", () => {
  it("serves requests up to the configured per-IP ceiling, then returns 429", async () => {
    // Requests 1..3 are inside the ceiling (limit set to 3 in beforeAll).
    for (let i = 0; i < 3; i++) {
      const res = await postTemplate();
      expect(res.status).toBe(200);
    }
    // Request 4 exceeds the ceiling and must be rejected by the limiter,
    // never reaching the route handler.
    const limited = await postTemplate();
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.error).toMatch(/too many requests/i);
  });
});
