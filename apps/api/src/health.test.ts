import { describe, it, expect, afterAll } from "vitest";
import { buildApp } from "./app";

const app = buildApp();
afterAll(async () => { await app.close(); });

describe("GET /health", () => {
  it("retorna ok e db up lendo o Postgres", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "up" });
  });
});
