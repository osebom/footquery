-- Creates a dedicated read-only Postgres role for FootQuery.
--
-- Why this exists:
--   The app sends LLM-generated SQL to the database. Even with SELECT-only
--   validation in app code, we want the database itself to refuse anything
--   destructive. Connecting as this role guarantees that:
--     1. No INSERT/UPDATE/DELETE/DDL is possible (no grants for them).
--     2. Every transaction is read-only at the session level.
--     3. Long-running queries are killed after 10s.
--
-- Run this once in Supabase -> SQL Editor (as the project owner / postgres).

-- 1. Pick a strong password and replace 'CHANGE_ME' below.
--      openssl rand -base64 32

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'footquery_readonly') then
    create role footquery_readonly login password 'CHANGE_ME';
  end if;
end$$;

-- 2. Read-only access to public schema.
grant usage on schema public to footquery_readonly;
grant select on all tables in schema public to footquery_readonly;
grant select on all sequences in schema public to footquery_readonly;

-- Future tables added to public are also readable.
alter default privileges in schema public
  grant select on tables to footquery_readonly;

-- Supabase projects commonly enable Row Level Security. GRANT SELECT is not
-- enough when RLS is on; without a SELECT policy, Postgres will silently return
-- zero rows. This policy lets only footquery_readonly read all rows from public
-- tables while still preventing writes.
do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = table_record.schemaname
        and tablename = table_record.tablename
        and policyname = 'footquery_readonly_select'
    ) then
      execute format(
        'create policy footquery_readonly_select on %I.%I for select to footquery_readonly using (true)',
        table_record.schemaname,
        table_record.tablename
      );
    end if;
  end loop;
end$$;

-- 3. Database-enforced guarantees (these survive any app-level bypass).
alter role footquery_readonly set default_transaction_read_only = on;
alter role footquery_readonly set statement_timeout = '10s';
alter role footquery_readonly set idle_in_transaction_session_timeout = '15s';

-- 3a. Make pg_trgm's similarity()/word_similarity() visible to this role.
--     Supabase installs extensions into the 'extensions' schema by default.
grant usage on schema extensions to footquery_readonly;
alter role footquery_readonly set search_path = public, extensions;

-- 4. Use this role's connection string as DATABASE_URL in .env.local:
--      postgresql://footquery_readonly:<password>@<host>:5432/postgres
--    In Supabase: Settings -> Database -> Connection string -> URI,
--    then replace the username and password with the values above.

-- 5. (Optional) If you previously installed the run_sql RPC, drop it now;
--    the app no longer uses it.
--      drop function if exists public.run_sql(text);

-- 6. (Optional) If you previously created the chat_usage table for rate
--    limiting, drop it; the app now uses signed cookies instead.
--      drop table if exists public.chat_usage;
