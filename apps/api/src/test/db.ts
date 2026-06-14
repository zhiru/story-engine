import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

export async function resetDb() {
  // trunca todas as tabelas do schema public (rápido entre testes)
  await db.execute(sql`
    do $$ declare r record; begin
      for r in (select tablename from pg_tables where schemaname='public' and tablename <> '__drizzle_migrations')
      loop execute 'truncate table public.' || quote_ident(r.tablename) || ' cascade'; end loop;
    end $$;`);
}

type SeedUserInput = {
  email: string;
  role?: "USER" | "MODERATOR" | "ADMIN";
};

export async function seedUser(input: SeedUserInput) {
  const [row] = await db
    .insert(users)
    .values({
      name: input.email.split("@")[0] ?? input.email,
      email: input.email,
      passwordHash: "$argon2id$v=19$placeholder",
      role: input.role ?? "USER",
    })
    .returning();
  return row;
}
