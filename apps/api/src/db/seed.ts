/**
 * Seed SINGLE-mode data + TRIAL plan + MULTI app_settings (idempotent).
 * Uses fixed UUIDs so repeated runs hit onConflictDoNothing/onConflictDoUpdate.
 */
import { eq } from "drizzle-orm";
import { db } from "./client.js";
import {
  users,
  universes,
  characters,
  themes,
  stories,
  appSettings,
  plans,
  subscriptions,
  aiProviders,
  promptTemplates,
  consentRecords,
} from "./schema.js";
import { hashPassword } from "../auth/hash.js";
import { TRIAL_PLAN_ID } from "./seedConstants.js";

// ── Fixed UUIDs ─────────────────────────────────────────────────────────────
const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const UNIVERSE_ID = "00000000-0000-0000-0000-000000000010";
const CHARACTER_GIGI_ID = "00000000-0000-0000-0000-000000000020";
const CHARACTER_MASCOTE_ID = "00000000-0000-0000-0000-000000000021";
const THEME_ID = "00000000-0000-0000-0000-000000000030";
const STORY_ID = "00000000-0000-0000-0000-000000000040";
const APP_SETTINGS_ID = "00000000-0000-0000-0000-000000000050";
const MULTI_APP_SETTINGS_ID = "00000000-0000-0000-0000-000000000051";
const PLAN_ID = "00000000-0000-0000-0000-000000000060";
// TRIAL_PLAN_ID imported from seedConstants (shared with auth.ts)
const SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000070";
const AI_PROVIDER_ID = "00000000-0000-0000-0000-000000000080";
const OMNIROUTE_PROVIDER_ID = "00000000-0000-0000-0000-000000000081";
const PROMPT_TEMPLATE_ID = "00000000-0000-0000-0000-000000000090";

async function main() {
  console.log("🌱  Seeding SINGLE-mode data…");

  // ── Admin user ─────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword("admin123");
  await db
    .insert(users)
    .values({
      id: ADMIN_ID,
      name: "Admin",
      email: "admin@storygen.dev",
      passwordHash,
      role: "ADMIN",
    })
    .onConflictDoNothing();

  // ── Default plan (unlimited for admin) ────────────────────────────────────
  await db
    .insert(plans)
    .values({
      id: PLAN_ID,
      name: "Admin Plan",
      maxUniverses: 100,
      maxStoriesPerMonth: 1000,
      priceCents: 0,
    })
    .onConflictDoNothing();

  // ── TRIAL plan (auto-assigned on register) ─────────────────────────────────
  await db
    .insert(plans)
    .values({
      id: TRIAL_PLAN_ID,
      name: "Trial",
      maxUniverses: 5,
      maxStoriesPerMonth: 20,
      priceCents: 0,
    })
    .onConflictDoNothing();

  // ── Subscription (admin → admin plan) ─────────────────────────────────────
  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 10);
  await db
    .insert(subscriptions)
    .values({
      id: SUBSCRIPTION_ID,
      userId: ADMIN_ID,
      planId: PLAN_ID,
      status: "ACTIVE",
      store: "STRIPE",
      currentPeriodEnd: periodEnd,
    })
    .onConflictDoNothing();

  // ── Universe ───────────────────────────────────────────────────────────────
  await db
    .insert(universes)
    .values({
      id: UNIVERSE_ID,
      userId: ADMIN_ID,
      title: "Histórias da Gigi",
      description: "Um universo mágico com a Gigi e seus amigos.",
      visibility: "PUBLIC",
    })
    .onConflictDoNothing();

  // ── Characters ─────────────────────────────────────────────────────────────
  await db
    .insert(characters)
    .values({
      id: CHARACTER_GIGI_ID,
      universeId: UNIVERSE_ID,
      name: "Gigi",
      classification: "PRINCIPAL",
      ageGroup: "4_6",
      traits: ["corajosa", "curiosa", "gentil"],
    })
    .onConflictDoNothing();

  await db
    .insert(characters)
    .values({
      id: CHARACTER_MASCOTE_ID,
      universeId: UNIVERSE_ID,
      name: "Bolota",
      classification: "MASCOTE",
      ageGroup: "4_6",
      traits: ["brincalhão", "fiel"],
    })
    .onConflictDoNothing();

  // ── Theme ──────────────────────────────────────────────────────────────────
  await db
    .insert(themes)
    .values({
      id: THEME_ID,
      universeId: UNIVERSE_ID,
      title: "Amizade e Compartilhamento",
      description:
        "Histórias sobre aprender a dividir e valorizar os amigos.",
    })
    .onConflictDoNothing();

  // ── Story (APPROVED) ───────────────────────────────────────────────────────
  await db
    .insert(stories)
    .values({
      id: STORY_ID,
      universeId: UNIVERSE_ID,
      userId: ADMIN_ID,
      themeId: THEME_ID,
      title: "Gigi e o Bolo de Aniversário",
      content: `Era uma vez uma menina chamada Gigi que adorava fazer bolos.

Num dia especial, Gigi asou um bolo enorme de chocolate para o aniversário do seu melhor amigo, Bolota.

Mas quando o bolo ficou pronto, Gigi percebeu que havia apenas fatias para metade dos convidados. O que fazer?

— Não se preocupe! — disse Bolota, com um sorriso. — Podemos dividir cada fatia em duas. Assim, todo mundo come um pouco!

Gigi sorriu aliviada. Juntos, partiram cada pedaço cuidadosamente. No fim, todo mundo tinha um pedacinho de bolo e a festa ficou ainda mais gostosa.

Gigi aprendeu que compartilhar faz as coisas ficarem maiores por dentro — mesmo quando ficam menores por fora.`,
      promptUsed: "seed/manual",
      characterNames: ["Gigi", "Bolota"],
      moderationStatus: "APPROVED",
      visibility: "PUBLIC",
    })
    .onConflictDoNothing();

  // ── App settings (SINGLE — historias-da-gigi) ──────────────────────────────
  await db
    .insert(appSettings)
    .values({
      id: APP_SETTINGS_ID,
      appSlug: "historias-da-gigi",
      appMode: "SINGLE",
      singleModeUniverseId: UNIVERSE_ID,
      theme: {
        primary: "#7C3AED",
        secondary: "#DDD6FE",
        background: "#FAF5FF",
        text: "#1E1B4B",
      },
      featureFlags: {
        singleMode: true,
        aiGeneration: false,
      },
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        appMode: "SINGLE",
        singleModeUniverseId: UNIVERSE_ID,
        updatedAt: new Date(),
      },
    });

  // ── App settings (MULTI — meu-universo) ────────────────────────────────────
  await db
    .insert(appSettings)
    .values({
      id: MULTI_APP_SETTINGS_ID,
      appSlug: "meu-universo",
      appMode: "MULTI",
      singleModeUniverseId: null,
      theme: {
        primary: "#0F766E",
        secondary: "#CCFBF1",
        background: "#F0FDFA",
        text: "#134E4A",
      },
      featureFlags: {
        singleMode: false,
        aiGeneration: true,
      },
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        appMode: "MULTI",
        singleModeUniverseId: null,
        updatedAt: new Date(),
      },
    });

  // ── AI Providers ───────────────────────────────────────────────────────────
  // Primário: gateway compatível com OpenAI (OmniRoute -> Claude). A chave vem do
  // env (AI_API_KEY); sem ela, o pipeline cai no stub. Modelo configurável (ADR-04).
  await db
    .insert(aiProviders)
    .values({
      id: OMNIROUTE_PROVIDER_ID,
      provider: "omniroute",
      model: process.env.AI_MODEL || "claude/claude-sonnet-4-6",
      params: {},
      fallbackOrder: 0,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: aiProviders.id,
      set: {
        provider: "omniroute",
        model: process.env.AI_MODEL || "claude/claude-sonnet-4-6",
        fallbackOrder: 0,
        isActive: true,
      },
    });

  // Fallback offline determinístico (sempre disponível, sem rede).
  await db
    .insert(aiProviders)
    .values({
      id: AI_PROVIDER_ID,
      provider: "stub",
      model: "stub-kids-v1",
      params: {},
      fallbackOrder: 1,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: aiProviders.id,
      set: { fallbackOrder: 1, isActive: true },
    });

  // ── Prompt template ────────────────────────────────────────────────────────
  const PROMPT_TEMPLATE = `Você é um contador de histórias infantis em português brasileiro.
Crie uma história infantil educativa e segura para crianças com base nas informações abaixo.

UNIVERSO: {{universe_title}}
DESCRIÇÃO DO UNIVERSO: {{universe_description}}
PERSONAGENS: {{characters}}
TEMA: {{theme_title}}
DESCRIÇÃO DO TEMA: {{theme_description}}
TIPO DE NARRATIVA: {{narrative_type}}
CLIMA ATUAL: {{weather_condition}}, {{weather_temperature}}°C
HORÁRIO: {{current_time}}
{{#previous_summary}}RESUMO DO CAPÍTULO ANTERIOR: {{previous_summary}}{{/previous_summary}}
{{#user_guidance}}ORIENTAÇÃO ADICIONAL: {{user_guidance}}{{/user_guidance}}
SEMENTE DE VARIAÇÃO: {{seed}}

REGRAS OBRIGATÓRIAS DE SEGURANÇA:
- Conteúdo 100% seguro para crianças de 4 a 12 anos
- Sem violência, medo excessivo, conteúdo adulto ou linguagem inadequada
- Mensagem positiva e educativa
- O personagem PRINCIPAL deve liderar a resolução do problema
- Integre o clima e o horário de forma natural na narrativa
- 4 a 6 parágrafos bem desenvolvidos
- Se CONTINUOUS, termine com um gancho para o próximo capítulo

Responda EXATAMENTE neste formato JSON (sem markdown, sem texto fora do JSON):
{"title":"<título curto e criativo>","story_body":"<história completa com parágrafos separados por \\n\\n>","internal_summary_for_next_chapters":"<3 linhas factuais sobre o que aconteceu neste capítulo>"}`;

  await db
    .insert(promptTemplates)
    .values({
      id: PROMPT_TEMPLATE_ID,
      aiProviderId: AI_PROVIDER_ID,
      name: "kids-story-v1",
      version: 1,
      template: PROMPT_TEMPLATE,
      variables: [
        "universe_title",
        "universe_description",
        "characters",
        "theme_title",
        "theme_description",
        "narrative_type",
        "weather_condition",
        "weather_temperature",
        "current_time",
        "previous_summary",
        "user_guidance",
        "seed",
      ],
      isActive: true,
      createdBy: ADMIN_ID,
    })
    .onConflictDoNothing();

  // ── Admin consent (PARENTAL_DATA v1.0) ────────────────────────────────────
  // Check if consent already exists to stay idempotent
  const existingConsent = await db
    .select()
    .from(consentRecords)
    .where(
      eq(consentRecords.userId, ADMIN_ID),
    )
    .limit(1);

  if (existingConsent.length === 0) {
    await db.insert(consentRecords).values({
      userId: ADMIN_ID,
      consentType: "PARENTAL_DATA",
      policyVersion: "1.0",
      granted: true,
      ipAddress: "127.0.0.1",
    });
  }

  console.log("✅  Seed complete.");
  console.log(`   admin user      : ${ADMIN_ID}`);
  console.log(`   universe        : ${UNIVERSE_ID}`);
  console.log(`   story           : ${STORY_ID}`);
  console.log(`   ai_provider     : ${AI_PROVIDER_ID} (stub)`);
  console.log(`   prompt_template : ${PROMPT_TEMPLATE_ID}`);
  console.log(`   app_settings    : historias-da-gigi (SINGLE), meu-universo (MULTI)`);
  console.log(`   trial_plan      : ${TRIAL_PLAN_ID}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
