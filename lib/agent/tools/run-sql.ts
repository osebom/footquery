import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { executeReadonlySql } from "@/lib/db/execute-sql";

const MAX_ROWS = 200;

const runSqlSchema = z.object({
  sql: z.string().describe("A single SELECT or WITH ... SELECT statement"),
});

export const runSqlTool = tool(
  async ({ sql }: z.infer<typeof runSqlSchema>) => {
    const result = await executeReadonlySql(sql);

    if ("error" in result) {
      return { error: result.error };
    }

    const rows = result.rows;
    const truncated = rows.length > MAX_ROWS;

    return {
      rows: rows.slice(0, MAX_ROWS),
      row_count: rows.length,
      truncated,
      ...(truncated && {
        message: `Results truncated to ${MAX_ROWS} rows. Refine your query if needed.`,
      }),
    };
  },
  {
    name: "run_sql",
    description:
      "Execute a read-only PostgreSQL SELECT query against the football database. Returns up to 200 rows as JSON.",
    schema: runSqlSchema,
  },
);
