-- AgentIQ durable production history (Supabase Postgres)
-- Run this in Supabase SQL Editor before setting Vercel environment variables.
create table if not exists public.agentiq_run_summaries (
  repository text not null,
  run_id text not null,
  stored_at timestamptz not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (repository, run_id)
);

create index if not exists agentiq_run_summaries_repository_stored_at_idx
  on public.agentiq_run_summaries (repository, stored_at desc);

create table if not exists public.agentiq_run_details (
  repository text not null,
  run_id text not null,
  stored_at timestamptz not null,
  detail jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (repository, run_id)
);

create index if not exists agentiq_run_details_repository_stored_at_idx
  on public.agentiq_run_details (repository, stored_at desc);

-- API access is server-only via the Supabase service-role key, never a browser key.
alter table public.agentiq_run_summaries enable row level security;
alter table public.agentiq_run_details enable row level security;

-- No anon/authenticated policies are intentionally created. Server-side service-role
-- access bypasses RLS; keep SUPABASE_SERVICE_ROLE_KEY out of client bundles.
