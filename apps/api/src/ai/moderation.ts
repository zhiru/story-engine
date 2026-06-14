/**
 * Output moderation for generated story content.
 * Uses the same blocklist as input sanitization, plus simple heuristics.
 */

import { containsBlocked } from "./sanitize.js";

export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Moderate generated story output.
 * Returns { ok: true } if content passes, { ok: false, reason } otherwise.
 */
export function moderateOutput(text: string): ModerationResult {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: "empty_output" };
  }

  if (containsBlocked(text)) {
    return { ok: false, reason: "blocked_term_in_output" };
  }

  // Heuristic: excessively short output (likely generation failure)
  if (text.trim().length < 100) {
    return { ok: false, reason: "output_too_short" };
  }

  // Heuristic: output looks like raw JSON error or refusal
  const lower = text.toLowerCase().trim();
  const refusalPhrases = [
    "não posso",
    "não consigo",
    "i cannot",
    "i'm sorry",
    "desculpe",
    "error:",
    "exception:",
  ];
  if (refusalPhrases.some((p) => lower.startsWith(p))) {
    return { ok: false, reason: "model_refusal" };
  }

  return { ok: true };
}
