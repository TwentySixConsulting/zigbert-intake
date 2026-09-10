-- Fire the two emails whenever a submission lands.
--
-- Supabase's Database Webhooks UI writes triggers exactly like these. Doing it in
-- SQL means the whole setup is one paste instead of six form fields typed twice.
--
--@PLACEHOLDER-NOTE Replace <ANON_KEY> below with the project's anon key before running.
--@PLACEHOLDER-NOTE It is the same key the public site already ships, so this is not a
--@PLACEHOLDER-NOTE secret being created; the gateway simply requires a bearer token.

-- supabase_functions only exists once Database Webhooks have been switched on for
-- the project. Fail with a sentence that says what to do, rather than "schema does
-- not exist".
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'supabase_functions') then
    raise exception 'Database Webhooks are not enabled on this project yet. Open '
      'Database > Webhooks in the dashboard once (creating and deleting any hook is '
      'enough to set it up), then run this file again.';
  end if;
end $$;

drop trigger if exists intake_send_confirmation on public.intake_submissions;
create trigger intake_send_confirmation
  after insert on public.intake_submissions
  for each row execute function supabase_functions.http_request(
    'https://taveeeeesxlgunibcoov.supabase.co/functions/v1/intake-confirmation',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}',
    '{}',
    '5000'
  );

drop trigger if exists intake_notify_consultant on public.intake_submissions;
create trigger intake_notify_consultant
  after insert on public.intake_submissions
  for each row execute function supabase_functions.http_request(
    'https://taveeeeesxlgunibcoov.supabase.co/functions/v1/intake-notify',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}',
    '{}',
    '5000'
  );
