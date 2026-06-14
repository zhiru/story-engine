import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  char,
  unique,
} from "drizzle-orm/pg-core";

// ============ Núcleo de contas ============

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role")
    .$type<"USER" | "MODERATOR" | "ADMIN">()
    .notNull()
    .default("USER"),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Refresh tokens (rotação) — auth própria (ADR-08)
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const consentRecords = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  consentType: text("consent_type")
    .$type<"PARENTAL_DATA" | "TERMS" | "MARKETING">()
    .notNull(),
  policyVersion: text("policy_version").notNull(),
  granted: boolean("granted").notNull(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const childProfiles = pgTable("child_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  guardianId: uuid("guardian_id")
    .notNull()
    .references(() => users.id),
  nickname: text("nickname").notNull(),
  ageBand: text("age_band")
    .$type<"0_3" | "4_6" | "7_9" | "10_12">()
    .notNull(),
  preferences: jsonb("preferences").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ============ Billing ============

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  maxUniverses: integer("max_universes").notNull(),
  maxStoriesPerMonth: integer("max_stories_per_month").notNull(),
  priceCents: integer("price_cents").notNull(),
  revenuecatEntitlement: text("revenuecat_entitlement"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),
  status: text("status")
    .$type<"ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED">()
    .notNull(),
  store: text("store")
    .$type<"APP_STORE" | "PLAY_STORE" | "STRIPE">()
    .notNull(),
  externalId: text("external_id"),
  currentPeriodEnd: timestamp("current_period_end", {
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const usageRecords = pgTable("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  metric: text("metric")
    .$type<"STORY_GENERATED" | "UNIVERSE_CREATED">()
    .notNull(),
  period: char("period", { length: 7 }).notNull(), // 'YYYY-MM'
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============ Domínio criativo ============

export const universes = pgTable("universes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  locationContext: text("location_context"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  visibility: text("visibility")
    .$type<"PUBLIC" | "PRIVATE" | "PAID">()
    .notNull()
    .default("PRIVATE"),
  ratingScore: numeric("rating_score", { precision: 3, scale: 2 })
    .notNull()
    .default("0.00"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  universeId: uuid("universe_id")
    .notNull()
    .references(() => universes.id),
  name: text("name").notNull(),
  classification: text("classification")
    .$type<"PRINCIPAL" | "SECUNDARIO" | "ANTAGONISTA" | "MASCOTE">()
    .notNull(),
  ageGroup: text("age_group"),
  traits: text("traits").array().notNull().default([]),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const themes = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  universeId: uuid("universe_id")
    .notNull()
    .references(() => universes.id),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const storyArcs = pgTable("story_arcs", {
  id: uuid("id").primaryKey().defaultRandom(),
  universeId: uuid("universe_id")
    .notNull()
    .references(() => universes.id),
  title: text("title").notNull(),
  summary: text("summary"),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const stories = pgTable("stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  universeId: uuid("universe_id")
    .notNull()
    .references(() => universes.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  themeId: uuid("theme_id").references(() => themes.id),
  storyArcId: uuid("story_arc_id").references(() => storyArcs.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  promptTemplateId: uuid("prompt_template_id"),
  promptUsed: text("prompt_used").notNull(),
  userGuidance: text("user_guidance"),
  characterNames: text("character_names").array().notNull().default([]),
  moderationStatus: text("moderation_status")
    .$type<"PENDING" | "APPROVED" | "REJECTED">()
    .notNull()
    .default("PENDING"),
  visibility: text("visibility")
    .$type<"PUBLIC" | "PRIVATE" | "PAID">()
    .notNull()
    .default("PRIVATE"),
  metadataWeather: jsonb("metadata_weather"),
  generationCost: jsonb("generation_cost"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ============ IA configurável (RF-42/43) ============

export const aiProviders = pgTable("ai_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  params: jsonb("params").notNull().default({}),
  fallbackOrder: integer("fallback_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  aiProviderId: uuid("ai_provider_id")
    .notNull()
    .references(() => aiProviders.id),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  template: text("template").notNull(),
  variables: jsonb("variables").notNull().default([]),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ============ Comunidade e governança ============

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    universeId: uuid("universe_id")
      .notNull()
      .references(() => universes.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.universeId, t.userId)],
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id),
  targetType: text("target_type")
    .$type<"UNIVERSE" | "CHARACTER" | "STORY">()
    .notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status")
    .$type<"OPEN" | "REVIEWING" | "ACTIONED" | "DISMISSED">()
    .notNull()
    .default("OPEN"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============ White-label runtime (ADR-06) ============

export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  appSlug: text("app_slug").notNull().unique(),
  theme: jsonb("theme").notNull().default({}),
  featureFlags: jsonb("feature_flags").notNull().default({}),
  singleModeUniverseId: uuid("single_mode_universe_id").references(
    () => universes.id,
  ),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============ Fase 3 ============

export const collaborations = pgTable(
  "collaborations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originUniverseId: uuid("origin_universe_id")
      .notNull()
      .references(() => universes.id),
    targetUniverseId: uuid("target_universe_id")
      .notNull()
      .references(() => universes.id),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id),
    status: text("status")
      .$type<"PENDING" | "APPROVED" | "REJECTED">()
      .notNull()
      .default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.originUniverseId, t.targetUniverseId, t.characterId)],
);
