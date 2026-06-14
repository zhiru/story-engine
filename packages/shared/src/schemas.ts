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
