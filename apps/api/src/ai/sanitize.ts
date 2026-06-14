/**
 * Input sanitization and blocklist for user_guidance.
 * Blocklist covers PT-BR terms inappropriate for kids' content (8+).
 */

// PT-BR blocklist — terms flagged as inappropriate for children's stories
const BLOCKED_TERMS = [
  // violence
  "matar",
  "morte",
  "assassinar",
  "assassinato",
  "sangue",
  "violência",
  "tortura",
  "briga feia",
  // adult content
  "sexo",
  "sexual",
  "nudez",
  "pornografia",
  "erótico",
  // drugs/alcohol
  "droga",
  "drogas",
  "álcool",
  "cerveja",
  "cachaça",
  "cigarro",
  "fumar",
  // profanity (common PT-BR)
  "merda",
  "porra",
  "caralho",
  "buceta",
  "puta",
  "viado",
  "cuzão",
  "otário",
  "idiota",
  "imbecil",
  "cretino",
  // abuse
  "abuso",
  "estupro",
  "molestamento",
  // horror
  "demônio",
  "satanás",
  "inferno",
  "macabro",
  "terror extremo",
  // self-harm
  "suicídio",
  "se matar",
  "autolesão",
  // prompt injection attempts
  "ignore as instruções",
  "ignore os requisitos",
  "ignore o prompt",
  "novo prompt",
  "system:",
  "assistant:",
];

/**
 * Returns true if the text contains any blocked term (case-insensitive).
 */
export function containsBlocked(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_TERMS.some((term) => lower.includes(term.toLowerCase()));
}

/**
 * Sanitizes user guidance:
 * - Trim whitespace
 * - Enforce max 500 chars (hard cap)
 * - Strip markdown bold/italic/headers
 * - Strip potential injection patterns (lines starting with "system:", "assistant:", etc.)
 */
export function sanitizeGuidance(raw: string): string {
  return raw
    .trim()
    .slice(0, 500)
    .replace(/[*_#`~]/g, "") // strip markdown
    .replace(/^\s*(system:|assistant:|user:)\s*/gim, "") // strip injection prefixes
    .trim();
}
