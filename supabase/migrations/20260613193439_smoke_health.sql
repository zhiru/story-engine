-- Smoke: prova o pipeline migration + RLS. REMOVIDA por migration própria no WP1.
create table public.health (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'ok',
  created_at timestamptz not null default now()
);

alter table public.health enable row level security;

-- Exceção temporária do WP0: leitura pública. O WP1 dropa esta tabela+policy.
create policy "health readable by anon" on public.health
  for select using (true);
