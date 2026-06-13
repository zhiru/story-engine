import Constants from "expo-constants";
import { HealthResponseSchema, type HealthResponse } from "@storygen/shared";

const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://127.0.0.1:3000";

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${apiUrl}/health`);
  return HealthResponseSchema.parse(await res.json());
}
