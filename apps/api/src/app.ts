import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";

export function buildApp() {
  const app = Fastify({ logger: false });
  app.get("/health", async () => {
    await db.execute(sql`select 1`); // prova conectividade real com o Postgres
    return { status: "ok", db: "up" };
  });
  return app;
}
