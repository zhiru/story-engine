-- Integridade de dados (SDD 6.1/6.3), escrito à mão (drizzle-kit não gera CHECKs):
--  1. CHECK constraints para domínios fechados
--  2. Índices (parciais) do DDL de referência
--  3. Função/trigger set_updated_at em toda tabela com updated_at
-- Divergências aceitas: consent_records.ip_address permanece text (SDD: INET);
-- colunas varchar(n) do SDD permanecem text sem limite.

-- ============ 1. CHECK constraints (domínios fechados) ============
ALTER TABLE "users" ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('USER','MODERATOR','ADMIN'));
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_consent_type_check"
  CHECK ("consent_type" IN ('PARENTAL_DATA','TERMS','MARKETING'));
--> statement-breakpoint
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_age_band_check"
  CHECK ("age_band" IN ('0_3','4_6','7_9','10_12'));
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_status_check"
  CHECK ("status" IN ('ACTIVE','PAST_DUE','CANCELED','EXPIRED'));
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_check"
  CHECK ("store" IN ('APP_STORE','PLAY_STORE','STRIPE'));
--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_metric_check"
  CHECK ("metric" IN ('STORY_GENERATED','UNIVERSE_CREATED'));
--> statement-breakpoint
ALTER TABLE "universes" ADD CONSTRAINT "universes_visibility_check"
  CHECK ("visibility" IN ('PUBLIC','PRIVATE','PAID'));
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_classification_check"
  CHECK ("classification" IN ('PRINCIPAL','SECUNDARIO','ANTAGONISTA','MASCOTE'));
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_moderation_status_check"
  CHECK ("moderation_status" IN ('PENDING','APPROVED','REJECTED'));
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_visibility_check"
  CHECK ("visibility" IN ('PUBLIC','PRIVATE','PAID'));
--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_check"
  CHECK ("score" BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_type_check"
  CHECK ("target_type" IN ('UNIVERSE','CHARACTER','STORY'));
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check"
  CHECK ("status" IN ('OPEN','REVIEWING','ACTIONED','DISMISSED'));
--> statement-breakpoint
ALTER TABLE "collaborations" ADD CONSTRAINT "collaborations_status_check"
  CHECK ("status" IN ('PENDING','APPROVED','REJECTED'));
--> statement-breakpoint

-- ============ 2. Índices do DDL (SDD 6.3) — parciais cobrem deleted_at IS NULL ============
CREATE INDEX IF NOT EXISTS "idx_refresh_user" ON "refresh_tokens" ("user_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_user_period" ON "usage_records" ("user_id", "metric", "period");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_universes_owner" ON "universes" ("user_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_universes_public" ON "universes" ("visibility", "rating_score" DESC)
  WHERE "deleted_at" IS NULL AND "visibility" = 'PUBLIC';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_characters_universe" ON "characters" ("universe_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_themes_universe" ON "themes" ("universe_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stories_universe" ON "stories" ("universe_id", "created_at" DESC) WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stories_user" ON "stories" ("user_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stories_arc" ON "stories" ("story_arc_id", "created_at") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reports_open" ON "reports" ("status", "created_at") WHERE "status" = 'OPEN';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_unread" ON "notifications" ("user_id") WHERE "read_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_logs" ("action", "created_at" DESC);
--> statement-breakpoint

-- ============ 3. Trigger set_updated_at (SDD 6.1) ============
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "child_profiles" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "plans" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "subscriptions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "universes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "characters" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "themes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "story_arcs" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "stories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "ai_providers" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "prompt_templates" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "ratings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "reports" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "collaborations" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "app_settings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
