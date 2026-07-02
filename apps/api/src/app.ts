import { createHash, randomUUID } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { authRoutes } from "./routes/auth.js";
import { childProfileRoutes } from "./routes/childProfiles.js";
import { configRoutes } from "./routes/config.js";
import { storyRoutes } from "./routes/stories.js";
import { creativeRoutes } from "./routes/creative.js";
import { discoveryRoutes } from "./routes/discovery.js";
import { ratingRoutes } from "./routes/ratings.js";
import { generateRoutes } from "./routes/generate.js";
import { meRoutes } from "./routes/me.js";
import { billingRoutes } from "./routes/billing.js";
import { userRoutes } from "./routes/users.js";
import { adminUserRoutes } from "./routes/admin/users.js";
import { adminPlanRoutes } from "./routes/admin/plans.js";
import { reportRoutes } from "./routes/admin/reports.js";
import { adminAppSettingsRoutes } from "./routes/admin/appSettings.js";
import { adminAuditRoutes } from "./routes/admin/audit.js";
import { adminPromptTemplateRoutes } from "./routes/admin/promptTemplates.js";
import { adminAiProviderRoutes } from "./routes/admin/aiProviders.js";
import { adminCostRoutes } from "./routes/admin/cost.js";
import { resolveAppContext } from "./auth/appContext.js";
import { env } from "./env.js";
import { buildErrorHandler } from "./observability.js";
import { errorEnvelope } from "./http/errors.js";

/**
 * Chave do rate limit global: por usuário (SDD §7). O hook do rate limit roda
 * antes do requireAuth, então derivamos a chave do próprio Bearer token
 * (sha256) e caímos para o IP quando não há Authorization.
 */
function rateLimitKey(request: FastifyRequest): string {
  const auth = request.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return createHash("sha256").update(auth.slice(7)).digest("hex");
  }
  return request.ip;
}

export function buildApp(opts?: { disableLogger?: boolean }) {
  const useLogger = !opts?.disableLogger && process.env.NODE_ENV !== "test";

  const app = Fastify({
    logger: useLogger
      ? {
          level: "info",
          transport:
            process.env.LOG_PRETTY === "true"
              ? { target: "pino-pretty" }
              : undefined,
        }
      : false,
    genReqId: () => randomUUID(),
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });

  // CORS: dev permite o app web (Expo :8081) chamar a API (:3000).
  app.register(cors, { origin: true });

  // Rate limiting (global) — 60 req/min por usuário (SDD §7)
  if (!env.rateLimitDisabled) {
    app.register(rateLimit, {
      global: true,
      max: env.rateLimitGlobalMax,
      timeWindow: env.rateLimitGlobalWindowMs,
      keyGenerator: rateLimitKey,
      errorResponseBuilder: (request, context) =>
        errorEnvelope(
          "RATE_LIMITED",
          `Rate limit exceeded. Max ${context.max} requests per ${context.after}.`,
          request.id,
        ),
    });
  }

  // Expose request id in response header
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // Global preHandler: resolve app slug + mode from x-app-slug header
  app.addHook("preHandler", resolveAppContext);

  // Structured request logging
  app.addHook("onResponse", (request, reply, done) => {
    if (useLogger) {
      request.log.info(
        {
          requestId: request.id,
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          durationMs: reply.elapsedTime,
        },
        "request completed",
      );
    }
    done();
  });

  // Error handler (Sentry + standard envelope)
  app.setErrorHandler(buildErrorHandler());

  app.get("/health", async () => {
    await db.execute(sql`select 1`); // prova conectividade real com o Postgres
    return { status: "ok", db: "up" };
  });

  // All routes under /api/v1
  app.register(authRoutes, { prefix: "/api/v1" });
  app.register(childProfileRoutes, { prefix: "/api/v1" });
  app.register(configRoutes, { prefix: "/api/v1" });
  app.register(storyRoutes, { prefix: "/api/v1" });
  app.register(creativeRoutes, { prefix: "/api/v1" });
  app.register(discoveryRoutes, { prefix: "/api/v1" });
  app.register(ratingRoutes, { prefix: "/api/v1" });

  // Generate with tighter per-user rate limit
  if (!env.rateLimitDisabled) {
    app.register(
      async (fastify) => {
        await fastify.register(rateLimit, {
          global: false,
          max: env.rateLimitGenerateMax,
          timeWindow: env.rateLimitGenerateWindowMs,
          keyGenerator: (request) => {
            // Prefer actor id (set by requireAuth), fall back to token/IP
            return (
              (request as { actor?: { id: string } }).actor?.id ??
              rateLimitKey(request)
            );
          },
          errorResponseBuilder: (request, context) =>
            errorEnvelope(
              "RATE_LIMITED",
              `Story generation rate limit exceeded. Max ${context.max} per ${context.after}.`,
              request.id,
            ),
        });
        await fastify.register(generateRoutes);
      },
      { prefix: "/api/v1" },
    );
  } else {
    app.register(generateRoutes, { prefix: "/api/v1" });
  }

  app.register(meRoutes, { prefix: "/api/v1" });
  app.register(billingRoutes, { prefix: "/api/v1" });
  app.register(userRoutes, { prefix: "/api/v1" });
  app.register(adminUserRoutes, { prefix: "/api/v1" });
  app.register(adminPlanRoutes, { prefix: "/api/v1" });
  app.register(reportRoutes, { prefix: "/api/v1" });
  app.register(adminAppSettingsRoutes, { prefix: "/api/v1" });
  app.register(adminAuditRoutes, { prefix: "/api/v1" });
  app.register(adminPromptTemplateRoutes, { prefix: "/api/v1" });
  app.register(adminAiProviderRoutes, { prefix: "/api/v1" });
  app.register(adminCostRoutes, { prefix: "/api/v1" });

  return app;
}
