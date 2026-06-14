import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { authRoutes } from "./routes/auth.js";
import { childProfileRoutes } from "./routes/childProfiles.js";
import { configRoutes } from "./routes/config.js";
import { storyRoutes } from "./routes/stories.js";
import { creativeRoutes } from "./routes/creative.js";
import { generateRoutes } from "./routes/generate.js";

export function buildApp() {
  const app = Fastify({ logger: false });

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
  app.register(generateRoutes, { prefix: "/api/v1" });

  return app;
}
