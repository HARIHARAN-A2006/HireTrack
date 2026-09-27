-- Add durable records for operational actions. Safe to apply after migrations 0001 and 0002.

create or replace function public.log_auth_event(target_event text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in is required to log an account event.' using errcode = '42501';
  end if;
  if target_event not in ('login', 'logout') then
    raise exception 'Unsupported account event.' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'auth.' || target_event, 'profile', auth.uid(), '{}'::jsonb);
end;
$$;
revoke all on function public.log_auth_event(text) from public;
grant execute on function public.log_auth_event(text) to authenticated;

create or replace function public.record_job_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (coalesce(auth.uid(), new.created_by), 'job.created', 'job', new.id,
      jsonb_build_object('title', new.title, 'status', new.status));
  elsif old.status is distinct from new.status then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (coalesce(auth.uid(), new.created_by), 'job.status_changed', 'job', new.id,
      jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_audit_insert on public.jobs;
create trigger jobs_audit_insert after insert on public.jobs
  for each row execute procedure public.record_job_audit();
drop trigger if exists jobs_audit_status_update on public.jobs;
create trigger jobs_audit_status_update after update of status on public.jobs
  for each row execute procedure public.record_job_audit();

create or replace function public.record_interview_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (coalesce(auth.uid(), new.created_by), case when tg_op = 'INSERT' then 'interview.scheduled' else 'interview.updated' end,
    'interview', new.id, jsonb_build_object('application_id', new.application_id, 'title', new.title, 'status', new.status));
  return new;
end;
$$;
drop trigger if exists interview_rounds_audit on public.interview_rounds;
create trigger interview_rounds_audit after insert or update on public.interview_rounds
  for each row execute procedure public.record_interview_audit();

create or replace function public.record_message_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (new.sender_id, 'message.sent', 'application', new.application_id, '{}'::jsonb);
  return new;
end;
$$;
drop trigger if exists application_message_audit on public.application_messages;
create trigger application_message_audit after insert on public.application_messages
  for each row execute procedure public.record_message_audit();
