# Backup, Restore e Retenção (RNF-09 / SDD 11.1)

> Todos os exemplos usam placeholders (`<...>`). Nunca commitar hostnames,
> usuários ou senhas reais neste repositório.

## Backups diários (serviço `backup` do `docker-compose.prod.yml`)

O sidecar `backup` (postgres:17-alpine) roda um loop de 24h:

- `pg_dump -Fc` (formato custom, comprimido) para o volume nomeado `prod_pgbackups`,
  arquivo `storygen_<YYYYMMDD_HHMMSS>.dump`;
- poda dumps com mais de `BACKUP_RETENTION_DAYS` dias (padrão **30**, mínimo do RNF-09);
- credenciais vêm do ambiente do host (`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`),
  com fallback dev `postgres/postgres/storygen` — em produção defina-as num
  `.env` do compose (fora do git) ou no ambiente do shell.

Listar backups existentes:

```sh
docker compose -f docker-compose.prod.yml exec backup ls -lh /backups
```

Recomendado: sincronizar o volume para armazenamento externo (off-site) via
cron do host, ex.: `rsync` do mountpoint do volume para outro disco/objeto.

## Restore (pg_restore)

1. Escolha o dump e copie-o para fora do volume (opcional):

   ```sh
   docker compose -f docker-compose.prod.yml cp backup:/backups/storygen_<ts>.dump ./
   ```

2. Pare a API para evitar escrita durante o restore:

   ```sh
   docker compose -f docker-compose.prod.yml stop api
   ```

3. Recrie o banco e restaure (dentro da rede do compose):

   ```sh
   docker compose -f docker-compose.prod.yml exec backup \
     sh -c 'dropdb --if-exists "$PGDATABASE"_restore && createdb "$PGDATABASE"_restore && \
            pg_restore -d "$PGDATABASE"_restore --no-owner /backups/storygen_<ts>.dump'
   ```

   Valide o conteúdo em `<db>_restore` e então troque os bancos (renomeie) ou
   restaure direto sobre o banco principal com `--clean --if-exists`:

   ```sh
   docker compose -f docker-compose.prod.yml exec backup \
     pg_restore -d "$PGDATABASE" --clean --if-exists --no-owner /backups/storygen_<ts>.dump
   ```

4. Suba a API novamente:

   ```sh
   docker compose -f docker-compose.prod.yml start api
   ```

**Teste de restore trimestral (RNF-09):** a cada trimestre, execute o passo 3
para um banco `_restore` e rode um smoke test (`SELECT count(*) FROM users;`,
login no admin). Registre a data do teste no runbook da operação.

## Job de retenção LGPD (mensal)

O job `pnpm --filter @storygen/api job:retention` faz a exclusão física de dados
soft-deletados há mais de `RETENTION_DAYS` dias (padrão 180) e registra
`RETENTION_PURGE` em `audit_logs` (SDD 11.1).

Opção mais leve (adotada): **cron do host** — sem serviço adicional no compose.
Linha de exemplo (dia 1 de cada mês, 04:00):

```cron
0 4 1 * * cd <repo-dir> && pnpm --filter @storygen/api job:retention >> /var/log/storygen-retention.log 2>&1
```

Observações:

- o job lê `DATABASE_URL` do `apps/api/.env` (ou do ambiente, que tem precedência);
- `RETENTION_DAYS` deve ser ≥ ao mínimo legal fiscal aplicável aos dados de billing;
- usuários referenciados por `prompt_templates.created_by` são pulados com aviso
  no log (reatribuir o template e rodar de novo).
