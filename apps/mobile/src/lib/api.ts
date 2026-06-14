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
} from "@storygen/shared";

const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://127.0.0.1:3000";

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${apiUrl}/health`);
  return HealthResponseSchema.parse(await res.json());
}

async function post<T>(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
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
    headers: { Authorization: `Bearer ${accessToken}` },
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
