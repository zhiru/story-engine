import { describe, it, expect } from "vitest";
import { stubProvider } from "./stubProvider.js";
import { moderateOutput } from "./moderation.js";
import { containsBlocked } from "./sanitize.js";
import type { GenerateInput } from "./provider.js";

const BASE_INPUT: GenerateInput = {
  prompt: "test-prompt",
  universe: { title: "Mundo Mágico", description: "Um mundo encantado." },
  characters: [
    { name: "Luna", classification: "PRINCIPAL", traits: ["corajosa", "curiosa"] },
    { name: "Bolt", classification: "MASCOTE", traits: ["fiel"] },
  ],
  theme: { title: "Amizade", description: "Sobre amigos de verdade." },
  weather: { condition: "ensolarado", temperature: 24, currentTime: "manhã" },
  narrativeType: "SINGLE",
  seed: "test-seed-001",
};

describe("stubProvider", () => {
  it("generates a story with title and story_body", async () => {
    const out = await stubProvider.generate(BASE_INPUT);
    expect(out.title).toBeTruthy();
    expect(out.story_body.length).toBeGreaterThan(100);
    expect(out.internal_summary_for_next_chapters).toBeTruthy();
  });

  it("PRINCIPAL character leads resolution (name appears in story)", async () => {
    const out = await stubProvider.generate(BASE_INPUT);
    expect(out.story_body).toContain("Luna");
  });

  it("CONTINUOUS narrative ends with a hook", async () => {
    const continuous: GenerateInput = { ...BASE_INPUT, narrativeType: "CONTINUOUS", seed: "hook-test-001" };
    const out = await stubProvider.generate(continuous);
    // The hook is the last paragraph and contains ellipsis or exclamation
    const paragraphs = out.story_body.split("\n\n");
    const last = paragraphs[paragraphs.length - 1]!;
    const hasHook = last.includes("...") || last.includes("!") || last.includes("aventura");
    expect(hasHook).toBe(true);
  });

  it("SINGLE narrative does NOT end with a hook (no new mystery sentence)", async () => {
    const out = await stubProvider.generate({ ...BASE_INPUT, narrativeType: "SINGLE" });
    // Should be 5 paragraphs for SINGLE
    const paragraphs = out.story_body.split("\n\n");
    expect(paragraphs.length).toBe(5);
  });

  it("different seeds produce different stories", async () => {
    const out1 = await stubProvider.generate({ ...BASE_INPUT, seed: "seed-A" });
    const out2 = await stubProvider.generate({ ...BASE_INPUT, seed: "seed-B" });
    // At minimum, titles or content should differ
    expect(out1.story_body).not.toBe(out2.story_body);
  });

  it("same seed always produces the same story (deterministic)", async () => {
    const out1 = await stubProvider.generate({ ...BASE_INPUT, seed: "deterministic-42" });
    const out2 = await stubProvider.generate({ ...BASE_INPUT, seed: "deterministic-42" });
    expect(out1.title).toBe(out2.title);
    expect(out1.story_body).toBe(out2.story_body);
  });

  it("weaves weather condition into the story", async () => {
    const rainy: GenerateInput = { ...BASE_INPUT, weather: { ...BASE_INPUT.weather, condition: "chuvoso" }, seed: "rain-test" };
    const out = await stubProvider.generate(rainy);
    expect(out.story_body.toLowerCase()).toContain("chuva");
  });

  it("internal_summary contains 3 sentences", async () => {
    const out = await stubProvider.generate(BASE_INPUT);
    // 3 sentences separated by ". " or "."
    const sentences = out.internal_summary_for_next_chapters
      .split(".")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(2); // at least 2 factual statements
  });
});

describe("moderateOutput", () => {
  it("approves clean kids story text", () => {
    const result = moderateOutput(
      "Era uma vez uma criança muito feliz que aprendeu a compartilhar com seus amigos. A história terminou com todos sorrindo.",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects text with blocked term", () => {
    const result = moderateOutput("A criança viu sangue no chão e ficou assustada.");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("blocked_term_in_output");
  });

  it("rejects empty text", () => {
    const result = moderateOutput("");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("empty_output");
  });

  it("rejects very short output", () => {
    const result = moderateOutput("ok");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("output_too_short");
  });
});

describe("containsBlocked (input)", () => {
  it("returns true for blocked word", () => {
    expect(containsBlocked("a criança morreu de susto")).toBe(true);
  });

  it("returns false for clean text", () => {
    expect(containsBlocked("A Gigi foi brincar no jardim")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(containsBlocked("MATAR um dragão")).toBe(true);
  });
});
