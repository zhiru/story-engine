/**
 * Stub AI provider — generates deterministic kids' stories offline.
 * No API key required. Output varies by `seed` so repeated calls differ.
 *
 * Rules (from SDD §8):
 * - The PRINCIPAL character leads the resolution.
 * - Weather/time are woven in naturally.
 * - 4–6 paragraphs.
 * - If CONTINUOUS, ends with a hook for the next chapter.
 * - internal_summary = 3 factual lines.
 */

import type { AiProvider, GenerateInput, GenerateOutput } from "./provider.js";

// ── Deterministic pseudo-random helper ───────────────────────────────────────

function seedHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: string, salt: string): T {
  const idx = seedHash(seed + salt) % arr.length;
  return arr[idx]!;
}

// ── Story fragment banks ──────────────────────────────────────────────────────

const OPENINGS = [
  "Era uma vez",
  "Num dia muito especial",
  "Certa manhã ensolarada",
  "Numa tarde tranquila",
  "Há muito tempo, em um lugar encantado",
  "Em um dia como outro qualquer",
  "Quando o sol nasceu dourado",
  "Com o vento soprando suavemente",
];

const CONFLICTS = [
  "encontrou um grande desafio pela frente",
  "deparou-se com um problema inesperado",
  "percebeu que algo estava errado",
  "descobriu um mistério fascinante",
  "recebeu um pedido de ajuda urgente",
  "viu que precisava tomar uma decisão importante",
  "encontrou algo que nunca havia visto antes",
];

const RESOLUTIONS = [
  "usou sua coragem e criatividade para resolver tudo",
  "pensou muito e encontrou a solução perfeita",
  "reuniu todos os amigos e juntos superaram o obstáculo",
  "lembrou de uma lição importante e soube o que fazer",
  "agiu com gentileza e sabedoria",
  "descobriu que o amor e a amizade são as melhores ferramentas",
];

const LESSONS = [
  "Todos aprenderam que a amizade é o maior tesouro.",
  "Aquele dia ensinou que a bondade sempre abre caminhos.",
  "Ficou claro para todos que trabalhar juntos é sempre melhor.",
  "A aventura mostrou que a coragem mora no coração de cada um.",
  "Todos entenderam que ouvir o próximo faz toda a diferença.",
  "Aquela história ficou gravada para sempre na memória de todos.",
];

const HOOKS = [
  "Mas, enquanto voltavam para casa, uma luz estranha brilhou no horizonte... Será que a aventura ainda não havia terminado?",
  "De repente, um barulho misterioso ecoou ao longe. O que seria? Isso era apenas o começo de algo ainda maior.",
  "Quando tudo parecia resolvido, chegou uma mensagem inesperada. O próximo capítulo prometia ser ainda mais emocionante!",
  "No caminho de volta, algo chamou a atenção. Uma nova aventura estava prestes a começar...",
  "Mas havia algo que ninguém tinha percebido ainda. Uma surpresa esperava no próximo amanhecer.",
];

const WEATHER_INTEGRATIONS: Record<string, string[]> = {
  ensolarado: [
    "Com o sol brilhando no céu azul",
    "Aproveitando o dia ensolarado",
    "Sob a luz dourada do sol",
  ],
  nublado: [
    "Com o céu coberto de nuvens cinzas",
    "Apesar do tempo nublado",
    "Olhando para as nuvens que cobriam o céu",
  ],
  chuvoso: [
    "Com a chuva caindo lá fora",
    "Enquanto as gotas de chuva batiam na janela",
    "Mesmo com a chuva",
  ],
  ventoso: [
    "Com o vento brincando com os cabelos",
    "Sentindo a brisa forte",
    "Enquanto o vento cantava entre as árvores",
  ],
  "parcialmente nublado": [
    "Com nuvens e sol se revezando no céu",
    "Sob um céu com nuvens brancas",
    "Aproveitando as pausas do sol",
  ],
  "com arco-íris": [
    "Com um lindo arco-íris colorindo o céu",
    "Admirando as cores do arco-íris",
    "Inspirados pelas cores do arco-íris",
  ],
  "nevando levemente": [
    "Com flocos de neve caindo suavemente",
    "Brincando na neve que caía",
    "Admirando os flocos de neve",
  ],
  "com nevoeiro suave": [
    "Com um nevoeiro mágico ao redor",
    "Através do nevoeiro da manhã",
    "Enquanto a névoa cobria o caminho",
  ],
};

const TIME_PHRASES: Record<string, string[]> = {
  manhã: [
    "bem cedinho",
    "logo de manhã",
    "no começo do dia",
    "enquanto o dia ainda despertava",
  ],
  tarde: [
    "no meio da tarde",
    "enquanto o sol ia descendo",
    "na tarde dourada",
    "quando o dia estava a todo vapor",
  ],
  noite: [
    "quando as estrelas começaram a aparecer",
    "na hora de dormir",
    "enquanto a lua subia no céu",
    "no silêncio da noite",
  ],
};

// ── Main generator ────────────────────────────────────────────────────────────

function formatCharacters(
  chars: GenerateInput["characters"],
): { principal: string | null; others: string[] } {
  const principal = chars.find((c) => c.classification === "PRINCIPAL");
  const others = chars.filter((c) => c.classification !== "PRINCIPAL");
  return {
    principal: principal?.name ?? null,
    others: others.map((c) => c.name),
  };
}

function generateStory(input: GenerateInput): GenerateOutput {
  const { seed, weather, narrativeType, universe, theme, userGuidance } = input;
  const { principal, others } = formatCharacters(input.characters);

  const hero = principal ?? "a personagem principal";
  const companions = others.length > 0 ? others.join(" e ") : null;

  const opening = pick(OPENINGS, seed, "opening");
  const weatherIntegrations =
    WEATHER_INTEGRATIONS[weather.condition] ?? WEATHER_INTEGRATIONS["ensolarado"]!;
  const weatherPhrase = pick(weatherIntegrations, seed, "weather");
  const timePhrases =
    TIME_PHRASES[weather.currentTime] ?? TIME_PHRASES["manhã"]!;
  const timePhrase = pick(timePhrases, seed, "time");
  const conflict = pick(CONFLICTS, seed, "conflict");
  const resolution = pick(RESOLUTIONS, seed, "resolution");
  const lesson = pick(LESSONS, seed, "lesson");

  // Paragraph 1: Opening — set the scene
  const p1 = `${opening}, ${timePhrase}, ${weatherPhrase}, ${hero} estava explorando o universo de "${universe.title}". Tudo parecia calmo e tranquilo naquele lugar encantado.`;

  // Paragraph 2: Introduce companions and theme hint
  const companionsText = companions
    ? `${hero} não estava sozinho${hero.endsWith("a") ? "a" : ""} — ${companions} também estava${others.length > 1 ? "m" : ""} por perto, prontos para compartilhar mais uma aventura. `
    : "";
  const p2 = `${companionsText}O tema do dia era "${theme.title}"${theme.description ? `, que trata de ${theme.description.toLowerCase().slice(0, 80)}` : ""}. Ninguém imaginava o que estava por vir.`;

  // Paragraph 3: Conflict / challenge
  const guidanceNote =
    userGuidance && userGuidance.trim()
      ? ` Havia também um elemento especial: ${userGuidance.trim().slice(0, 100)}.`
      : "";
  const p3 = `De repente, ${hero} ${conflict}.${guidanceNote} Era preciso agir rápido e com inteligência!`;

  // Paragraph 4: PRINCIPAL leads resolution
  const traitsText =
    input.characters.find((c) => c.classification === "PRINCIPAL")?.traits
      .slice(0, 2)
      .join(" e ") ?? "determinação";
  const p4 = `Com toda a sua ${traitsText}, ${hero} não hesitou. ${hero.endsWith("a") ? "Ela" : "Ele"} ${resolution}. ${companions ? `${companions} apoiou do início ao fim.` : ""}`.trim();

  // Paragraph 5: Outcome / lesson
  const p5 = `No final, tudo se resolveu da melhor maneira possível. ${lesson}`;

  const hook =
    narrativeType === "CONTINUOUS" ? pick(HOOKS, seed, "hook") : null;

  const paragraphs = [p1, p2, p3, p4, p5];
  if (hook) paragraphs.push(hook);

  const story_body = paragraphs.join("\n\n");

  // Generate a varied title
  const titleTemplates = [
    `${hero} e o Grande Desafio`,
    `A Aventura de ${hero}`,
    `${hero} e o Segredo de ${universe.title}`,
    `A Incrível Jornada de ${hero}`,
    `${hero} e o Mistério do Dia ${weather.condition === "ensolarado" ? "Ensolarado" : "Encantado"}`,
    `${hero} Descobre o Poder da ${theme.title.split(" ")[0] ?? "Amizade"}`,
  ];
  const title = pick(titleTemplates, seed, "title");

  const internal_summary_for_next_chapters = [
    `${hero} enfrentou um desafio em "${universe.title}" relacionado ao tema "${theme.title}".`,
    `${companions ? `${companions} e ${hero}` : hero} resolveram o problema usando ${traitsText}.`,
    `A aventura terminou com sucesso${narrativeType === "CONTINUOUS" ? ", mas um novo mistério surgiu" : ""}.`,
  ].join(" ");

  return {
    title,
    story_body,
    internal_summary_for_next_chapters,
  };
}

export const stubProvider: AiProvider = {
  async generate(input: GenerateInput): Promise<GenerateOutput> {
    return generateStory(input);
  },
};
