/**
 * Asserts de schema em CI (SDD §12: "migrations aplicadas a banco limpo +
 * asserts de schema a cada CI"). Roda dentro da suíte normal — o CI executa
 * db:migrate antes de test:api, então o banco deve conter os objetos da
 * migration 0002 (CHECKs, índices parciais e trigger set_updated_at).
 */
import { describe, it, expect } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db } from "./client.js";
import { users } from "./schema.js";

const EXPECTED_CHECKS = [
  "users_role_check",
  "consent_records_consent_type_check",
  "child_profiles_age_band_check",
  "subscriptions_status_check",
  "subscriptions_store_check",
  "usage_records_metric_check",
  "universes_visibility_check",
  "characters_classification_check",
  "stories_moderation_status_check",
  "stories_visibility_check",
  "ratings_score_check",
  "reports_target_type_check",
  "reports_status_check",
  "collaborations_status_check",
];

const EXPECTED_INDEXES = [
  "idx_refresh_user",
  "idx_usage_user_period",
  "idx_universes_owner",
  "idx_universes_public",
  "idx_characters_universe",
  "idx_themes_universe",
  "idx_stories_universe",
  "idx_stories_user",
  "idx_stories_arc",
  "idx_reports_open",
  "idx_notifications_unread",
  "idx_audit_action",
];

describe("schema asserts (migration 0002)", () => {
  it("has all CHECK constraints for closed domains (SDD 6.3)", async () => {
    const rows = await db.execute(sql`
      SELECT conname FROM pg_constraint
      WHERE contype = 'c'
        AND connamespace = 'public'::regnamespace
    `);
    const names = new Set(rows.map((r) => (r as { conname: string }).conname));
    for (const check of EXPECTED_CHECKS) {
      expect(names, `missing CHECK: ${check}`).toContain(check);
    }
  });

  it("has all 12 SDD indexes (with partial predicates)", async () => {
    const rows = await db.execute(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public'
    `);
    const byName = new Map(
      rows.map((r) => {
        const { indexname, indexdef } = r as { indexname: string; indexdef: string };
        return [indexname, indexdef] as const;
      }),
    );
    for (const idx of EXPECTED_INDEXES) {
      expect(byName.has(idx), `missing index: ${idx}`).toBe(true);
    }
    // Predicados parciais principais
    expect(byName.get("idx_refresh_user")).toContain("revoked_at IS NULL");
    expect(byName.get("idx_stories_user")).toContain("deleted_at IS NULL");
    expect(byName.get("idx_reports_open")).toContain("'OPEN'");
    expect(byName.get("idx_notifications_unread")).toContain("read_at IS NULL");
  });

  it("has the set_updated_at trigger on users", async () => {
    const rows = await db.execute(sql`
      SELECT t.tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'users' AND t.tgname = 'set_updated_at' AND NOT t.tgisinternal
    `);
    expect(rows.length).toBe(1);
  });

  it("bumps updated_at automatically on UPDATE", async () => {
    const staleDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // ontem
    const [row] = await db
      .insert(users)
      .values({
        name: "trigger-check",
        email: `trigger-check-${Date.now()}@test.com`,
        passwordHash: "$argon2id$v=19$placeholder",
        updatedAt: staleDate,
      })
      .returning({ id: users.id, updatedAt: users.updatedAt });

    // UPDATE sem tocar updated_at — o trigger deve avançá-lo para now()
    await db.update(users).set({ name: "trigger-checked" }).where(eq(users.id, row!.id));

    const [after] = await db
      .select({ updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, row!.id));

    expect(after!.updatedAt.getTime()).toBeGreaterThan(staleDate.getTime() + 60 * 60 * 1000);
  });
});
