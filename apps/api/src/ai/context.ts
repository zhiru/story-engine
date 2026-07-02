/**
 * Contexto de clima/horário para geração (SDD 7.2 / 8.3).
 *
 * - Com geolocalização: consulta OpenWeatherMap (ai/weather.ts, cache 30 min
 *   por célula geográfica) → source: "openweather".
 * - Sem geolocalização / falha / sem chave: fallback determinístico por seed
 *   (user_id + data) — mesmo usuário tem clima consistente no dia, mas difere
 *   de outros usuários/dias → source: "fallback".
 */

import { getWeatherByGeo, timeOfDayPtBr } from "./weather.js";

/** Forma canônica do SDD 7.2: { temp, condition, time, source }. */
export interface WeatherContext {
  temp: number; // °C
  condition: string; // legível em pt-BR
  time: string; // Manhã | Tarde | Noite | Madrugada
  source: "openweather" | "fallback";
}

const CONDITIONS = [
  "ensolarado",
  "nublado",
  "chuvoso",
  "ventoso",
  "parcialmente nublado",
  "com arco-íris",
  "nevando levemente",
  "com nevoeiro suave",
];

const TEMPERATURES = [18, 20, 22, 24, 26, 28, 15, 12];

function deterministicIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

/** Fallback determinístico (seed user_id + data) — SDD 8.3. */
export function getFallbackContext(
  userId: string,
  now: Date = new Date(),
): WeatherContext {
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const seed = `${userId}-${dateStr}`;

  const condIdx = deterministicIndex(seed + "cond", CONDITIONS.length);
  const tempIdx = deterministicIndex(seed + "temp", TEMPERATURES.length);

  return {
    temp: TEMPERATURES[tempIdx]!,
    condition: CONDITIONS[condIdx]!,
    time: timeOfDayPtBr(now),
    source: "fallback",
  };
}

/**
 * Retorna o contexto de clima. Com geo, tenta o OpenWeatherMap; sem geo,
 * sem chave ou em erro/timeout, usa o fallback determinístico.
 */
export async function getContext(
  userId: string,
  geo?: { lat: number; lng: number },
): Promise<WeatherContext> {
  if (geo) {
    const real = await getWeatherByGeo(geo);
    if (real) return real;
  }
  return getFallbackContext(userId);
}
