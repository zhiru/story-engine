/**
 * Contexto de clima real via OpenWeatherMap (RF-22, SDD 8.3).
 *
 * - Consulta o endpoint de "current weather" por lat/lon usando fetch global.
 * - Cache em memória por célula geográfica (lat/lon arredondados a 0.1°),
 *   TTL de 30 min — contém custo de chamadas (SDD 8.3).
 * - Timeout de 3 s; sem chave / erro / timeout → o chamador cai no fallback
 *   determinístico de ai/context.ts (source: "fallback").
 * - Relógio e fetch injetáveis para testes.
 */

import { env } from "../env.js";

export interface WeatherResult {
  temp: number; // °C
  condition: string; // pt-BR (Ensolarado/Nublado/Chuvoso/Tempestade/Neve/Neblina)
  time: string; // pt-BR (Manhã/Tarde/Noite/Madrugada)
  source: "openweather";
}

export interface WeatherDeps {
  /** Relógio injetável (testes de TTL do cache). */
  now?: () => Date;
  /** fetch injetável (testes sem rede). */
  fetchImpl?: typeof fetch;
  apiKey?: string;
  baseUrl?: string;
}

const OWM_BASE_URL = "https://api.openweathermap.org/data/2.5";
const FETCH_TIMEOUT_MS = 3_000;
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

// ── Mapeamento condição OWM → pt-BR ──────────────────────────────────────────
// `weather[0].main` do OpenWeatherMap: https://openweathermap.org/weather-conditions
const CONDITION_MAP: Record<string, string> = {
  Clear: "Ensolarado",
  Clouds: "Nublado",
  Rain: "Chuvoso",
  Drizzle: "Chuvoso",
  Thunderstorm: "Tempestade",
  Squall: "Tempestade",
  Tornado: "Tempestade",
  Snow: "Neve",
  Mist: "Neblina",
  Fog: "Neblina",
  Haze: "Neblina",
  Smoke: "Neblina",
  Dust: "Neblina",
  Sand: "Neblina",
  Ash: "Neblina",
};

export function mapOwmCondition(main: string): string {
  return CONDITION_MAP[main] ?? "Nublado";
}

/** Período do dia em pt-BR a partir do horário local do servidor. */
export function timeOfDayPtBr(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Manhã";
  if (hour >= 12 && hour < 18) return "Tarde";
  if (hour >= 18) return "Noite";
  return "Madrugada"; // 0h–4h59
}

// ── Cache em memória por célula geográfica ───────────────────────────────────

interface CacheEntry {
  at: number; // epoch ms de quando foi buscado
  temp: number;
  condition: string;
}

const cache = new Map<string, CacheEntry>();

/** Chave da célula: lat/lon arredondados a 0.1°. */
export function geoCellKey(lat: number, lng: number): string {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

export function clearWeatherCache(): void {
  cache.clear();
}

// ── Consulta principal ────────────────────────────────────────────────────────

/**
 * Retorna o clima atual para a coordenada, ou null quando indisponível
 * (sem chave, erro de rede, timeout, resposta inválida) — o chamador deve
 * então usar o fallback determinístico.
 */
export async function getWeatherByGeo(
  geo: { lat: number; lng: number },
  deps: WeatherDeps = {},
): Promise<WeatherResult | null> {
  const apiKey = deps.apiKey ?? env.openWeatherApiKey;
  if (!apiKey) return null;

  const now = deps.now?.() ?? new Date();
  const key = geoCellKey(geo.lat, geo.lng);

  const cached = cache.get(key);
  if (cached && now.getTime() - cached.at < WEATHER_CACHE_TTL_MS) {
    return {
      temp: cached.temp,
      condition: cached.condition,
      time: timeOfDayPtBr(now),
      source: "openweather",
    };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.baseUrl ?? OWM_BASE_URL;
  const url =
    `${baseUrl}/weather?lat=${encodeURIComponent(geo.lat)}` +
    `&lon=${encodeURIComponent(geo.lng)}&units=metric&lang=pt_br` +
    `&appid=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      main?: { temp?: number };
      weather?: Array<{ main?: string }>;
    };
    const rawTemp = body.main?.temp;
    const rawMain = body.weather?.[0]?.main;
    if (typeof rawTemp !== "number" || typeof rawMain !== "string") return null;

    const temp = Math.round(rawTemp);
    const condition = mapOwmCondition(rawMain);

    cache.set(key, { at: now.getTime(), temp, condition });

    return { temp, condition, time: timeOfDayPtBr(now), source: "openweather" };
  } catch {
    // rede/timeout/JSON inválido → fallback do chamador
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
