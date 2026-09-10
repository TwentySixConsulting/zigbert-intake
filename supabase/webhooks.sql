-- Fire the two emails whenever a submission lands.
--
-- NOT the Database Webhooks UI. That writes supabase_functions.http_request
-- triggers, and supabase_functions only exists once someone has created a hook
-- through the dashboard at least once, which made setup a dashboard step before
-- the SQL would run at all. pg_net is the layer underneath it, and calling that
-- directly makes the whole setup one paste with nothing to click first.
--
-- Replace <ANON_KEY> with the project's anon key before running. It is the same
-- key the public site already ships, so no secret is being created here; the
-- edge function gateway simply requires a bearer token.

create extension if not exists pg_net;

create or replace function public.intake_fire_emails()
returns trigger
language plpgsql
-- security definer: the insert runs as anon, which has no rights over net.*.
-- Owned by postgres, so the outbound calls are made with the owner's rights.
security definer
set search_path = public, net, extensions
as $$
declare
  payload jsonb := jsonb_build_object('type', 'INSERT', 'table', 'intake_submissions',
                                      'record', to_jsonb(new));
  auth    jsonb := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer <ANON_KEY>');
begin
  -- pg_net queues these and a background worker sends them, so a slow or failing
  -- mail provider cannot block the client's submission or roll it back.
  perform net.http_post(
    url := 'https://taveeeeesxlgunibcoov.supabase.co/functions/v1/intake-confirmation',
    body := payload, headers := auth, timeout_milliseconds := 10000);
  perform net.http_post(
    url := 'https://taveeeeesxlgunibcoov.supabase.co/functions/v1/intake-notify',
    body := payload, headers := auth, timeout_milliseconds := 10000);
  return new;
exception when others then
  -- An email problem must never lose a submission. Log it and let the insert stand.
  raise warning 'intake email dispatch failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists intake_send_emails on public.intake_submissions;
create trigger intake_send_emails
  after insert on public.intake_submissions
  for each row execute function public.intake_fire_emails();
