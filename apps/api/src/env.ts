function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 3000),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  // IA (opcional): gateway compatível com OpenAI. Sem chave, o provedor real
  // falha e o pipeline cai no stub offline (ADR-04).
  aiBaseUrl: process.env.AI_BASE_URL ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "",
  // Rate limiting
  rateLimitDisabled: process.env.RATE_LIMIT_DISABLED === "true",
  rateLimitGlobalMax: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 120),
  rateLimitGlobalWindowMs: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS ?? 60000),
  rateLimitGenerateMax: Number(process.env.RATE_LIMIT_GENERATE_MAX ?? 10),
  rateLimitGenerateWindowMs: Number(process.env.RATE_LIMIT_GENERATE_WINDOW_MS ?? 60000),
  // LGPD
  lgpdHashSalt: process.env.LGPD_HASH_SALT ?? "storygen-dev-salt",
};
