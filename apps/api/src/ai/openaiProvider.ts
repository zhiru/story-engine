/**
 * Provedor de IA compatível com OpenAI (`/v1/chat/completions`).
 * Funciona com gateways como OmniRoute (roteando p/ Claude) ou OpenAI direto.
 * A chave vem SEMPRE do env (ADR-07), nunca do banco nem do código.
 */

import type { AiProvider, GenerateInput, GenerateOutput } from "./provider.js";

export interface OpenAiProviderOpts {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const SYSTEM = [
  "Você é um escritor premiado de literatura infantil e psicopedagogo.",
  "Escreva histórias lúdicas, seguras e adequadas para crianças.",
  "Responda SOMENTE com um objeto JSON válido — sem markdown, sem cercas de código, sem texto fora do JSON.",
  'Formato exato: {"title": string, "story_body": string, "internal_summary_for_next_chapters": string}.',
].join(" ");

export function makeOpenAiProvider(opts: OpenAiProviderOpts): AiProvider {
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
            temperature: 0.85,
            max_tokens: 1800,
            stream: false, // queremos a resposta completa, não SSE
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
      const content = extractContent(raw);
      const parsed = parseStoryJson(content);
      if (!parsed) {
        throw new Error("Resposta da IA não pôde ser interpretada como JSON de história");
      }
      return parsed;
    },
  };
}

/** Extrai o texto da resposta, lidando com JSON normal OU stream SSE (`data: {chunk}`). */
export function extractContent(raw: string): string {
  if (raw.trimStart().startsWith("data:")) {
    let acc = "";
    for (const line of raw.split(/\r?\n/)) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const payload = l.slice(5).trim();
      if (payload === "" || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        const ch = obj.choices?.[0];
        acc += ch?.delta?.content ?? ch?.message?.content ?? "";
      } catch {
        // chunk malformado — ignora
      }
    }
    return acc;
  }
  try {
    const obj = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
    return obj.choices?.[0]?.message?.content ?? "";
  } catch {
    return raw;
  }
}

/** Tolerante: remove cercas ```json e isola o primeiro objeto {...}. */
export function parseStoryJson(content: string): GenerateOutput | null {
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
