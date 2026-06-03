import "@/lib/server-guard";
import postgres from "postgres";
import { validateSql } from "@/lib/sql/validate";

let sqlClient: ReturnType<typeof postgres> | null = null;

const STATEMENT_TIMEOUT_MS = 10_000;

function getPostgresClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a read-only Postgres role using scripts/create-readonly-role.sql, then put that role's connection string in .env.local as DATABASE_URL.",
    );
  }
  if (!sqlClient) {
    sqlClient = postgres(url, {
      max: 3,
      idle_timeout: 20,
      connection: {
        application_name: "footquery",
        statement_timeout: STATEMENT_TIMEOUT_MS,
        default_transaction_read_only: true,
      },
    });
  }
  return sqlClient;
}

export async function executeReadonlySql(
  sql: string,
): Promise<{ rows: Record<string, unknown>[] } | { error: string }> {
  const validation = validateSql(sql);
  if (!validation.valid) {
    return { error: validation.reason };
  }

  let pg: ReturnType<typeof postgres>;
  try {
    pg = getPostgresClient();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const rows = await pg.unsafe(sql.trim());
    return { rows: rows as Record<string, unknown>[] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Query failed: ${message}` };
  }
}
