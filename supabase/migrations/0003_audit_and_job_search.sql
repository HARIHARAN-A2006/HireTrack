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

drop policy if exists "Users can view their own audit events" on public.audit_logs;
drop policy if exists "Officers and event actors view audit records" on public.audit_logs;
create policy "Officers and event actors view audit records" on public.audit_logs for select to authenticated
  using (actor_id = auth.uid() or public.current_app_role() = 'officer');

-- Company records are administered by placement officers. Recruiters can still
-- read company names, but cannot create, change, or delete organization records.
drop policy if exists "Officers manage companies" on public.companies;
drop policy if exists "Placement officers manage companies" on public.companies;
create policy "Placement officers manage companies" on public.companies for all to authenticated
  using (public.current_app_role() = 'officer')
  with check (public.current_app_role() = 'officer');

-- Keep interview ownership and round linkage immutable through browser access.
drop policy if exists "Assigned staff manage interview rounds" on public.interview_rounds;
drop policy if exists "Staff insert interview rounds" on public.interview_rounds;
create policy "Staff insert interview rounds" on public.interview_rounds for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.applications a join public.jobs j on j.id = a.job_id
      where a.id = application_id and (public.current_app_role() = 'officer'
        or (public.current_app_role() = 'recruiter' and public.is_company_member(j.company_id)))
    )
  );
drop policy if exists "Assigned staff update interview rounds" on public.interview_rounds;
create policy "Assigned staff update interview rounds" on public.interview_rounds for update to authenticated
  using (exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
    where a.id = application_id and (public.current_app_role() = 'officer'
      or (public.current_app_role() = 'recruiter' and public.is_company_member(j.company_id)))
  ))
  with check (exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
    where a.id = application_id and (public.current_app_role() = 'officer'
      or (public.current_app_role() = 'recruiter' and public.is_company_member(j.company_id)))
  ));
revoke update, delete on public.interview_rounds from authenticated;
grant update (title, scheduled_at, meeting_url, candidate_feedback, status, updated_at) on public.interview_rounds to authenticated;

-- Notes can be authored only as the current signed-in user. The browser cannot
-- delete notes or change their linked interview on an existing note.
drop policy if exists "Assigned staff manage private interview notes" on public.interview_notes;
drop policy if exists "Assigned staff insert private interview notes" on public.interview_notes;
create policy "Assigned staff insert private interview notes" on public.interview_notes for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.interview_rounds r join public.applications a on a.id = r.application_id
      join public.jobs j on j.id = a.job_id
      where r.id = interview_id and (public.current_app_role() = 'officer'
        or (public.current_app_role() = 'recruiter' and public.is_company_member(j.company_id)))
    )
  );
drop policy if exists "Assigned staff update private interview notes" on public.interview_notes;
create policy "Assigned staff update private interview notes" on public.interview_notes for update to authenticated
  using (exists (
    select 1 from public.interview_rounds r join public.applications a on a.id = r.application_id
    join public.jobs j on j.id = a.job_id
    where r.id = interview_id and (public.current_app_role() = 'officer'
      or (public.current_app_role() = 'recruiter' and public.is_company_member(j.company_id)))
  ))
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.interview_rounds r join public.applications a on a.id = r.application_id
      join public.jobs j on j.id = a.job_id
      where r.id = interview_id and (public.current_app_role() = 'officer'
        or (public.current_app_role() = 'recruiter' and public.is_company_member(j.company_id)))
    )
  );
revoke update, delete on public.interview_notes from authenticated;
grant update (interview_id, author_id, body, updated_at) on public.interview_notes to authenticated;

create or replace function public.record_membership_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (coalesce(auth.uid(), new.assigned_by),
    case when new.active then 'recruiter.assigned' else 'recruiter.unassigned' end,
    'company_membership', new.id,
    jsonb_build_object('company_id', new.company_id, 'recruiter_id', new.user_id));
  return new;
end;
$$;
drop trigger if exists company_memberships_audit_insert on public.company_memberships;
create trigger company_memberships_audit_insert after insert on public.company_memberships
  for each row execute procedure public.record_membership_audit();
drop trigger if exists company_memberships_audit_update on public.company_memberships;
create trigger company_memberships_audit_update after update of active on public.company_memberships
  for each row execute procedure public.record_membership_audit();

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
