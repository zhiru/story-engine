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
  appMode: z.enum(["SINGLE", "MULTI"]),
  singleModeUniverseId: z.string().uuid().nullable().optional(),
  theme: z.record(z.string()),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

// ── Universe list (MULTI mode) ────────────────────────────────────────────────
export const UniverseListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
});
export type UniverseListItem = z.infer<typeof UniverseListItemSchema>;

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

// ── Update DTOs ──────────────────────────────────────────────────────────────

export const UpdateCharacterInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  classification: z.enum(["PRINCIPAL", "SECUNDARIO", "ANTAGONISTA", "MASCOTE"]).optional(),
  ageGroup: z.string().optional(),
  traits: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
});
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterInputSchema>;

export const UpdateThemeInputSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
});
export type UpdateThemeInput = z.infer<typeof UpdateThemeInputSchema>;

// ── Response schemas ─────────────────────────────────────────────────────────

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  universeId: z.string().uuid(),
  name: z.string(),
  classification: z.enum(["PRINCIPAL", "SECUNDARIO", "ANTAGONISTA", "MASCOTE"]),
  ageGroup: z.string().nullable(),
  traits: z.array(z.string()),
  imageUrl: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const ThemeSchema = z.object({
  id: z.string().uuid(),
  universeId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const MeResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["USER", "MODERATOR", "ADMIN"]),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
