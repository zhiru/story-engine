/**
 * Testes do provedor de clima OpenWeatherMap (RF-22, SDD 8.3):
 * cache por célula geográfica (0.1°) com TTL de 30 min (relógio injetável),
 * mapeamento de condição → pt-BR e fallback em erro/timeout/sem chave.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getWeatherByGeo,
  clearWeatherCache,
  geoCellKey,
  mapOwmCondition,
  timeOfDayPtBr,
  WEATHER_CACHE_TTL_MS,
} from "./weather.js";
import { getContext, getFallbackContext } from "./context.js";

function owmResponse(temp: number, main: string): Response {
  return new Response(
    JSON.stringify({ main: { temp }, weather: [{ main }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function makeFetchStub(temp: number, main: string) {
  const calls: string[] = [];
  const fetchImpl = (async (url: unknown) => {
    calls.push(String(url));
    return owmResponse(temp, main);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

beforeEach(() => {
  clearWeatherCache();
});

describe("geoCellKey", () => {
  it("arredonda lat/lon para 0.1°", () => {
    expect(geoCellKey(-23.55052, -46.633308)).toBe("-23.6,-46.6");
    // pontos próximos caem na mesma célula
    expect(geoCellKey(-23.552, -46.639)).toBe(geoCellKey(-23.5504, -46.6401));
  });
});

describe("mapOwmCondition", () => {
  it("mapeia condições OWM para pt-BR", () => {
    expect(mapOwmCondition("Clear")).toBe("Ensolarado");
    expect(mapOwmCondition("Clouds")).toBe("Nublado");
    expect(mapOwmCondition("Rain")).toBe("Chuvoso");
    expect(mapOwmCondition("Drizzle")).toBe("Chuvoso");
    expect(mapOwmCondition("Thunderstorm")).toBe("Tempestade");
    expect(mapOwmCondition("Snow")).toBe("Neve");
    expect(mapOwmCondition("Mist")).toBe("Neblina");
    expect(mapOwmCondition("Fog")).toBe("Neblina");
    expect(mapOwmCondition("Desconhecido")).toBe("Nublado");
  });
});

describe("timeOfDayPtBr", () => {
  it("classifica períodos do dia em pt-BR", () => {
    const at = (h: number) => {
      const d = new Date();
      d.setHours(h, 0, 0, 0);
      return d;
    };
    expect(timeOfDayPtBr(at(8))).toBe("Manhã");
    expect(timeOfDayPtBr(at(14))).toBe("Tarde");
    expect(timeOfDayPtBr(at(20))).toBe("Noite");
    expect(timeOfDayPtBr(at(3))).toBe("Madrugada");
  });
});

describe("getWeatherByGeo", () => {
  const GEO = { lat: -23.55052, lng: -46.633308 };

  it("retorna null sem API key (fallback do chamador)", async () => {
    const { fetchImpl, calls } = makeFetchStub(22.4, "Rain");
    const result = await getWeatherByGeo(GEO, { apiKey: "", fetchImpl });
    expect(result).toBeNull();
    expect(calls.length).toBe(0);
  });

  it("consulta OWM e retorna forma SDD 7.2 com source openweather", async () => {
    const { fetchImpl } = makeFetchStub(22.4, "Rain");
    const result = await getWeatherByGeo(GEO, { apiKey: "test-key", fetchImpl });
    expect(result).toEqual({
      temp: 22,
      condition: "Chuvoso",
      time: timeOfDayPtBr(new Date()),
      source: "openweather",
    });
  });

  it("usa cache por célula dentro do TTL (30 min) e refaz após expirar", async () => {
    const { fetchImpl, calls } = makeFetchStub(25, "Clear");
    const t0 = new Date("2026-07-02T15:00:00");
    const clock = { current: t0 };
    const deps = {
      apiKey: "test-key",
      fetchImpl,
      now: () => clock.current,
    };

    await getWeatherByGeo(GEO, deps);
    expect(calls.length).toBe(1);

    // Mesma célula (coordenada levemente diferente), 10 min depois → cache
    clock.current = new Date(t0.getTime() + 10 * 60 * 1000);
    const cached = await getWeatherByGeo({ lat: -23.552, lng: -46.639 }, deps);
    expect(calls.length).toBe(1);
    expect(cached?.condition).toBe("Ensolarado");
    expect(cached?.source).toBe("openweather");

    // Após o TTL → nova consulta
    clock.current = new Date(t0.getTime() + WEATHER_CACHE_TTL_MS + 1000);
    await getWeatherByGeo(GEO, deps);
    expect(calls.length).toBe(2);
  });

  it("célula diferente não compartilha cache", async () => {
    const { fetchImpl, calls } = makeFetchStub(25, "Clear");
    const deps = { apiKey: "test-key", fetchImpl };
    await getWeatherByGeo(GEO, deps);
    await getWeatherByGeo({ lat: -22.9, lng: -43.2 }, deps);
    expect(calls.length).toBe(2);
  });

  it("erro de rede → null (fallback do chamador)", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await getWeatherByGeo(GEO, { apiKey: "test-key", fetchImpl });
    expect(result).toBeNull();
  });

  it("resposta não-2xx → null", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 500 })) as typeof fetch;
    const result = await getWeatherByGeo(GEO, { apiKey: "test-key", fetchImpl });
    expect(result).toBeNull();
  });

  it("payload inválido → null", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
      })) as typeof fetch;
    const result = await getWeatherByGeo(GEO, { apiKey: "test-key", fetchImpl });
    expect(result).toBeNull();
  });
});

describe("getContext / getFallbackContext", () => {
  it("fallback determinístico tem source fallback e forma SDD 7.2", () => {
    const ctx = getFallbackContext("user-1");
    expect(ctx.source).toBe("fallback");
    expect(typeof ctx.temp).toBe("number");
    expect(typeof ctx.condition).toBe("string");
    expect(["Manhã", "Tarde", "Noite", "Madrugada"]).toContain(ctx.time);
  });

  it("fallback é estável para o mesmo usuário no mesmo dia e varia entre usuários", () => {
    const a1 = getFallbackContext("user-a");
    const a2 = getFallbackContext("user-a");
    expect(a1.condition).toBe(a2.condition);
    expect(a1.temp).toBe(a2.temp);
    // usuários diferentes → seeds diferentes (condição OU temp costumam variar)
    const b = getFallbackContext("user-b");
    expect(b.condition !== a1.condition || b.temp !== a1.temp).toBe(true);
  });

  it("sem geo, getContext usa o fallback", async () => {
    const ctx = await getContext("user-1");
    expect(ctx.source).toBe("fallback");
  });

  it("com geo mas sem OPENWEATHER_API_KEY, getContext cai no fallback", async () => {
    if (process.env.OPENWEATHER_API_KEY) return; // ambiente com chave real: pular
    const ctx = await getContext("user-1", { lat: -23.5, lng: -46.6 });
    expect(ctx.source).toBe("fallback");
  });
});
