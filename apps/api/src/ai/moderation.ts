/**
 * Moderação de output para o conteúdo gerado (SDD 8.4 camada 3).
 * Usa a mesma blocklist da sanitização de entrada + heurísticas locais:
 * - recusas do modelo;
 * - vazamento de system prompt / instruções;
 * - saída bruta com marcação de código ou papéis de chat.
 */

import { containsBlocked } from "./sanitize.js";

export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

// Frases que indicam vazamento do prompt/instruções no texto gerado.
const PROMPT_LEAK_PATTERNS: RegExp[] = [
  /system\s*prompt/i,
  /prompt\s+d[eo]\s+sistema/i,
  /minhas\s+instru[çc][õo]es/i,
  /instru[çc][õo]es\s+d[eo]\s+sistema/i,
  /\[diretrizes\s+de\s+seguran[çc]a/i,
  /\[role\]/i,
  /^\s*(system|assistant)\s*:/im,
];

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

  // Heurística: vazamento de prompt/instruções de sistema no texto
  if (PROMPT_LEAK_PATTERNS.some((re) => re.test(text))) {
    return { ok: false, reason: "prompt_leak_in_output" };
  }

  // Heurística: saída com cercas de código (JSON/markdown cru vazando)
  if (text.includes("```")) {
    return { ok: false, reason: "raw_markup_in_output" };
  }

  // Heuristic: output looks like raw JSON error or refusal
  const lower = text.toLowerCase().trim();
  const refusalPhrases = [
    "não posso",
    "nao posso",
    "não consigo",
    "nao consigo",
    "i cannot",
    "i can't",
    "i'm sorry",
    "desculpe",
    "como modelo de linguagem",
    "error:",
    "exception:",
  ];
  if (refusalPhrases.some((p) => lower.startsWith(p))) {
    return { ok: false, reason: "model_refusal" };
  }

  return { ok: true };
}
