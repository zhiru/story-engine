import Constants from "expo-constants";
import {
  HealthResponseSchema,
  type HealthResponse,
  type RegisterInput,
  type LoginInput,
  type ConsentInput,
  type AuthTokens,
  type AppConfig,
  type StoryListItem,
  type Story,
  type GenerateStoryInput,
  type UniverseListItem,
  type CreateUniverseInput,
  type CreateCharacterInput,
  type CreateThemeInput,
} from "@storygen/shared";

// EXPO_PUBLIC_* são inlinados pelo Expo no bundle em build-time (garantido),
// ao contrário de Constants.expoConfig.extra (que depende do app.config ver o env).
const apiUrl =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  "http://localhost:3000";
const appSlug =
  (process.env.EXPO_PUBLIC_APP_SLUG as string | undefined) ||
  (Constants.expoConfig?.extra?.appSlug as string) ||
  "historias-da-gigi";

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${apiUrl}/health`, {
    headers: { "X-App-Slug": appSlug },
  });
  return HealthResponseSchema.parse(await res.json());
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<T>(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-App-Slug": appSlug,
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json()) as
      | { error?: { code?: string; message?: string } | string }
      | undefined;
    if (payload && typeof payload.error === "object" && payload.error !== null) {
      throw new ApiError(
        payload.error.code ?? "UNKNOWN",
        payload.error.message ?? `HTTP ${res.status}`,
        res.status,
      );
    }
    const msg =
      payload && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    throw new ApiError("UNKNOWN", msg, res.status);
  }
  return res.json() as Promise<T>;
}

export async function register(input: RegisterInput): Promise<AuthTokens> {
  return post<AuthTokens>("/auth/register", input);
}

export async function login(input: LoginInput): Promise<AuthTokens> {
  return post<AuthTokens>("/auth/login", input);
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  return post<AuthTokens>("/auth/refresh", { refresh_token: refreshToken });
}

export async function recordConsent(
  input: ConsentInput,
  accessToken: string,
): Promise<void> {
  await post<{ message: string }>("/auth/consent", input, accessToken);
}

async function get<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-App-Slug": appSlug,
    },
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getConfig(accessToken: string): Promise<AppConfig> {
  return get<AppConfig>("/config", accessToken);
}

export async function listStories(
  universeId: string,
  accessToken: string,
): Promise<StoryListItem[]> {
  return get<StoryListItem[]>(`/universes/${universeId}/stories`, accessToken);
}

export async function getStory(id: string, accessToken: string): Promise<Story> {
  return get<Story>(`/stories/${id}`, accessToken);
}

export interface GenerateStoryResult {
  id: string;
  title: string;
  content: string;
  story_arc_id: string | null;
  metadata_weather: { condition: string; temperature: number; currentTime: string };
}

export async function generateStory(
  input: GenerateStoryInput,
  accessToken: string,
): Promise<GenerateStoryResult> {
  return post<GenerateStoryResult>("/stories/generate", input, accessToken);
}

// ── MULTI mode functions ──────────────────────────────────────────────────────

export async function listMyUniverses(accessToken: string): Promise<UniverseListItem[]> {
  return get<UniverseListItem[]>("/universes/mine", accessToken);
}

export interface CreateUniverseResult {
  id: string;
  title: string;
  description: string;
}

export async function createUniverse(
  input: CreateUniverseInput,
  accessToken: string,
): Promise<CreateUniverseResult> {
  return post<CreateUniverseResult>("/universes", input, accessToken);
}

export interface AddCharacterResult {
  id: string;
  name: string;
}

export async function addCharacter(
  universeId: string,
  input: CreateCharacterInput,
  accessToken: string,
): Promise<AddCharacterResult> {
  return post<AddCharacterResult>(`/universes/${universeId}/characters`, input, accessToken);
}

export interface AddThemeResult {
  id: string;
  title: string;
}

export async function addTheme(
  universeId: string,
  input: CreateThemeInput,
  accessToken: string,
): Promise<AddThemeResult> {
  return post<AddThemeResult>(`/universes/${universeId}/themes`, input, accessToken);
}
