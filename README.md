# FootQuery

Natural-language football analytics for the **Premier League 2024/25** season. Ask statistical questions in plain English and get data-backed answers from a structured Supabase database.

## How it works

```
User question → Cohere agent → resolve_entity → run_sql → Supabase → natural language answer
```

The agent acts as a football analyst: it resolves player/team names, writes PostgreSQL queries (preferring views), executes read-only SQL, and explains results.

## Prerequisites

- Node.js 20+
- [Cohere API key](https://dashboard.cohere.com/)
- Supabase project with PL 2024/25 data, views, and the `pg_trgm` extension enabled

## Setup

1. **Clone and install**

   ```bash
   npm install
   ```

2. **Create the read-only Postgres role**

   In **Supabase → SQL Editor**, run [`scripts/create-readonly-role.sql`](scripts/create-readonly-role.sql). Replace `'CHANGE_ME'` in the script with a password you generate locally (e.g. `openssl rand -base64 32`). This creates `footquery_readonly`, a role that physically cannot write to the database.

3. **Configure environment**

   Copy `.env.local.example` to `.env.local` and fill in:

   ```env
   COHERE_API_KEY=your_cohere_key
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   DATABASE_URL=postgresql://footquery_readonly:<password>@<host>:5432/postgres
   SESSION_SECRET=<generate with the command below>
   ```

   Generate a `SESSION_SECRET` (used to sign the anonymous quota cookie):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Run locally**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Example questions

- Has Harry Kane gone more than 10 games in a row without scoring?
- What is the longest scoring streak by a defender?
- Which team had the best away record against Manchester City?
- What was Chelsea's worst defeat of the season?
- What's the most goals Jackson scored in a single match?
- Which player scored the most match-winning goals?
- Which team had the best form after New Year's Day?

## Project structure

```
app/
  api/chat/route.ts    # Streaming agent endpoint (Cohere + tools, rate-limited)
  api/usage/route.ts   # GET current message quota for the caller
  page.tsx             # Chat UI
lib/
  agent/
    system-prompt.ts   # Analyst persona + scope guardrails
    schema-context.ts  # Database schema for the model
    tools/
      resolve-entity.ts
      run-sql.ts
  db/execute-sql.ts    # Direct Postgres client (read-only role)
  security/
    session.ts         # HMAC-signed cookie helpers
    rate-limit.ts      # Cookie-only anonymous message quota
  sql/validate.ts      # SELECT-only SQL guard (defense in depth)
  supabase/server.ts   # Supabase client (PostgREST reads only)
components/
  chat.tsx
  message.tsx
  tool-call-pill.tsx
scripts/
  create-readonly-role.sql
```

## Tools

| Tool | Purpose |
|------|---------|
| `resolve_entity` | Map nicknames (e.g. "Jackson", "Man U") to canonical player/team IDs via exact + pg_trgm fuzzy match |
| `run_sql` | Execute validated read-only `SELECT` queries via a direct Postgres connection as `footquery_readonly` |

## Data scope

The MVP only includes **Premier League 2024/25**. Questions about other seasons or competitions are answered with an explicit scope disclaimer.

## Security model

### SQL execution

The agent generates SQL and runs it against Postgres. Three independent guardrails:

1. **App-level validation** ([`lib/sql/validate.ts`](lib/sql/validate.ts)) — rejects anything that isn't a single `SELECT` / `WITH … SELECT` statement.
2. **Role-level grants + RLS policy** — the connection user (`footquery_readonly`) only has `SELECT` on the `public` schema, plus an explicit Supabase RLS policy that lets that role read rows. No `INSERT`, `UPDATE`, `DELETE`, or DDL grants exist, so Postgres refuses them even if validation is bypassed.
3. **Role-level session settings** — every connection runs with `default_transaction_read_only = on`, a 10-second `statement_timeout`, and a 15-second `idle_in_transaction_session_timeout`.

This deliberately avoids the older `SECURITY DEFINER` `run_sql` RPC pattern, which would have run user-supplied SQL with the database owner's privileges behind a regex blacklist.

### Anonymous rate limiting

There are no user accounts yet — anyone can chat. To keep Cohere spend bounded, each visitor gets **5 messages per rolling 24h** (configurable via `CHAT_MESSAGE_LIMIT`).

The quota lives in a signed, `httpOnly` cookie (`fq_quota`):

- **Signed with `SESSION_SECRET`** so the count can't be edited from devtools.
- **`httpOnly`** so JS on the page can't read or alter it.
- **No PII stored** — the cookie holds `{ count, windowStart }` and nothing else. No IPs, no fingerprints, no database row.

The cookie is the only line of defense against abuse, so clearing cookies or opening a private window resets the count. That's an intentional trade-off for a no-accounts prototype; if abuse becomes a real problem, the next step is a server-side store keyed by either an account or a hashed IP.

## Tech stack

- Next.js 16 (App Router)
- Cohere `command-a-03-2025` via Vercel AI SDK
- Supabase (PostgreSQL)
- Tailwind CSS

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
