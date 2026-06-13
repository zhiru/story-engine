import { z } from "zod";

export const GenerateStoryInputSchema = z.object({
  universe_id: z.string().uuid(),
  theme_id: z.string().uuid().nullish(),
  story_arc_id: z.string().uuid().nullish(),
  child_profile_id: z.string().uuid().nullish(),
  user_guidance: z.string().max(500).optional(), // SDD §8.2: teto de 500 chars
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

export type GenerateStoryInput = z.infer<typeof GenerateStoryInputSchema>;
