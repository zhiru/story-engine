import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env.js";

const migrationClient = postgres(env.databaseUrl, { max: 1 });
await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
await migrationClient.end();
console.log("migrations applied");
