/**
 * Sanitização de entrada e blocklist para user_guidance (SDD 8.2 / §12).
 *
 * - Blocklist pt-BR de termos inadequados ao público infantil (violência,
 *   terror, conteúdo adulto, drogas, palavrões, autolesão), tentativas de
 *   prompt-injection, extração do system prompt e pesca de PII.
 * - Matching com normalização de acentos + limites de palavra: evita falsos
 *   positivos por substring (ex.: "computador" não dispara "puta",
 *   "armário" não dispara "arma").
 * - sanitizeGuidance() remove markdown, cercas de código e frases de
 *   injection ("ignore as instruções", "aja como", "você agora é", …) —
 *   neutraliza o que não é bloqueado.
 */

// ── Normalização (acentos + caixa) ───────────────────────────────────────────

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos (faixa Unicode de combinacao)
    .toLowerCase();
}

// ── Blocklist pt-BR ───────────────────────────────────────────────────────────
// Termos SEM acento (a comparação é feita sobre texto normalizado).
// Variações de gênero/número são explícitas — o matching é por palavra exata.
const BLOCKED_TERMS = [
  // violência
  "matar",
  "mate",
  "morte",
  "morreu",
  "morrer",
  "assassinar",
  "assassinato",
  "assassino",
  "sangue",
  "sangrento",
  "violencia",
  "violento",
  "violenta",
  "tortura",
  "torturar",
  "briga feia",
  "espancar",
  "enforcar",
  "estrangular",
  "sequestrar",
  "sequestro",
  "arma",
  "armas",
  "arma de fogo",
  "faca",
  "facas",
  "pistola",
  "revolver",
  "espingarda",
  "bomba",
  "explosivo",
  "guerra sangrenta",
  // conteúdo adulto
  "sexo",
  "sexual",
  "nudez",
  "pornografia",
  "pornografico",
  "erotico",
  "erotica",
  "eroticos",
  "eroticas",
  "transar",
  "prostituicao",
  "conteudo adulto",
  // drogas/álcool/fumo
  "droga",
  "drogas",
  "maconha",
  "cocaina",
  "heroina",
  "entorpecente",
  "alcool",
  "cerveja",
  "cachaca",
  "vodka",
  "whisky",
  "bebado",
  "bebada",
  "cigarro",
  "fumar",
  "fuma",
  "fumam",
  "fumando",
  // palavrões (pt-BR comuns)
  "merda",
  "porra",
  "caralho",
  "buceta",
  "puta",
  "putas",
  "viado",
  "cuzao",
  "otario",
  "idiota",
  "imbecil",
  "cretino",
  "palavrao",
  "palavroes",
  // abuso
  "abuso",
  "estupro",
  "molestamento",
  "pedofilia",
  // terror/horror
  "demonio",
  "demonios",
  "satanas",
  "inferno",
  "macabro",
  "macabra",
  "terror",
  "terror extremo",
  "aterrorizante",
  "zumbi",
  "zumbis",
  "possuido",
  "possuida",
  "exorcismo",
  // autolesão
  "suicidio",
  "se matar",
  "autolesao",
  "se machucar de proposito",
  // tentativas de prompt-injection
  "ignore as instrucoes",
  "ignorar as instrucoes",
  "ignore os requisitos",
  "ignore o prompt",
  "ignore todas as regras",
  "esqueca as instrucoes",
  "desconsidere as instrucoes",
  "desconsidere tudo",
  "novo prompt",
  "sem filtros",
  "sem censura",
  "system:",
  "assistant:",
  "jailbreak",
  // extração do system prompt
  "system prompt",
  "prompt de sistema",
  "prompt do sistema",
  "mostre o prompt",
  "revele o prompt",
  "repita o prompt",
  "diga seu prompt",
  "seu prompt",
  "repita as instrucoes",
  "mostre as instrucoes",
  "revele as instrucoes",
  "suas instrucoes",
  "minhas instrucoes",
  "instrucoes de sistema",
  "instrucoes do sistema",
  "diretrizes de seguranca — bloco fixo",
  // pesca de PII (dados da criança/família)
  "nome completo",
  "cpf",
  "rg da crianca",
  "cartao de credito",
  "numero do cartao",
  "dados do cartao",
  "senha dos pais",
  "digitar a senha",
  "endereco da crianca",
  "telefone da crianca",
  "onde a crianca mora",
  "escola da crianca",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Limites de palavra manuais ([a-z0-9]) — \b não funciona bem com o texto
// normalizado quando o termo termina em pontuação (ex.: "system:").
const BLOCKED_PATTERNS: RegExp[] = BLOCKED_TERMS.map(
  (term) => new RegExp(`(?<![a-z0-9])${escapeRegExp(normalize(term))}(?![a-z0-9])`),
);

/**
 * Returns true if the text contains any blocked term (case/accent-insensitive,
 * word-boundary aware).
 */
export function containsBlocked(text: string): boolean {
  const norm = normalize(text);
  return BLOCKED_PATTERNS.some((re) => re.test(norm));
}

// ── Frases de injection neutralizadas na sanitização ─────────────────────────

// Obs.: \b do JS é ASCII — não funciona após palavras acentuadas ("é",
// "será"). Usamos lookahead explícito de fim de palavra nos casos com acento.
const END = "(?=[\\s.,;:!?…)\\]}\"']|$)";

const INJECTION_PATTERNS: RegExp[] = [
  // cercas de código inteiras (podem embutir instruções "system")
  /```[\s\S]*?```/g,
  /```[\s\S]*$/g, // cerca aberta sem fechamento
  // prefixos de papel no início de linha
  /^\s*(system|assistant|user)\s*:\s*/gim,
  // marcadores de papel inline entre colchetes/tags
  /\[\/?(system|assistant|inst)\]/gi,
  /<\/?(system|assistant|inst)>/gi,
  // comandos de reescrita de identidade/instruções
  /\b(ignore|ignorem|ignorar|esqueca|esqueça|desconsidere|descarte)\s+(as\s+|todas\s+as\s+|os\s+|todos\s+os\s+|o\s+|a\s+)?(instrucoes|instruções|regras|requisitos|diretrizes|prompts?)(\s+(anteriores|acima|do\s+sistema))?/gi,
  /\bdesconsidere\s+tudo(\s+(acima|antes|anterior))?/gi,
  /\baja\s+como\b/gi,
  /\bhaja\s+como\b/gi,
  new RegExp(`\\bfinja\\s+que\\s+(voce|você)\\s+(e|é)${END}`, "gi"),
  /\bfinja\s+ser\b/gi,
  new RegExp(`\\b(voce|você)\\s+agora\\s+(e|é|sera|será)${END}`, "gi"),
  new RegExp(`\\ba\\s+partir\\s+de\\s+agora\\s+(voce|você)\\s+(e|é|sera|será)${END}`, "gi"),
];

/**
 * Sanitizes user guidance:
 * - Trim whitespace
 * - Enforce max 500 chars (hard cap)
 * - Strip markdown bold/italic/headers e cercas de código
 * - Strip/neutraliza padrões de injection ("system:", "aja como",
 *   "você agora é", "ignore as instruções", …)
 */
export function sanitizeGuidance(raw: string): string {
  let text = raw.trim().slice(0, 500);

  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  return text
    .replace(/[*_#`~>|]/g, "") // strip markdown
    .replace(/\s{2,}/g, " ") // colapsa espaços deixados pelas remoções
    .trim();
}
