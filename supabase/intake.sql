-- Run this in the Supabase SQL editor to create the benchmarking intake table.
--
-- The public form uses the anon key and may INSERT only. It cannot read any
-- submission back, which matters more here than it does for the waitlist:
-- these rows carry salaries.

create table if not exists public.intake_submissions (
  id                 uuid primary key default gen_random_uuid(),

  -- who is asking
  contact_name       text        not null,
  contact_email      text        not null,
  contact_job_title  text,

  -- Their organisation. Industry, size and location are NOT NULL because they are
  -- what define the comparator group: without them a "benchmark" is a national
  -- average wearing a peer comparison's clothes.
  organisation       text        not null,
  industry           text        not null,
  employee_count     text        not null,
  main_location      text        not null,

  -- what they sent. Roles are held as JSONB rather than a child table so the
  -- whole submission lands in ONE insert: the confirmation and notification
  -- emails fire from an INSERT webhook, and a two-table write would either
  -- email before the roles arrived or need a transaction the anon role cannot run.
  roles              jsonb       not null default '[]'::jsonb,
  role_count         integer     generated always as (jsonb_array_length(roles)) stored,
  -- One row per role, or one per person. Mirrors the template's two tabs; a person
  -- basis keeps the spread where people on the same job are paid differently.
  basis              text        not null default 'role' check (basis in ('role', 'person')),
  entry_mode         text        check (entry_mode in ('online', 'upload')),
  uploaded_filename  text,
  notes              text,

  created_at         timestamptz not null default now()
);

comment on column public.intake_submissions.roles is
  'Array of {ref, title, salary, level, family, comment}. Salary is a number or null; '
  'ref is an optional client-side employee reference, never a name. Level is free text: '
  'the client uses their own wording and we map it onto our four levels.';

-- A client may legitimately submit twice (a correction, or a second batch), so
-- there is deliberately NO unique index on email. Duplicates are a support
-- question, not a data error.
create index if not exists intake_submissions_created_idx
  on public.intake_submissions (created_at desc);
create index if not exists intake_submissions_email_idx
  on public.intake_submissions (lower(contact_email));

alter table public.intake_submissions enable row level security;

-- Anonymous inserts only. No select/update/delete policy means no public reads:
-- with RLS on and no SELECT policy, a read returns an empty array, not an error.
drop policy if exists "anon can submit intake" on public.intake_submissions;
create policy "anon can submit intake"
  on public.intake_submissions
  for insert
  to anon
  with check (true);

-- Guard rails. The form validates too, but the form is the thing an attacker
-- skips, and these are the constraints that keep junk out of the consultant's inbox.
alter table public.intake_submissions
  drop constraint if exists intake_email_shape;
alter table public.intake_submissions
  add constraint intake_email_shape
  check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

alter table public.intake_submissions
  drop constraint if exists intake_roles_is_array;
alter table public.intake_submissions
  add constraint intake_roles_is_array
  check (jsonb_typeof(roles) = 'array' and jsonb_array_length(roles) <= 500);
