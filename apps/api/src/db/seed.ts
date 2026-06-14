/**
 * Seed SINGLE-mode data (idempotent — safe to run multiple times).
 * Uses fixed UUIDs so repeated runs hit onConflictDoNothing.
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
} from "./schema.js";
import { hashPassword } from "../auth/hash.js";

// ── Fixed UUIDs ─────────────────────────────────────────────────────────────
const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const UNIVERSE_ID = "00000000-0000-0000-0000-000000000010";
const CHARACTER_GIGI_ID = "00000000-0000-0000-0000-000000000020";
const CHARACTER_MASCOTE_ID = "00000000-0000-0000-0000-000000000021";
const THEME_ID = "00000000-0000-0000-0000-000000000030";
const STORY_ID = "00000000-0000-0000-0000-000000000040";
const APP_SETTINGS_ID = "00000000-0000-0000-0000-000000000050";
const PLAN_ID = "00000000-0000-0000-0000-000000000060";
const SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000070";

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

  // ── App settings ───────────────────────────────────────────────────────────
  // Use upsert so theme changes are applied on re-seed
  const existingSettings = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.appSlug, "historias-da-gigi"))
    .limit(1);

  if (existingSettings.length === 0) {
    await db.insert(appSettings).values({
      id: APP_SETTINGS_ID,
      appSlug: "historias-da-gigi",
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
    });
  } else {
    await db
      .update(appSettings)
      .set({
        singleModeUniverseId: UNIVERSE_ID,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.appSlug, "historias-da-gigi"));
  }

  console.log("✅  Seed complete.");
  console.log(`   admin user  : ${ADMIN_ID}`);
  console.log(`   universe    : ${UNIVERSE_ID}`);
  console.log(`   story       : ${STORY_ID}`);
  console.log(`   app_settings: historias-da-gigi`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
