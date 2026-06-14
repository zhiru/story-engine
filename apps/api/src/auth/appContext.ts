/**
 * App context resolution: determines the app slug and mode from the request.
 *
 * Priority: x-app-slug header → DEFAULT_APP_SLUG env → "historias-da-gigi"
 * Mode: read from app_settings by slug; unknown slug → "SINGLE"
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { getAppSettingsBySlug } from "../repos/appSettings.js";

export type AppMode = "SINGLE" | "MULTI";

// Augment Fastify request to carry resolved slug and mode
declare module "fastify" {
  interface FastifyRequest {
    appSlug: string;
    appMode: AppMode;
    singleModeUniverseId: string | null;
  }
}

export function resolveAppSlug(request: FastifyRequest): string {
  const header = request.headers["x-app-slug"];
  if (header && typeof header === "string" && header.trim()) {
    return header.trim().toLowerCase();
  }
  return process.env["DEFAULT_APP_SLUG"] ?? "historias-da-gigi";
}

export async function getMode(slug: string): Promise<AppMode> {
  const settings = await getAppSettingsBySlug(slug);
  if (!settings) return "SINGLE";
  return settings.appMode as AppMode;
}

/**
 * Prehandler: resolves and attaches appSlug + appMode + singleModeUniverseId
 * to the request. Runs before route handlers. Non-fatal — routes still work
 * if app_settings is missing (defaults to SINGLE, no single universe).
 */
export async function resolveAppContext(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const slug = resolveAppSlug(request);
  const settings = await getAppSettingsBySlug(slug);
  request.appSlug = slug;
  request.appMode = (settings?.appMode as AppMode) ?? "SINGLE";
  request.singleModeUniverseId = settings?.singleModeUniverseId ?? null;
}
