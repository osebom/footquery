const DENYLIST =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|comment|copy|execute|call|do|merge|replace)\b/i;

const MULTI_STATEMENT = /;\s*\S/;

export type SqlValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateSql(sql: string): SqlValidationResult {
  const trimmed = sql.trim();

  if (!trimmed) {
    return { valid: false, reason: "SQL query is empty." };
  }

  if (MULTI_STATEMENT.test(trimmed)) {
    return {
      valid: false,
      reason: "Only a single SQL statement is allowed.",
    };
  }

  if (DENYLIST.test(trimmed)) {
    return {
      valid: false,
      reason: "Query contains disallowed keywords. Only SELECT is permitted.",
    };
  }

  const normalized = trimmed.replace(/^\s*--.*$/gm, "").trim();
  const startsWithSelect =
    /^select\b/i.test(normalized) || /^with\b/i.test(normalized);

  if (!startsWithSelect) {
    return {
      valid: false,
      reason: "Query must start with SELECT or WITH (read-only).",
    };
  }

  return { valid: true };
}
