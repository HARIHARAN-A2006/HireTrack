-- Add company-scoped recruiter access, interviews, and application messaging.
-- Additive and safe to apply to a database that already has 0001_initial_schema.sql.

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

alter table public.interview_rounds
  add column if not exists meeting_url text,
  add column if not exists candidate_feedback text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.interview_notes (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.interview_rounds(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null default '' check (length(body) <= 5000),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists company_memberships_user_idx on public.company_memberships(user_id, active);
create index if not exists application_messages_thread_idx on public.application_messages(application_id, created_at);
create index if not exists application_messages_inbox_idx on public.application_messages(recipient_id, read_at);

create or replace function public.record_application_submission()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.application_events (application_id, actor_id, from_stage, to_stage, note)
    values (new.id, auth.uid(), null, new.stage, 'Application submitted');
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'application.submitted', 'application', new.id, jsonb_build_object('job_id', new.job_id));
  return new;
end;
$$;

drop trigger if exists application_submitted on public.applications;
create trigger application_submitted after insert on public.applications
  for each row execute procedure public.record_application_submission();

create or replace function public.is_company_member(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = target_company_id and m.user_id = auth.uid() and m.active
  )
$$;

create or replace function public.can_access_application(target_application_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = target_application_id and (
      a.student_id = auth.uid()
      or public.current_app_role() = 'officer'
      or (public.current_app_role() = 'recruiter' and public.is_company_member(j.company_id))
    )
  )
$$;

create or replace function public.can_access_student(target_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = target_student_id and public.is_company_member(j.company_id)
  )
$$;

create or replace function public.assign_recruiter_to_company(target_email text, target_company_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  recruiter_id uuid;
  recruiter_name text;
  current_target_role public.app_role;
begin
  if coalesce(public.current_app_role()::text, '') <> 'officer' then
    raise exception 'Only placement officers can assign recruiter access.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = target_company_id) then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;
  select id, full_name, role into recruiter_id, recruiter_name, current_target_role
    from public.profiles where lower(email) = lower(trim(target_email)) limit 1;
  if recruiter_id is null then
    raise exception 'No HireTrack account exists for that email. Ask the recruiter to register first.' using errcode = 'P0002';
  end if;
  if current_target_role = 'officer' then
    raise exception 'A placement officer account cannot be assigned as a recruiter.' using errcode = '42501';
  end if;
  update public.profiles set role = 'recruiter', updated_at = now() where id = recruiter_id;
  insert into public.company_memberships (company_id, user_id, assigned_by, active)
    values (target_company_id, recruiter_id, auth.uid(), true)
    on conflict (company_id, user_id) do update set active = true, assigned_by = auth.uid();
  return jsonb_build_object('user_id', recruiter_id, 'full_name', recruiter_name, 'email', lower(trim(target_email)));
end;
$$;

grant execute on function public.assign_recruiter_to_company(text, uuid) to authenticated;

create or replace function public.get_application_contact(target_application_id uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
declare
  student_id uuid;
  app_company_id uuid;
  contact_id uuid;
begin
  select a.student_id, j.company_id into student_id, app_company_id
    from public.applications a join public.jobs j on j.id = a.job_id
    where a.id = target_application_id;
  if student_id is null then return null; end if;
  if auth.uid() = student_id then
    select user_id into contact_id from public.company_memberships
      where company_memberships.company_id = app_company_id and active limit 1;
    if contact_id is null then
      select id into contact_id from public.profiles where role = 'officer' order by created_at limit 1;
    end if;
    return contact_id;
  end if;
  if public.current_app_role() = 'officer' or (public.current_app_role() = 'recruiter' and public.is_company_member(app_company_id)) then
    return student_id;
  end if;
  return null;
end;
$$;

grant execute on function public.get_application_contact(uuid) to authenticated;

drop policy if exists "Profiles are visible to their owner and officers" on public.profiles;
drop policy if exists "Profiles visible to owners and placement participants" on public.profiles;
create policy "Profiles visible to owners and placement participants" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.current_app_role() = 'officer'
    or (public.current_app_role() = 'recruiter' and public.can_access_student(id))
    or exists (
      select 1 from public.application_messages m
      where (m.sender_id = id or m.recipient_id = id)
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );
drop policy if exists "Student profile visible to owner and hiring staff" on public.student_profiles;
drop policy if exists "Student profiles visible to owners and assigned staff" on public.student_profiles;
create policy "Student profiles visible to owners and assigned staff" on public.student_profiles for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_app_role() = 'officer'
    or (public.current_app_role() = 'recruiter' and public.can_access_student(user_id))
  );

alter table public.company_memberships enable row level security;
alter table public.application_messages enable row level security;
alter table public.interview_notes enable row level security;

drop policy if exists "Recruiters see their memberships" on public.company_memberships;
create policy "Recruiters see their memberships" on public.company_memberships for select to authenticated
  using (user_id = auth.uid() or public.current_app_role() = 'officer');
drop policy if exists "Placement officers manage memberships" on public.company_memberships;
create policy "Placement officers manage memberships" on public.company_memberships for all to authenticated
  using (public.current_app_role() = 'officer') with check (public.current_app_role() = 'officer');

drop policy if exists "Published jobs are visible to all and staff see all" on public.jobs;
drop policy if exists "Published jobs visible to all and staff see assigned jobs" on public.jobs;
create policy "Published jobs are visible to all and staff see assigned jobs" on public.jobs for select
  using (status = 'published' or (
    auth.uid() is not null and (
      public.current_app_role() = 'officer'
      or (public.current_app_role() = 'recruiter' and public.is_company_member(company_id))
    )
  ));
drop policy if exists "Officers create and update jobs" on public.jobs;
drop policy if exists "Placement staff manage assigned jobs" on public.jobs;
create policy "Placement staff manage assigned jobs" on public.jobs for all to authenticated
  using (public.current_app_role() = 'officer' or (public.current_app_role() = 'recruiter' and public.is_company_member(company_id)))
  with check (public.current_app_role() = 'officer' or (public.current_app_role() = 'recruiter' and public.is_company_member(company_id)));

drop policy if exists "Students see own applications and staff see all" on public.applications;
drop policy if exists "Participants see applications" on public.applications;
create policy "Participants see applications" on public.applications for select to authenticated
  using (
    student_id = auth.uid()
    or public.current_app_role() = 'officer'
    or (public.current_app_role() = 'recruiter' and exists (
      select 1 from public.jobs j where j.id = job_id and public.is_company_member(j.company_id)
    ))
  );
drop policy if exists "Staff update application stage" on public.applications;
drop policy if exists "Assigned staff update application stage" on public.applications;
create policy "Assigned staff update application stage" on public.applications for update to authenticated
  using (
    public.current_app_role() = 'officer'
    or (public.current_app_role() = 'recruiter' and exists (
      select 1 from public.jobs j where j.id = job_id and public.is_company_member(j.company_id)
    ))
  )
  with check (
    public.current_app_role() = 'officer'
    or (public.current_app_role() = 'recruiter' and exists (
      select 1 from public.jobs j where j.id = job_id and public.is_company_member(j.company_id)
    ))
  );

drop policy if exists "Application participants view rounds" on public.interview_rounds;
create policy "Application participants view rounds" on public.interview_rounds for select to authenticated
  using (public.can_access_application(application_id));
drop policy if exists "Staff manage interview rounds" on public.interview_rounds;
drop policy if exists "Assigned staff manage interview rounds" on public.interview_rounds;
create policy "Assigned staff manage interview rounds" on public.interview_rounds for all to authenticated
  using (
    public.current_app_role() = 'officer' or exists (
      select 1 from public.applications a join public.jobs j on j.id = a.job_id
      where a.id = application_id and public.is_company_member(j.company_id)
    )
  )
  with check (
    public.current_app_role() = 'officer' or exists (
      select 1 from public.applications a join public.jobs j on j.id = a.job_id
      where a.id = application_id and public.is_company_member(j.company_id)
    )
  );

drop policy if exists "Assigned staff read private interview notes" on public.interview_notes;
create policy "Assigned staff read private interview notes" on public.interview_notes for select to authenticated
  using (exists (
    select 1 from public.interview_rounds r join public.applications a on a.id = r.application_id
    join public.jobs j on j.id = a.job_id
    where r.id = interview_id and (public.current_app_role() = 'officer' or public.is_company_member(j.company_id))
  ));
drop policy if exists "Assigned staff manage private interview notes" on public.interview_notes;
create policy "Assigned staff manage private interview notes" on public.interview_notes for all to authenticated
  using (exists (
    select 1 from public.interview_rounds r join public.applications a on a.id = r.application_id
    join public.jobs j on j.id = a.job_id
    where r.id = interview_id and (public.current_app_role() = 'officer' or public.is_company_member(j.company_id))
  ))
  with check (exists (
    select 1 from public.interview_rounds r join public.applications a on a.id = r.application_id
    join public.jobs j on j.id = a.job_id
    where r.id = interview_id and (public.current_app_role() = 'officer' or public.is_company_member(j.company_id))
  ));

drop policy if exists "Application participants view history" on public.application_events;
create policy "Application participants view history" on public.application_events for select to authenticated
  using (public.can_access_application(application_id));

drop policy if exists "Participants read application messages" on public.application_messages;
create policy "Participants read application messages" on public.application_messages for select to authenticated
  using (public.can_access_application(application_id) and (sender_id = auth.uid() or recipient_id = auth.uid()));
drop policy if exists "Participants send application messages" on public.application_messages;
create policy "Participants send application messages" on public.application_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_application(application_id)
    and exists (
      select 1 from public.applications a
      where a.id = application_id and (recipient_id = a.student_id or sender_id = a.student_id)
    )
  );
drop policy if exists "Recipients mark application messages read" on public.application_messages;
create policy "Recipients mark application messages read" on public.application_messages for update to authenticated
  using (recipient_id = auth.uid() and public.can_access_application(application_id))
  with check (recipient_id = auth.uid() and public.can_access_application(application_id));

grant select, insert, update, delete on public.company_memberships to authenticated;
grant select, insert, update on public.application_messages to authenticated;
grant select, insert, update, delete on public.interview_notes to authenticated;
revoke update on public.application_messages from authenticated;
grant update (read_at) on public.application_messages to authenticated;
