import { z } from "zod";

export const RegisterInputSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export const LoginInputSchema = z.object({ email: z.string().email(), password: z.string() });
export const ConsentInputSchema = z.object({
  consent_type: z.enum(["PARENTAL_DATA", "TERMS", "MARKETING"]),
  policy_version: z.string().min(1),
  granted: z.boolean(),
});
export const AuthTokensSchema = z.object({ access_token: z.string(), refresh_token: z.string() });
export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type ConsentInput = z.infer<typeof ConsentInputSchema>;
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const GenerateStoryInputSchema = z.object({
  universe_id: z.string().uuid(),
  theme_id: z.string().uuid().nullish(),
  story_arc_id: z.string().uuid().nullish(),
  child_profile_id: z.string().uuid().nullish(),
  user_guidance: z.string().max(500).optional(), // SDD §8.2: teto de 500 chars
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

export type GenerateStoryInput = z.infer<typeof GenerateStoryInputSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.literal("up"),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ── Story reading ────────────────────────────────────────────────────────────
export const StoryListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type StoryListItem = z.infer<typeof StoryListItemSchema>;

export const StorySchema = z.object({
  id: z.string().uuid(),
  universeId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  moderationStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  createdAt: z.string().datetime({ offset: true }),
});
export type Story = z.infer<typeof StorySchema>;

// ── App config ───────────────────────────────────────────────────────────────
export const AppConfigSchema = z.object({
  appMode: z.literal("SINGLE"),
  singleModeUniverseId: z.string().uuid().nullable(),
  theme: z.record(z.string()),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

// ── Creative CRUD inputs ─────────────────────────────────────────────────────
export const CreateUniverseInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  visibility: z.enum(["PUBLIC", "PRIVATE", "PAID"]).optional(),
});
export type CreateUniverseInput = z.infer<typeof CreateUniverseInputSchema>;

export const CreateCharacterInputSchema = z.object({
  name: z.string().min(1).max(255),
  classification: z.enum(["PRINCIPAL", "SECUNDARIO", "ANTAGONISTA", "MASCOTE"]),
  ageGroup: z.string().optional(),
  traits: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
});
export type CreateCharacterInput = z.infer<typeof CreateCharacterInputSchema>;

export const CreateThemeInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});
export type CreateThemeInput = z.infer<typeof CreateThemeInputSchema>;

export const CreateStoryArcInputSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().max(2000).optional(),
});
export type CreateStoryArcInput = z.infer<typeof CreateStoryArcInputSchema>;
