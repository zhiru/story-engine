/**
 * Provedor de IA compatível com OpenAI (`/v1/chat/completions`).
 * Funciona com gateways como OmniRoute (roteando p/ Claude) ou OpenAI direto.
 * A chave vem SEMPRE do env (ADR-07), nunca do banco nem do código.
 *
 * RF-23 / ADR-04:
 * - Saída estruturada via `response_format: json_schema` (strict) — o gateway
 *   pode ignorar o campo, então o parsing tolerante (cercas/chaves) continua
 *   como fallback.
 * - `max_tokens` e `temperature` vêm de `ai_providers.params` (defaults
 *   1800 / 0.8) — nada hardcoded.
 * - O campo `usage` da resposta é lido e devolvido como
 *   { inputTokens, outputTokens } para o registro de custo (SDD 8.5).
 */

import type { AiProvider, GenerateInput, GenerateOutput, GenerateUsage } from "./provider.js";

export interface OpenAiProviderOpts {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Parâmetros de ai_providers.params (max_tokens, temperature, …). */
  params?: Record<string, unknown>;
}

const DEFAULT_MAX_TOKENS = 1800;
const DEFAULT_TEMPERATURE = 0.8;

const SYSTEM = [
  "Você é um escritor premiado de literatura infantil e psicopedagogo.",
  "Escreva histórias lúdicas, seguras e adequadas para crianças.",
  "Responda SOMENTE com um objeto JSON válido — sem markdown, sem cercas de código, sem texto fora do JSON.",
  'Formato exato: {"title": string, "story_body": string, "internal_summary_for_next_chapters": string}.',
].join(" ");

// JSON schema estrito imposto na chamada (SDD 8.6: structured output nativo).
const STORY_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "story_output",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        story_body: { type: "string" },
        internal_summary_for_next_chapters: { type: "string" },
      },
      required: ["title", "story_body", "internal_summary_for_next_chapters"],
      additionalProperties: false,
    },
  },
} as const;

function numberParam(
  params: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  const raw = params?.[key];
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function makeOpenAiProvider(opts: OpenAiProviderOpts): AiProvider {
  const maxTokens = numberParam(opts.params, "max_tokens", DEFAULT_MAX_TOKENS);
  const temperature = numberParam(opts.params, "temperature", DEFAULT_TEMPERATURE);

  return {
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      if (!opts.apiKey || !opts.baseUrl) {
        throw new Error("AI gateway não configurado (AI_API_KEY/AI_BASE_URL ausentes)");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let res: Response;
      try {
        res = await fetch(`${opts.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: opts.model,
            temperature,
            max_tokens: maxTokens,
            stream: false, // queremos a resposta completa, não SSE
            response_format: STORY_RESPONSE_FORMAT,
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: input.prompt },
            ],
          }),
        });
      } finally {
        clearTimeout(timeout);
      }

      const raw = await res.text();
      if (!res.ok) {
        throw new Error(`AI gateway ${res.status}: ${raw.slice(0, 300)}`);
      }

      // O gateway pode responder JSON normal OU stream SSE mesmo com stream:false.
      const { content, usage } = extractContentAndUsage(raw);
      const parsed = parseStoryJson(content);
      if (!parsed) {
        throw new Error("Resposta da IA não pôde ser interpretada como JSON de história");
      }
      return { ...parsed, usage };
    },
  };
}

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

function toUsage(raw: RawUsage | undefined | null): GenerateUsage | undefined {
  if (!raw) return undefined;
  const inputTokens = raw.prompt_tokens ?? raw.input_tokens;
  const outputTokens = raw.completion_tokens ?? raw.output_tokens;
  if (typeof inputTokens !== "number" && typeof outputTokens !== "number") {
    return undefined;
  }
  return {
    inputTokens: typeof inputTokens === "number" ? inputTokens : 0,
    outputTokens: typeof outputTokens === "number" ? outputTokens : 0,
  };
}

/**
 * Extrai o texto + usage da resposta, lidando com JSON normal OU stream SSE
 * (`data: {chunk}` — usage costuma vir no último chunk).
 */
export function extractContentAndUsage(raw: string): {
  content: string;
  usage?: GenerateUsage;
} {
  if (raw.trimStart().startsWith("data:")) {
    let acc = "";
    let usage: GenerateUsage | undefined;
    for (const line of raw.split(/\r?\n/)) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const payload = l.slice(5).trim();
      if (payload === "" || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          usage?: RawUsage;
        };
        const ch = obj.choices?.[0];
        acc += ch?.delta?.content ?? ch?.message?.content ?? "";
        usage = toUsage(obj.usage) ?? usage;
      } catch {
        // chunk malformado — ignora
      }
    }
    return { content: acc, usage };
  }
  try {
    const obj = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: RawUsage;
    };
    return {
      content: obj.choices?.[0]?.message?.content ?? "",
      usage: toUsage(obj.usage),
    };
  } catch {
    return { content: raw };
  }
}

/** Compat: extrai apenas o texto da resposta. */
export function extractContent(raw: string): string {
  return extractContentAndUsage(raw).content;
}

/** Tolerante: remove cercas ```json e isola o primeiro objeto {...}. */
export function parseStoryJson(
  content: string,
): Pick<GenerateOutput, "title" | "story_body" | "internal_summary_for_next_chapters"> | null {
  let txt = content.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) txt = fence[1].trim();
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start >= 0 && end > start) txt = txt.slice(start, end + 1);
  try {
    const obj = JSON.parse(txt) as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title : null;
    const body = typeof obj.story_body === "string" ? obj.story_body : null;
    const summary =
      typeof obj.internal_summary_for_next_chapters === "string"
        ? obj.internal_summary_for_next_chapters
        : "";
    if (!title || !body) return null;
    return { title, story_body: body, internal_summary_for_next_chapters: summary };
  } catch {
    return null;
  }
}
