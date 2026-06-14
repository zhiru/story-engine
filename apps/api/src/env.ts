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
};
