/**
 * Paginação por cursor (SDD §7): `?cursor=&limit=`, máx. 50, default 20.
 *
 * O cursor é base64url do JSON com as chaves da ordenação, ex.:
 *   ordenação por recência  → {"created_at":"…ISO…","id":"…uuid…"}
 *   ordenação por avaliação → {"rating_score":"4.50","id":"…uuid…"}
 *
 * Keyset (ordem decrescente com desempate por id):
 *   (col_primária, id) < (cursor.col_primária, cursor.id)
 * expresso como  col < v OR (col = v AND id < cursor.id)  — funciona para
 * qualquer coluna primária (timestamp, numeric, …) mantendo o tipo do driver.
 */
import { and, eq, lt, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { AppError } from "./errors.js";

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 50;

export type CursorPayload = Record<string, string>;

/** Tipo esperado de cada chave do cursor (evita 500 com cursor forjado). */
export type CursorKeyKind = "uuid" | "date" | "numeric";

const CURSOR_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function isValidCursorValue(value: string, kind: CursorKeyKind): boolean {
  switch (kind) {
    case "uuid":
      return CURSOR_UUID_RE.test(value);
    case "date":
      return !Number.isNaN(new Date(value).getTime());
    case "numeric":
      return CURSOR_NUMERIC_RE.test(value);
  }
}

/** Valida e normaliza `?limit=` (1..50, default 20). Inválido → 400. */
export function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") {
    return PAGINATION_DEFAULT_LIMIT;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > PAGINATION_MAX_LIMIT) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `limit must be an integer between 1 and ${PAGINATION_MAX_LIMIT}`,
    );
  }
  return n;
}

/** Serializa o payload do cursor em base64url. */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decodifica `?cursor=` e exige as chaves da ordenação corrente com o tipo
 * esperado (ex.: { created_at: "date", id: "uuid" }).
 * Ausente → null (primeira página). Malformado → 400 VALIDATION_ERROR.
 */
export function decodeCursor(
  raw: unknown,
  requiredKeys: Record<string, CursorKeyKind>,
): CursorPayload | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor");
  }
  const payload = parsed as Record<string, unknown>;
  for (const [key, kind] of Object.entries(requiredKeys)) {
    const value = payload[key];
    if (typeof value !== "string" || !isValidCursorValue(value, kind)) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor");
    }
  }
  return payload as CursorPayload;
}

/**
 * Condição keyset para ordenação decrescente com desempate por id:
 * (primary, id) < (primaryValue, idValue).
 * `primaryValue` deve estar no tipo esperado pela coluna (Date para
 * timestamp, string para numeric/uuid).
 */
export function keysetLt(
  primaryColumn: AnyPgColumn,
  idColumn: AnyPgColumn,
  primaryValue: unknown,
  idValue: string,
): SQL {
  const condition = or(
    lt(primaryColumn, primaryValue),
    and(eq(primaryColumn, primaryValue), lt(idColumn, idValue)),
  );
  /* istanbul ignore next -- or() só devolve undefined sem argumentos */
  if (!condition) throw new Error("keysetLt: empty condition");
  return condition;
}

/**
 * Recorta a página e monta o next_cursor. Busque `limit + 1` linhas e passe
 * todas aqui; se vier linha extra há próxima página e o cursor é derivado da
 * última linha devolvida via `toCursor`.
 */
export function paginateRows<T>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => CursorPayload,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(toCursor(last)) : null;
  return { items, nextCursor };
}
