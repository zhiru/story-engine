/**
 * O rate limit GLOBAL é chaveado estritamente pelo IP do cliente (finding 4).
 * O hook do rate limit roda antes do requireAuth, então o Bearer é apenas um
 * token não verificado — chavear por ele permitia bypass rotacionando tokens
 * falsos contra /auth/login|register|refresh (brute force). Chavear pelo IP
 * fecha esse vetor.
 */
import { describe, it, expect } from "vitest";
import type { FastifyRequest } from "fastify";
import { globalRateLimitKey } from "./app.js";

function fakeRequest(ip: string, authorization?: string): FastifyRequest {
  return {
    ip,
    headers: authorization ? { authorization } : {},
  } as unknown as FastifyRequest;
}

describe("globalRateLimitKey", () => {
  it("returns the client IP", () => {
    expect(globalRateLimitKey(fakeRequest("1.2.3.4"))).toBe("1.2.3.4");
  });

  it("ignores the (unverified) Bearer token — rotating fake tokens shares the same IP bucket", () => {
    const ip = "9.9.9.9";
    const withTokenA = globalRateLimitKey(fakeRequest(ip, "Bearer token-A"));
    const withTokenB = globalRateLimitKey(fakeRequest(ip, "Bearer token-B"));
    const withoutToken = globalRateLimitKey(fakeRequest(ip));

    expect(withTokenA).toBe(ip);
    expect(withTokenB).toBe(ip);
    expect(withoutToken).toBe(ip);
    // Rotacionar tokens NÃO cria buckets novos: a chave é sempre o IP.
    expect(withTokenA).toBe(withTokenB);
  });
});
