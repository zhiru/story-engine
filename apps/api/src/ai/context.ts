/**
 * Weather/time context for story generation.
 * Without an API key, falls back to a deterministic pseudo-random choice
 * derived from the user ID + current date so the same user gets a consistent
 * "weather" within a day but differs from other users / other days.
 */

export interface WeatherContext {
  temperature: number; // °C
  condition: string; // human-readable PT
  currentTime: string; // "manhã" | "tarde" | "noite"
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

function timeOfDay(): string {
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour < 12) return "manhã";
  if (hour >= 12 && hour < 18) return "tarde";
  return "noite";
}

/**
 * Returns weather context. If geo is provided (future real integration),
 * it would call an external API. Currently always uses the deterministic stub.
 */
export function getContext(
  userId: string,
  _geo?: { lat: number; lng: number },
): WeatherContext {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const seed = `${userId}-${dateStr}`;

  const condIdx = deterministicIndex(seed + "cond", CONDITIONS.length);
  const tempIdx = deterministicIndex(seed + "temp", TEMPERATURES.length);

  return {
    temperature: TEMPERATURES[tempIdx]!,
    condition: CONDITIONS[condIdx]!,
    currentTime: timeOfDay(),
  };
}
