/**
 * Observability — Sentry integration (pluggable/optional).
 * If SENTRY_DSN is set, errors are reported to Sentry.
 * If absent, all functions are no-ops so the app runs without a DSN.
 */
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

let sentryInitialized = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;

export async function initObservability(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "production",
      tracesSampleRate: 0.1,
    });
    sentryInitialized = true;
    console.log("[observability] Sentry initialized");
  } catch {
    console.warn("[observability] Failed to load @sentry/node — errors will not be reported");
  }
}

export function captureError(err: unknown): void {
  if (!sentryInitialized || !Sentry) return;
  Sentry.captureException(err);
}

/**
 * Fastify error handler that:
 * 1. Reports to Sentry when initialized.
 * 2. Always returns the standard error envelope.
 */
export function buildErrorHandler() {
  return function errorHandler(
    err: FastifyError,
    _request: FastifyRequest,
    reply: FastifyReply,
  ) {
    captureError(err);

    const statusCode = err.statusCode ?? 500;

    // Preserve rate-limit 429 responses that already have a body
    if (statusCode === 429) {
      return reply.code(429).send({
        error: { code: "RATE_LIMITED", message: err.message ?? "Too many requests" },
      });
    }

    if (statusCode >= 500) {
      console.error("[error]", err);
    }

    return reply.code(statusCode).send({
      error: { code: err.code ?? "INTERNAL_ERROR", message: err.message ?? "Internal server error" },
    });
  };
}
