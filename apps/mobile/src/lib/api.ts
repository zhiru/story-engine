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
  type UpdateCharacterInput,
  type UpdateThemeInput,
  type Character,
  type Theme,
  type MeResponse,
  type UpdateChildProfileInput,
  type MeSubscriptionResponse,
  type MeUsageResponse,
  type CreateReportInput,
  type CreateStoryArcInput,
  type DiscoveryItem,
  type Paginated,
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

async function patch<T>(
  path: string,
  body: unknown,
  accessToken: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-App-Slug": appSlug,
    Authorization: `Bearer ${accessToken}`,
  };
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    method: "PATCH",
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

async function put<T>(
  path: string,
  body: unknown,
  accessToken: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-App-Slug": appSlug,
    Authorization: `Bearer ${accessToken}`,
  };
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    method: "PUT",
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

async function del<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    method: "DELETE",
    headers: {
      "X-App-Slug": appSlug,
      Authorization: `Bearer ${accessToken}`,
    },
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
  // DELETE may return 204 No Content
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export async function getMe(accessToken: string): Promise<MeResponse> {
  return get<MeResponse>("/me", accessToken);
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
  // SDD 7.2: { temp, condition, time, source }
  metadata_weather: {
    temp: number;
    condition: string;
    time: string;
    source: "openweather" | "fallback";
  };
}

export async function generateStory(
  input: GenerateStoryInput,
  accessToken: string,
): Promise<GenerateStoryResult> {
  return post<GenerateStoryResult>("/stories/generate", input, accessToken);
}

// ── Characters ─────────────────────────────────────────────────────────────

export async function listCharacters(
  universeId: string,
  accessToken: string,
): Promise<Character[]> {
  return get<Character[]>(`/universes/${universeId}/characters`, accessToken);
}

export async function createCharacter(
  universeId: string,
  input: CreateCharacterInput,
  accessToken: string,
): Promise<Character> {
  return post<Character>(`/universes/${universeId}/characters`, input, accessToken);
}

export async function updateCharacter(
  universeId: string,
  characterId: string,
  input: UpdateCharacterInput,
  accessToken: string,
): Promise<Character> {
  return patch<Character>(`/universes/${universeId}/characters/${characterId}`, input, accessToken);
}

export async function deleteCharacter(
  universeId: string,
  characterId: string,
  accessToken: string,
): Promise<void> {
  await del<void>(`/universes/${universeId}/characters/${characterId}`, accessToken);
}

// ── Themes ─────────────────────────────────────────────────────────────────

export async function listThemes(
  universeId: string,
  accessToken: string,
): Promise<Theme[]> {
  return get<Theme[]>(`/universes/${universeId}/themes`, accessToken);
}

export async function createTheme(
  universeId: string,
  input: CreateThemeInput,
  accessToken: string,
): Promise<Theme> {
  return post<Theme>(`/universes/${universeId}/themes`, input, accessToken);
}

export async function updateTheme(
  universeId: string,
  themeId: string,
  input: UpdateThemeInput,
  accessToken: string,
): Promise<Theme> {
  return patch<Theme>(`/universes/${universeId}/themes/${themeId}`, input, accessToken);
}

export async function deleteTheme(
  universeId: string,
  themeId: string,
  accessToken: string,
): Promise<void> {
  await del<void>(`/universes/${universeId}/themes/${themeId}`, accessToken);
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

// ── Universes (leitura por id) ───────────────────────────────────────────────

export interface UniverseDetail {
  id: string;
  userId: string;
  title: string;
  description: string;
  visibility: "PUBLIC" | "PRIVATE" | "PAID";
  createdAt: string;
}

export async function getUniverse(
  universeId: string,
  accessToken: string,
): Promise<UniverseDetail> {
  return get<UniverseDetail>(`/universes/${universeId}`, accessToken);
}

// ── Child profiles (RF-03) ───────────────────────────────────────────────────
// Resposta é a linha do banco (drizzle, camelCase); entrada usa snake_case
// (ver apps/api/src/routes/childProfiles.ts).

export interface ChildProfile {
  id: string;
  guardianId: string;
  nickname: string;
  ageBand: "0_3" | "4_6" | "7_9" | "10_12";
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChildProfileInput {
  nickname: string;
  age_band: "0_3" | "4_6" | "7_9" | "10_12";
  preferences?: Record<string, unknown>;
}

export async function listChildProfiles(
  accessToken: string,
): Promise<ChildProfile[]> {
  return get<ChildProfile[]>("/child-profiles", accessToken);
}

export async function createChildProfile(
  input: CreateChildProfileInput,
  accessToken: string,
): Promise<ChildProfile> {
  return post<ChildProfile>("/child-profiles", input, accessToken);
}

export async function updateChildProfile(
  id: string,
  input: UpdateChildProfileInput,
  accessToken: string,
): Promise<ChildProfile> {
  return patch<ChildProfile>(`/child-profiles/${id}`, input, accessToken);
}

export async function deleteChildProfile(
  id: string,
  accessToken: string,
): Promise<void> {
  await del<{ ok: true }>(`/child-profiles/${id}`, accessToken);
}

// ── Assinatura e uso (RF-52) ─────────────────────────────────────────────────

export async function getMeSubscription(
  accessToken: string,
): Promise<MeSubscriptionResponse> {
  return get<MeSubscriptionResponse>("/me/subscription", accessToken);
}

export async function getMeUsage(
  accessToken: string,
): Promise<MeUsageResponse> {
  return get<MeUsageResponse>("/me/usage", accessToken);
}

// ── Denúncias (RF-44) ────────────────────────────────────────────────────────

export async function createReport(
  input: CreateReportInput,
  accessToken: string,
): Promise<void> {
  await post<unknown>("/reports", input, accessToken);
}

// ── Arcos narrativos (RF-13/RF-25) ───────────────────────────────────────────

export interface StoryArc {
  id: string;
  title: string;
  summary: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
}

export async function listArcs(
  universeId: string,
  accessToken: string,
): Promise<StoryArc[]> {
  return get<StoryArc[]>(`/universes/${universeId}/arcs`, accessToken);
}

export async function createArc(
  universeId: string,
  input: CreateStoryArcInput,
  accessToken: string,
): Promise<StoryArc> {
  return post<StoryArc>(`/universes/${universeId}/arcs`, input, accessToken);
}

// ── Descoberta e avaliações (RF-30/RF-31) ────────────────────────────────────

export type DiscoverySort = "recent" | "top";

export async function getDiscovery(
  params: { sort?: DiscoverySort; cursor?: string; limit?: number },
  accessToken: string,
): Promise<Paginated<DiscoveryItem>> {
  const search = new URLSearchParams();
  if (params.sort) search.set("sort", params.sort);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return get<Paginated<DiscoveryItem>>(
    `/discovery${qs ? `?${qs}` : ""}`,
    accessToken,
  );
}

export async function rateUniverse(
  universeId: string,
  score: number,
  accessToken: string,
): Promise<{ rating_score: number }> {
  return put<{ rating_score: number }>(
    `/universes/${universeId}/rating`,
    { score },
    accessToken,
  );
}
