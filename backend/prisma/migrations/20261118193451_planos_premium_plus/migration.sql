-- planos_premium_plus
-- Preços B2C do Premium Plus (mensal e anual), no mesmo formato dos do Premium: desativados e
-- com preço zero até o MASTER definir o valor no menu Planos. Só dados, idempotente.
-- Os do Premium vêm do seed; aqui garantimos também que existam (bancos novos, como o Supabase).
INSERT INTO "plans" ("id", "code", "name", "description", "audience", "interval", "price_cents", "currency", "trial_days", "is_active", "tier_id", "updated_at")
SELECT gen_random_uuid(), v.code, v.name, v.description, 'B2C'::"PlanAudience", v.interval::"BillingInterval", 0, 'BRL', 0, false, t."id", CURRENT_TIMESTAMP
FROM (VALUES
  ('b2c-premium-monthly', 'Premium Mensal', 'Para a vida + Para o trabalho, cobrança mensal.', 'MONTHLY', 'premium'),
  ('b2c-premium-yearly', 'Premium Anual', 'Para a vida + Para o trabalho, cobrança anual.', 'YEARLY', 'premium'),
  ('b2c-premium-plus-monthly', 'Premium Plus Mensal', 'Todas as galáxias, cobrança mensal.', 'MONTHLY', 'premium-plus'),
  ('b2c-premium-plus-yearly', 'Premium Plus Anual', 'Todas as galáxias, cobrança anual.', 'YEARLY', 'premium-plus')
) AS v(code, name, description, interval, tier)
JOIN "plan_tiers" t ON t."code" = v.tier
ON CONFLICT ("code") DO NOTHING;
