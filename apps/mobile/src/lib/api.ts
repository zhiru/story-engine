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
  type CreatePlanInput,
  type UpdatePlanInput,
  type UpdateUserInput,
  type CreatePromptTemplateInput,
  type UpdatePromptTemplateInput,
  type UpdateAiProviderInput,
  type UpdateReportInput,
  type UpdateAppSettingsInput,
  type CostSummary,
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

/** Slug do app atual (mesmo valor enviado no header X-App-Slug). */
export const currentAppSlug = appSlug;

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

async function del<T>(
  path: string,
  accessToken: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "X-App-Slug": appSlug,
    Authorization: `Bearer ${accessToken}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    method: "DELETE",
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

// ═════════════════════════════════════════════════════════════════════════════
// ── Admin back-office (RF-40..RF-46 + auditoria + LGPD) ─────────────────────
// Listagens admin usam limit/offset (não cursor). As respostas são as linhas
// do banco serializadas em JSON — timestamps chegam como strings ISO.
// ═════════════════════════════════════════════════════════════════════════════

function adminQuery(
  params: Record<string, string | number | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return (
    "?" +
    entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&")
  );
}

// ── Admin: Plans (RF-40) ─────────────────────────────────────────────────────

export interface AdminPlan {
  id: string;
  name: string;
  maxUniverses: number;
  maxStoriesPerMonth: number;
  priceCents: number;
  revenuecatEntitlement: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function listAdminPlans(accessToken: string): Promise<AdminPlan[]> {
  return get<AdminPlan[]>("/admin/plans", accessToken);
}

export async function createAdminPlan(
  input: CreatePlanInput,
  accessToken: string,
): Promise<AdminPlan> {
  return post<AdminPlan>("/admin/plans", input, accessToken);
}

export async function updateAdminPlan(
  planId: string,
  input: UpdatePlanInput,
  accessToken: string,
): Promise<AdminPlan> {
  return patch<AdminPlan>(`/admin/plans/${planId}`, input, accessToken);
}

export async function deleteAdminPlan(
  planId: string,
  accessToken: string,
): Promise<void> {
  await del<{ ok: boolean }>(`/admin/plans/${planId}`, accessToken);
}

// ── Admin: Users (RF-41) ─────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  suspendedUntil: string | null;
  createdAt: string;
}

export async function listAdminUsers(
  params: { q?: string; limit?: number; offset?: number },
  accessToken: string,
): Promise<AdminUserRow[]> {
  return get<AdminUserRow[]>(`/admin/users${adminQuery(params)}`, accessToken);
}

export async function updateAdminUser(
  userId: string,
  input: UpdateUserInput,
  accessToken: string,
): Promise<AdminUserRow> {
  return patch<AdminUserRow>(`/admin/users/${userId}`, input, accessToken);
}

// ── Admin: Prompt templates (RF-42) ──────────────────────────────────────────

export interface AdminPromptTemplate {
  id: string;
  aiProviderId: string;
  name: string;
  version: number;
  template: string;
  variables: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function listAdminPromptTemplates(
  accessToken: string,
): Promise<AdminPromptTemplate[]> {
  return get<AdminPromptTemplate[]>("/admin/prompt-templates", accessToken);
}

export async function createAdminPromptTemplate(
  input: CreatePromptTemplateInput,
  accessToken: string,
): Promise<AdminPromptTemplate> {
  return post<AdminPromptTemplate>("/admin/prompt-templates", input, accessToken);
}

export async function updateAdminPromptTemplate(
  templateId: string,
  input: UpdatePromptTemplateInput,
  accessToken: string,
): Promise<AdminPromptTemplate> {
  return patch<AdminPromptTemplate>(
    `/admin/prompt-templates/${templateId}`,
    input,
    accessToken,
  );
}

// ── Admin: AI providers (RF-43) ──────────────────────────────────────────────

export interface AdminAiProvider {
  id: string;
  provider: string;
  model: string;
  params: Record<string, unknown>;
  fallbackOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function listAdminAiProviders(
  accessToken: string,
): Promise<AdminAiProvider[]> {
  return get<AdminAiProvider[]>("/admin/ai-providers", accessToken);
}

export async function updateAdminAiProvider(
  providerId: string,
  input: UpdateAiProviderInput,
  accessToken: string,
): Promise<AdminAiProvider> {
  return patch<AdminAiProvider>(
    `/admin/ai-providers/${providerId}`,
    input,
    accessToken,
  );
}

// ── Admin: Reports / moderação (RF-44 — ADMIN + MODERATOR) ──────────────────

export type ReportStatus = "OPEN" | "REVIEWING" | "ACTIONED" | "DISMISSED";

export interface AdminReport {
  id: string;
  reporterId: string;
  targetType: "UNIVERSE" | "CHARACTER" | "STORY";
  targetId: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listAdminReports(
  params: { status?: ReportStatus; limit?: number; offset?: number },
  accessToken: string,
): Promise<AdminReport[]> {
  return get<AdminReport[]>(`/admin/reports${adminQuery(params)}`, accessToken);
}

export async function updateAdminReport(
  reportId: string,
  input: UpdateReportInput,
  accessToken: string,
): Promise<AdminReport> {
  return patch<AdminReport>(`/admin/reports/${reportId}`, input, accessToken);
}

// ── Admin: App settings (RF-46) ──────────────────────────────────────────────

export interface AdminAppSettings {
  id: string;
  appSlug: string;
  appMode: "SINGLE" | "MULTI";
  theme: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
  singleModeUniverseId: string | null;
  updatedAt: string;
}

export async function listAdminAppSettings(
  accessToken: string,
): Promise<AdminAppSettings[]> {
  return get<AdminAppSettings[]>("/admin/app-settings", accessToken);
}

export async function updateAdminAppSettings(
  slug: string,
  input: UpdateAppSettingsInput,
  accessToken: string,
): Promise<AdminAppSettings> {
  return patch<AdminAppSettings>(
    `/admin/app-settings/${encodeURIComponent(slug)}`,
    input,
    accessToken,
  );
}

// ── Admin: Audit log ─────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listAdminAuditLogs(
  params: { action?: string; limit?: number; offset?: number },
  accessToken: string,
): Promise<AuditLogEntry[]> {
  return get<AuditLogEntry[]>(`/admin/audit${adminQuery(params)}`, accessToken);
}

// ── Admin: Cost summary ──────────────────────────────────────────────────────

export async function getAdminCostSummary(
  accessToken: string,
): Promise<CostSummary> {
  return get<CostSummary>("/admin/cost", accessToken);
}

// ── LGPD: apagar/anonimizar usuário (RF-45 — self ou ADMIN) ──────────────────

export interface EraseUserCounts {
  childProfiles: number;
  refreshTokens: number;
  characters: number;
  stories: number;
  universes?: number;
  themes?: number;
  storyArcs?: number;
  privateStoriesDeleted?: number;
}

export interface EraseUserResult {
  ok: true;
  anonymized: EraseUserCounts;
}

export async function eraseUser(
  userId: string,
  options: { delete_private_stories: boolean },
  accessToken: string,
): Promise<EraseUserResult> {
  return del<EraseUserResult>(`/users/${userId}`, accessToken, options);
}
