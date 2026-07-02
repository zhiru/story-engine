-- Idempotência atômica dos webhooks de billing (RF-50/RF-51).
-- Índice único PARCIAL sobre o event_id do RevenueCat apenas nas linhas de
-- auditoria BILLING_EVENT: torna a inserção da auditoria uma trava de
-- claim-or-detect. Um replay concorrente do mesmo event.id viola a unique e a
-- transação do handler sofre rollback (nenhuma mutação de assinatura duplicada).
-- Escrito à mão (drizzle-kit não modela índices sobre expressão jsonb).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_billing_event"
  ON "audit_logs" ((metadata->>'event_id'))
  WHERE "action" = 'BILLING_EVENT';
