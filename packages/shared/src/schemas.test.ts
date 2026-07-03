import { describe, it, expect } from "vitest";
import { GenerateStoryInputSchema } from "./schemas";

describe("GenerateStoryInputSchema", () => {
  it("aceita payload mínimo válido", () => {
    const r = GenerateStoryInputSchema.safeParse({ universe_id: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(true);
  });

  it("rejeita universe_id que não é uuid", () => {
    const r = GenerateStoryInputSchema.safeParse({ universe_id: "nope" });
    expect(r.success).toBe(false);
  });

  it("rejeita user_guidance acima de 500 chars", () => {
    const r = GenerateStoryInputSchema.safeParse({
      universe_id: "11111111-1111-1111-1111-111111111111",
      user_guidance: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});
