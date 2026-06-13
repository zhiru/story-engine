-- pgTAP é dependência da suíte de testes de DB (roda via `supabase test db`).
create extension if not exists pgtap with schema extensions;
