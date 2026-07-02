/**
 * WP-A Billing: webhook RevenueCat (máquina de estados de assinatura, SDD §12)
 * + GET /me/subscription + GET /me/usage.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  MeSubscriptionResponseSchema,
  MeUsageResponseSchema,
} from "@storygen/shared";
import { buildApp } from "../app.js";
import { resetDb, seedUser } from "../test/db.js";
import { signAccess } from "../auth/jwt.js";
import { db } from "../db/client.js";
import {
  plans,
  subscriptions,
  auditLogs,
  consentRecords,
  universes,
  characters,
  themes,
  aiProviders,
  promptTemplates,
  usageRecords,
} from "../db/schema.js";

const app = buildApp();

const WEBHOOK_TOKEN = "test-rc-webhook-token";
const ORIGINAL_TOKEN_ENV = process.env.REVENUECAT_WEBHOOK_TOKEN;

afterAll(async () => {
  if (ORIGINAL_TOKEN_ENV === undefined) {
    delete process.env.REVENUECAT_WEBHOOK_TOKEN;
  } else {
    process.env.REVENUECAT_WEBHOOK_TOKEN = ORIGINAL_TOKEN_ENV;
  }
  await app.close();
});

beforeEach(async () => {
  process.env.REVENUECAT_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
  await resetDb();
});

// ── Seed helpers (mesmo padrão de generate.test.ts) ───────────────────────────

async function seedPlan(
  options: { entitlement?: string | null; maxStories?: number } = {},
) {
  const [row] = await db
    .insert(plans)
    .values({
      name: "Premium Test",
      maxUniverses: 10,
      maxStoriesPerMonth: options.maxStories ?? 10,
      priceCents: 1990,
      revenuecatEntitlement: options.entitlement ?? "premium_monthly",
    })
    .returning();
  return row!;
}

async function seedSubscription(
  userId: string,
  planId: string,
  overrides: Partial<{
    status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
    currentPeriodEnd: Date;
  }> = {},
) {
  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  const [row] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId,
      status: overrides.status ?? "ACTIVE",
      store: "STRIPE",
      currentPeriodEnd: overrides.currentPeriodEnd ?? periodEnd,
    })
    .returning();
  return row!;
}

async function seedConsent(userId: string) {
  await db.insert(consentRecords).values({
    userId,
    consentType: "PARENTAL_DATA",
    policyVersion: "1.0",
    granted: true,
    ipAddress: "127.0.0.1",
  });
}

/** Ambiente completo para /stories/generate (provider stub), SEM assinatura. */
async function seedGenerateEnv(user: { id: string }) {
  await seedConsent(user.id);
  const [universe] = await db
    .insert(universes)
    .values({
      userId: user.id,
      title: "Mundo Billing",
      description: "Universo de teste de billing.",
      visibility: "PRIVATE",
    })
    .returning();
  await db.insert(characters).values({
    universeId: universe!.id,
    name: "Zara",
    classification: "PRINCIPAL",
    ageGroup: "4_6",
    traits: ["corajosa"],
  });
  await db.insert(themes).values({
    universeId: universe!.id,
    title: "Coragem",
    description: "Sobre ser corajoso.",
  });
  const [provider] = await db
    .insert(aiProviders)
    .values({
      provider: "stub",
      model: "stub-kids-v1",
      params: {},
      fallbackOrder: 0,
      isActive: true,
    })
    .returning();
  await db.insert(promptTemplates).values({
    aiProviderId: provider!.id,
    name: "test-template",
    version: 1,
    template:
      "Crie uma história com {{universe_title}}, personagens: {{characters}}, tema: {{theme_title}}, semente: {{seed}}.",
    variables: ["universe_title", "characters", "theme_title", "seed"],
    isActive: true,
    createdBy: user.id,
  });
  return universe!;
}

function bearerHeader(userId: string) {
  return { authorization: `Bearer ${signAccess({ sub: userId, role: "USER" })}` };
}

let eventSeq = 0;
function makeEvent(
  overrides: Partial<{
    id: string;
    type: string;
    app_user_id: string;
    product_id: string | null;
    entitlement_ids: string[] | null;
    store: string;
    expiration_at_ms: number | null;
    original_app_user_id: string;
  }> = {},
) {
  eventSeq += 1;
  return {
    api_version: "1.0",
    event: {
      id: overrides.id ?? `evt-${eventSeq}`,
      type: overrides.type ?? "INITIAL_PURCHASE",
      app_user_id: overrides.app_user_id ?? "00000000-0000-0000-0000-000000000000",
      product_id:
        overrides.product_id === undefined ? "premium_monthly" : overrides.product_id,
      entitlement_ids: overrides.entitlement_ids ?? null,
      store: overrides.store ?? "APP_STORE",
      expiration_at_ms:
        overrides.expiration_at_ms === undefined
          ? Date.now() + 30 * 24 * 60 * 60 * 1000
          : overrides.expiration_at_ms,
      original_app_user_id: overrides.original_app_user_id ?? "$RCAnonymousID:abc",
      // Campos extras que o RevenueCat envia (o schema deve aceitar)
      environment: "SANDBOX",
      period_type: "NORMAL",
    },
  };
}

async function postWebhook(payload: unknown, token: string | null = WEBHOOK_TOKEN) {
  return app.inject({
    method: "POST",
    url: "/api/v1/billing/webhook",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: payload as Record<string, unknown>,
  });
}

async function getSubscriptionRow(userId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return row ?? null;
}

async function getBillingAudits() {
  return db.select().from(auditLogs).where(eq(auditLogs.action, "BILLING_EVENT"));
}

// ── Auth de serviço ───────────────────────────────────────────────────────────

describe("POST /api/v1/billing/webhook — service auth", () => {
  it("returns 503 SERVICE_UNAVAILABLE when REVENUECAT_WEBHOOK_TOKEN is unset", async () => {
    delete process.env.REVENUECAT_WEBHOOK_TOKEN;
    const res = await postWebhook(makeEvent());
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 401 without Authorization header", async () => {
    const res = await postWebhook(makeEvent(), null);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with wrong token", async () => {
    const res = await postWebhook(makeEvent(), "wrong-token");
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR for malformed body", async () => {
    const res = await postWebhook({ event: { type: "RENEWAL" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});

// ── Máquina de estados ────────────────────────────────────────────────────────

describe("POST /api/v1/billing/webhook — subscription state machine", () => {
  it("INITIAL_PURCHASE creates an ACTIVE subscription and /stories/generate passes", async () => {
    const user = await seedUser({ email: "buyer@test.com" });
    const plan = await seedPlan({ entitlement: "premium_monthly" });
    const universe = await seedGenerateEnv(user);

    // Antes da compra: sem assinatura → 403 NO_ACTIVE_SUBSCRIPTION
    const before = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: { universe_id: universe.id },
    });
    expect(before.statusCode).toBe(403);
    expect(before.json().error.code).toBe("NO_ACTIVE_SUBSCRIPTION");

    const expiration = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const res = await postWebhook(
      makeEvent({
        type: "INITIAL_PURCHASE",
        app_user_id: user.id,
        expiration_at_ms: expiration,
        store: "APP_STORE",
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, status: "ACTIVE" });

    const sub = await getSubscriptionRow(user.id);
    expect(sub).toBeTruthy();
    expect(sub!.status).toBe("ACTIVE");
    expect(sub!.planId).toBe(plan.id);
    expect(sub!.store).toBe("APP_STORE");
    expect(sub!.currentPeriodEnd.getTime()).toBe(expiration);

    // Depois da compra: geração passa
    const after = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: { universe_id: universe.id },
    });
    expect(after.statusCode).toBe(201);
  });

  it.each(["RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"] as const)(
    "%s sets status ACTIVE and current_period_end = expiration_at_ms",
    async (type) => {
      const user = await seedUser({ email: `${type.toLowerCase()}@test.com` });
      const plan = await seedPlan();
      await seedSubscription(user.id, plan.id, {
        status: "PAST_DUE",
        currentPeriodEnd: new Date(Date.now() - 1000),
      });

      const expiration = Date.now() + 15 * 24 * 60 * 60 * 1000;
      const res = await postWebhook(
        makeEvent({ type, app_user_id: user.id, expiration_at_ms: expiration }),
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ACTIVE");

      const sub = await getSubscriptionRow(user.id);
      expect(sub!.status).toBe("ACTIVE");
      expect(sub!.currentPeriodEnd.getTime()).toBe(expiration);
    },
  );

  it("BILLING_ISSUE sets PAST_DUE and grace period extends access", async () => {
    const user = await seedUser({ email: "pastdue@test.com" });
    const plan = await seedPlan();
    await seedSubscription(user.id, plan.id);

    // Expirou ontem → carência (3 dias default) mantém o acesso
    const expiration = Date.now() - 1 * 24 * 60 * 60 * 1000;
    const res = await postWebhook(
      makeEvent({
        type: "BILLING_ISSUE",
        app_user_id: user.id,
        expiration_at_ms: expiration,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("PAST_DUE");

    const sub = await getSubscriptionRow(user.id);
    expect(sub!.status).toBe("PAST_DUE");
    // current_period_end += GRACE_PERIOD_DAYS (default 3)
    expect(sub!.currentPeriodEnd.getTime()).toBe(
      expiration + 3 * 24 * 60 * 60 * 1000,
    );
    expect(sub!.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());

    // Acesso residual visível em /me/subscription
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me/subscription",
      headers: bearerHeader(user.id),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().subscription.is_active).toBe(true);
  });

  it("CANCELLATION keeps current_period_end and is_active stays true until it passes", async () => {
    const user = await seedUser({ email: "cancel@test.com" });
    const plan = await seedPlan();
    const seeded = await seedSubscription(user.id, plan.id); // período +1 ano

    const res = await postWebhook(
      makeEvent({
        type: "CANCELLATION",
        app_user_id: user.id,
        // expiration diferente do período vigente — deve ser ignorado
        expiration_at_ms: Date.now() + 5 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CANCELED");

    const sub = await getSubscriptionRow(user.id);
    expect(sub!.status).toBe("CANCELED");
    expect(sub!.currentPeriodEnd.getTime()).toBe(
      seeded.currentPeriodEnd.getTime(),
    );

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me/subscription",
      headers: bearerHeader(user.id),
    });
    expect(me.json().subscription.is_active).toBe(true);
  });

  it("CANCELED subscription with past period end is not active", async () => {
    const user = await seedUser({ email: "cancel-past@test.com" });
    const plan = await seedPlan();
    await seedSubscription(user.id, plan.id, {
      currentPeriodEnd: new Date(Date.now() - 1000),
    });

    await postWebhook(makeEvent({ type: "CANCELLATION", app_user_id: user.id }));

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me/subscription",
      headers: bearerHeader(user.id),
    });
    expect(me.json().subscription.status).toBe("CANCELED");
    expect(me.json().subscription.is_active).toBe(false);
  });

  it("EXPIRATION sets EXPIRED and blocks /stories/generate with 403 NO_ACTIVE_SUBSCRIPTION", async () => {
    const user = await seedUser({ email: "expired@test.com" });
    await seedPlan();
    const universe = await seedGenerateEnv(user);
    // Assinatura ativa criada via webhook
    await postWebhook(
      makeEvent({ type: "INITIAL_PURCHASE", app_user_id: user.id }),
    );

    const res = await postWebhook(
      makeEvent({
        type: "EXPIRATION",
        app_user_id: user.id,
        expiration_at_ms: Date.now() - 1000,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("EXPIRED");

    const sub = await getSubscriptionRow(user.id);
    expect(sub!.status).toBe("EXPIRED");

    const gen = await app.inject({
      method: "POST",
      url: "/api/v1/stories/generate",
      headers: bearerHeader(user.id),
      payload: { universe_id: universe.id },
    });
    expect(gen.statusCode).toBe(403);
    expect(gen.json().error.code).toBe("NO_ACTIVE_SUBSCRIPTION");

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me/subscription",
      headers: bearerHeader(user.id),
    });
    expect(me.json().subscription.is_active).toBe(false);
  });

  it("unknown product keeps the subscription's current plan", async () => {
    const user = await seedUser({ email: "keep-plan@test.com" });
    const plan = await seedPlan({ entitlement: "premium_monthly" });
    await seedSubscription(user.id, plan.id);

    const res = await postWebhook(
      makeEvent({
        type: "RENEWAL",
        app_user_id: user.id,
        product_id: "produto_desconhecido",
      }),
    );
    expect(res.statusCode).toBe(200);

    const sub = await getSubscriptionRow(user.id);
    expect(sub!.planId).toBe(plan.id);
    expect(sub!.status).toBe("ACTIVE");
  });

  it("resolves plan via entitlement_ids when product_id does not match", async () => {
    const user = await seedUser({ email: "entitlement@test.com" });
    const planA = await seedPlan({ entitlement: "premium_monthly" });
    const [planB] = await db
      .insert(plans)
      .values({
        name: "Premium Anual",
        maxUniverses: 20,
        maxStoriesPerMonth: 100,
        priceCents: 19900,
        revenuecatEntitlement: "premium_yearly",
      })
      .returning();
    await seedSubscription(user.id, planA.id);

    const res = await postWebhook(
      makeEvent({
        type: "PRODUCT_CHANGE",
        app_user_id: user.id,
        product_id: "sku_da_loja_123",
        entitlement_ids: ["premium_yearly"],
      }),
    );
    expect(res.statusCode).toBe(200);

    const sub = await getSubscriptionRow(user.id);
    expect(sub!.planId).toBe(planB!.id);
  });

  it("unknown event type is ignored (200) and audited", async () => {
    const user = await seedUser({ email: "transfer@test.com" });
    const plan = await seedPlan();
    const seeded = await seedSubscription(user.id, plan.id);

    const res = await postWebhook(
      makeEvent({ id: "evt-unknown-type", type: "TRANSFER", app_user_id: user.id }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ignored: true });

    // Estado inalterado
    const sub = await getSubscriptionRow(user.id);
    expect(sub!.status).toBe(seeded.status);

    const audits = await getBillingAudits();
    const audit = audits.find(
      (a) => (a.metadata as { event_id?: string }).event_id === "evt-unknown-type",
    );
    expect(audit).toBeTruthy();
    expect((audit!.metadata as { type: string }).type).toBe("TRANSFER");
    expect(audit!.actorId).toBeNull();
  });

  it("unknown user is ignored (200) and audited, no subscription created", async () => {
    const res = await postWebhook(
      makeEvent({
        id: "evt-ghost-user",
        app_user_id: "11111111-1111-1111-1111-111111111111",
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ignored: true });

    const subs = await db.select().from(subscriptions);
    expect(subs.length).toBe(0);

    const audits = await getBillingAudits();
    const audit = audits.find(
      (a) => (a.metadata as { event_id?: string }).event_id === "evt-ghost-user",
    );
    expect(audit).toBeTruthy();
    expect((audit!.metadata as { reason: string }).reason).toBe("unknown_user");
  });

  it("non-UUID app_user_id is ignored (200) without error", async () => {
    const res = await postWebhook(
      makeEvent({ app_user_id: "$RCAnonymousID:xyz" }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ignored: true });
  });

  it("replay of the same event.id is idempotent (200 duplicate:true, state unchanged)", async () => {
    const user = await seedUser({ email: "idem@test.com" });
    await seedPlan();

    const evt = makeEvent({
      id: "evt-replay-1",
      type: "INITIAL_PURCHASE",
      app_user_id: user.id,
    });
    const first = await postWebhook(evt);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true, status: "ACTIVE" });

    // Replay: mesmo id, mesmo com type diferente não reprocessa
    const replay = await postWebhook({
      ...evt,
      event: { ...evt.event, type: "EXPIRATION" },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ duplicate: true });

    const sub = await getSubscriptionRow(user.id);
    expect(sub!.status).toBe("ACTIVE");

    // Só uma auditoria para o event_id
    const audits = await getBillingAudits();
    const matching = audits.filter(
      (a) => (a.metadata as { event_id?: string }).event_id === "evt-replay-1",
    );
    expect(matching.length).toBe(1);
  });

  it("audits every processed event with {event_id, type, user_id}", async () => {
    const user = await seedUser({ email: "audit@test.com" });
    await seedPlan();

    await postWebhook(
      makeEvent({ id: "evt-audit-1", type: "INITIAL_PURCHASE", app_user_id: user.id }),
    );

    const audits = await getBillingAudits();
    const audit = audits.find(
      (a) => (a.metadata as { event_id?: string }).event_id === "evt-audit-1",
    );
    expect(audit).toBeTruthy();
    expect(audit!.actorId).toBeNull();
    expect(audit!.metadata).toMatchObject({
      event_id: "evt-audit-1",
      type: "INITIAL_PURCHASE",
      user_id: user.id,
    });
  });
});

// ── /me/subscription e /me/usage ─────────────────────────────────────────────

describe("GET /api/v1/me/subscription", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me/subscription" });
    expect(res.statusCode).toBe(401);
  });

  it("returns { subscription: null } when user has no subscription", async () => {
    const user = await seedUser({ email: "nosub@test.com" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/subscription",
      headers: bearerHeader(user.id),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ subscription: null });
    expect(MeSubscriptionResponseSchema.parse(res.json())).toBeTruthy();
  });

  it("returns plan + status + store + current_period_end + is_active", async () => {
    const user = await seedUser({ email: "withsub@test.com" });
    const plan = await seedPlan();
    const seeded = await seedSubscription(user.id, plan.id);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/subscription",
      headers: bearerHeader(user.id),
    });
    expect(res.statusCode).toBe(200);
    const body = MeSubscriptionResponseSchema.parse(res.json());
    expect(body.subscription).toMatchObject({
      plan: {
        id: plan.id,
        name: plan.name,
        max_universes: plan.maxUniverses,
        max_stories_per_month: plan.maxStoriesPerMonth,
        price_cents: plan.priceCents,
      },
      status: "ACTIVE",
      store: "STRIPE",
      current_period_end: seeded.currentPeriodEnd.toISOString(),
      is_active: true,
    });
  });
});

describe("GET /api/v1/me/usage", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me/usage" });
    expect(res.statusCode).toBe(401);
  });

  it("returns current period counters and plan limits", async () => {
    const user = await seedUser({ email: "usage@test.com" });
    const plan = await seedPlan();
    await seedSubscription(user.id, plan.id);

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    await db.insert(usageRecords).values([
      { userId: user.id, metric: "STORY_GENERATED", period, quantity: 1 },
      { userId: user.id, metric: "STORY_GENERATED", period, quantity: 1 },
      { userId: user.id, metric: "UNIVERSE_CREATED", period, quantity: 1 },
      // Outro mês não conta
      { userId: user.id, metric: "STORY_GENERATED", period: "2020-01", quantity: 5 },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/usage",
      headers: bearerHeader(user.id),
    });
    expect(res.statusCode).toBe(200);
    const body = MeUsageResponseSchema.parse(res.json());
    expect(body).toEqual({
      period,
      stories_generated: 2,
      universes_created: 1,
      limits: {
        max_universes: plan.maxUniverses,
        max_stories_per_month: plan.maxStoriesPerMonth,
      },
    });
  });

  it("returns limits: null when user has no subscription", async () => {
    const user = await seedUser({ email: "usage-nosub@test.com" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/usage",
      headers: bearerHeader(user.id),
    });
    expect(res.statusCode).toBe(200);
    const body = MeUsageResponseSchema.parse(res.json());
    expect(body.limits).toBeNull();
    expect(body.stories_generated).toBe(0);
    expect(body.universes_created).toBe(0);
  });
});
