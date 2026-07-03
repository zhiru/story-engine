/**
 * Registro de context providers (SDD 8.3 — extensibilidade).
 *
 * O montador de prompt resolve as variáveis declaradas em
 * `prompt_templates.variables` contra este registro (weather, local_time,
 * season, …). Variáveis sem provider mantêm os defaults hardcoded do
 * serviço — o template seedado continua funcionando sem mudanças.
 *
 * Adicionar fonte nova = registerContextProvider() + declarar a variável no
 * template; sem reescrita do pipeline.
 */

import type { WeatherContext } from "./context.js";

export interface ContextProviderArgs {
  userId: string;
  geo?: { lat: number; lng: number };
  weather: WeatherContext;
  now: Date;
}

export type ContextProvider = (args: ContextProviderArgs) => Promise<string>;

const registry = new Map<string, ContextProvider>();

export function registerContextProvider(
  name: string,
  provider: ContextProvider,
): void {
  registry.set(name, provider);
}

export function getContextProvider(name: string): ContextProvider | undefined {
  return registry.get(name);
}

/** Estação do ano (hemisfério sul, pt-BR) — simplificada por mês. */
export function seasonPtBr(date: Date): string {
  const month = date.getMonth() + 1;
  if (month === 12 || month <= 2) return "Verão";
  if (month <= 5) return "Outono";
  if (month <= 8) return "Inverno";
  return "Primavera";
}

// ── Providers padrão ──────────────────────────────────────────────────────────

registerContextProvider("weather", async ({ weather }) =>
  `${weather.condition}, ${weather.temp}°C`,
);
registerContextProvider("weather_condition", async ({ weather }) => weather.condition);
registerContextProvider("weather_temperature", async ({ weather }) =>
  String(weather.temp),
);
registerContextProvider("local_time", async ({ weather }) => weather.time);
registerContextProvider("current_time", async ({ weather }) => weather.time);
registerContextProvider("season", async ({ now }) => seasonPtBr(now));

/**
 * Resolve as variáveis declaradas no template ativo através do registro.
 * Retorna apenas as variáveis que possuem provider — as demais ficam a cargo
 * dos defaults do serviço de geração.
 */
export async function resolveContextVariables(
  declared: string[],
  args: ContextProviderArgs,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const name of declared) {
    const provider = registry.get(name);
    if (provider) {
      resolved[name] = await provider(args);
    }
  }
  return resolved;
}
