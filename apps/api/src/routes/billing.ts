/**
 * POST /api/v1/billing/webhook — webhook RevenueCat (RF-50/RF-51, SDD §7.1).
 *
 * Autenticação de serviço: Authorization deve ser exatamente
 * "Bearer " + REVENUECAT_WEBHOOK_TOKEN. Sem o env configurado → 503.
 *
 * Máquina de estados de assinatura (SDD §12) sobre a assinatura mais recente
 * (não deletada) do usuário:
 *   INITIAL_PURCHASE | RENEWAL | UNCANCELLATION | PRODUCT_CHANGE → ACTIVE
 *   BILLING_ISSUE → PAST_DUE (current_period_end += carência GRACE_PERIOD_DAYS)
 *   CANCELLATION  → CANCELED (mantém current_period_end — acesso até o fim)
 *   EXPIRATION    → EXPIRED
 *   Tipo desconhecido / usuário desconhecido → 200 {ignored:true} + auditoria
 *   (webhooks não devem ficar em retry eterno).
 *
 * Idempotência: cada evento processado gera audit_logs action='BILLING_EVENT'
 * com metadata.event_id; replay do mesmo event.id → 200 {duplicate:true}.
 */

import type { FastifyInstance } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { BillingWebhookEventSchema } from "@storygen/shared";
import { db } from "../db/client.js";
import { auditLogs, plans, subscriptions } from "../db/schema.js";
import { env } from "../env.js";
import { sendError } from "../http/errors.js";
import { getUserById } from "../repos/users.js";
import { getLatestSubscriptionWithPlan } from "../repos/subscriptions.js";
import { TRIAL_PLAN_ID } from "../db/seedConstants.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
type Store = "APP_STORE" | "PLAY_STORE" | "STRIPE";

/** Mapeia defensivamente a loja enviada pelo RevenueCat; default STRIPE. */
function mapStore(raw: string | null | undefined): Store {
  switch ((raw ?? "").toUpperCase()) {
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "APP_STORE";
    case "PLAY_STORE":
      return "PLAY_STORE";
    default:
      return "STRIPE";
  }
}

/** Eventos que resultam em assinatura ATIVA. */
const ACTIVATING_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
]);

const KNOWN_TYPES = new Set([
  ...ACTIVATING_TYPES,
  "BILLING_ISSUE",
  "CANCELLATION",
  "EXPIRATION",
]);

/** Já existe auditoria BILLING_EVENT para esse event.id? (idempotência) */
async function billingEventAlreadyProcessed(eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "BILLING_EVENT"),
        sql`${auditLogs.metadata}->>'event_id' = ${eventId}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Auditoria de evento de billing (ator NULL = sistema/RevenueCat). */
async function auditBillingEvent(metadata: Record<string, unknown>) {
  await db.insert(auditLogs).values({
    actorId: null,
    action: "BILLING_EVENT",
    metadata,
  });
}

/**
 * Resolve o plano pelo product_id (ou primeiro entitlement) contra
 * plans.revenuecat_entitlement. Desconhecido → null (mantém plano atual).
 */
async function resolvePlan(
  productId: string | null | undefined,
  entitlementIds: string[] | null | undefined,
) {
  const candidates = [productId, entitlementIds?.[0]].filter(
    (c): c is string => Boolean(c),
  );
  for (const candidate of candidates) {
    const [row] = await db
      .select()
      .from(plans)
      .where(
        and(eq(plans.revenuecatEntitlement, candidate), isNull(plans.deletedAt)),
      )
      .limit(1);
    if (row) return row;
  }
  return null;
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/billing/webhook", async (request, reply) => {
    // 1) Auth de serviço (token compartilhado do RevenueCat)
    const token = env.revenuecatWebhookToken;
    if (!token) {
      return sendError(
        reply,
        503,
        "SERVICE_UNAVAILABLE",
        "Webhook de billing não configurado.",
      );
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      return sendError(reply, 401, "UNAUTHORIZED", "Unauthorized");
    }

    // 2) Validação do corpo (schema permissivo — RevenueCat envia extras)
    const parsed = BillingWebhookEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Evento de webhook inválido.",
        parsed.error.flatten(),
      );
    }
    const event = parsed.data.event;

    // 3) Idempotência: replay do mesmo event.id não reprocessa
    if (await billingEventAlreadyProcessed(event.id)) {
      return reply.code(200).send({ duplicate: true });
    }

    // 4) Usuário: app_user_id = users.id (UUID). Desconhecido → ignora com
    //    auditoria (200 para o RevenueCat não re-tentar para sempre).
    const user = UUID_RE.test(event.app_user_id)
      ? await getUserById(event.app_user_id)
      : null;
    if (!user) {
      await auditBillingEvent({
        event_id: event.id,
        type: event.type,
        user_id: null,
        app_user_id: event.app_user_id,
        ignored: true,
        reason: "unknown_user",
      });
      return reply.code(200).send({ ignored: true });
    }

    // 5) Tipo desconhecido → ignora com auditoria
    const type = event.type.toUpperCase();
    if (!KNOWN_TYPES.has(type)) {
      await auditBillingEvent({
        event_id: event.id,
        type: event.type,
        user_id: user.id,
        ignored: true,
        reason: "unknown_event_type",
      });
      return reply.code(200).send({ ignored: true });
    }

    // 6) Máquina de estados sobre a assinatura mais recente do usuário
    const existing = await getLatestSubscriptionWithPlan(user.id);
    const resolvedPlan = await resolvePlan(
      event.product_id,
      event.entitlement_ids ?? null,
    );

    const now = new Date();
    const expiration =
      typeof event.expiration_at_ms === "number"
        ? new Date(event.expiration_at_ms)
        : null;

    let status: SubscriptionStatus;
    let periodEnd: Date;
    if (ACTIVATING_TYPES.has(type)) {
      status = "ACTIVE";
      // current_period_end = expiration_at_ms; fallback defensivo p/ eventos sem o campo
      periodEnd =
        expiration ??
        existing?.sub.currentPeriodEnd ??
        new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else if (type === "BILLING_ISSUE") {
      // RF-51: carência — estende o fim do período em GRACE_PERIOD_DAYS
      status = "PAST_DUE";
      const base = expiration ?? existing?.sub.currentPeriodEnd ?? now;
      periodEnd = new Date(
        base.getTime() + env.gracePeriodDays * 24 * 60 * 60 * 1000,
      );
    } else if (type === "CANCELLATION") {
      // Mantém current_period_end — acesso até o fim do período pago
      status = "CANCELED";
      periodEnd = existing?.sub.currentPeriodEnd ?? expiration ?? now;
    } else {
      // EXPIRATION
      status = "EXPIRED";
      periodEnd = expiration ?? existing?.sub.currentPeriodEnd ?? now;
    }

    const store = mapStore(event.store);
    const externalId = event.original_app_user_id ?? event.id;

    let subscriptionId: string;
    if (existing) {
      // Plano desconhecido → mantém o plano atual da assinatura
      await db
        .update(subscriptions)
        .set({
          planId: resolvedPlan?.id ?? existing.sub.planId,
          status,
          store,
          externalId,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existing.sub.id));
      subscriptionId = existing.sub.id;
    } else {
      // Sem assinatura anterior: plano resolvido ou o default seedado (TRIAL)
      let planId = resolvedPlan?.id ?? null;
      if (!planId) {
        const [trial] = await db
          .select({ id: plans.id })
          .from(plans)
          .where(and(eq(plans.id, TRIAL_PLAN_ID), isNull(plans.deletedAt)))
          .limit(1);
        planId = trial?.id ?? null;
      }
      if (!planId) {
        await auditBillingEvent({
          event_id: event.id,
          type: event.type,
          user_id: user.id,
          ignored: true,
          reason: "plan_unresolved",
        });
        return reply.code(200).send({ ignored: true });
      }
      const [created] = await db
        .insert(subscriptions)
        .values({
          userId: user.id,
          planId,
          status,
          store,
          externalId,
          currentPeriodEnd: periodEnd,
        })
        .returning({ id: subscriptions.id });
      subscriptionId = created!.id;
    }

    // 7) Auditoria do evento processado (base da idempotência)
    await auditBillingEvent({
      event_id: event.id,
      type: event.type,
      user_id: user.id,
      subscription_id: subscriptionId,
      status,
      plan_resolved: Boolean(resolvedPlan),
      ...(resolvedPlan ? { plan_id: resolvedPlan.id } : {}),
    });

    return reply.code(200).send({ ok: true, status });
  });
}
