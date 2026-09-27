-- HireTrack initial schema. Apply in Supabase SQL Editor or with Supabase CLI.
create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'officer', 'recruiter');
create type public.job_status as enum ('draft', 'published', 'closed');
create type public.application_stage as enum ('applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  university text,
  major text,
  graduation_year integer check (graduation_year is null or graduation_year between 2000 and 2100),
  skills text[] not null default '{}',
  github_username text,
  github_summary jsonb,
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  logo_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  created_by uuid not null references public.profiles(id),
  title text not null check (length(trim(title)) between 2 and 120),
  description text not null default '',
  employment_type text not null default 'Full-time',
  location text not null default 'Remote',
  skill_tags text[] not null default '{}',
  status public.job_status not null default 'draft',
  application_deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  stage public.application_stage not null default 'applied',
  cover_note text not null default '',
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, student_id)
);

create table public.interview_rounds (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  title text not null,
  scheduled_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (application_id, round_number)
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_stage public.application_stage,
  to_stage public.application_stage not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index jobs_status_created_idx on public.jobs(status, created_at desc);
create index jobs_company_idx on public.jobs(company_id);
create index applications_student_idx on public.applications(student_id, applied_at desc);
create index applications_job_stage_idx on public.applications(job_id, stage);
create index events_application_idx on public.application_events(application_id, created_at);

create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create function public.create_profile_for_auth_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''));
  insert into public.student_profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_auth_user();

create function public.record_application_stage_change() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.stage is distinct from new.stage then
    insert into public.application_events (application_id, actor_id, from_stage, to_stage)
    values (new.id, auth.uid(), old.stage, new.stage);
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'application.stage_changed', 'application', new.id,
      jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end;
$$;

create trigger application_stage_changed
  after update of stage on public.applications
  for each row execute procedure public.record_application_stage_change();

alter table public.profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.interview_rounds enable row level security;
alter table public.application_events enable row level security;
alter table public.audit_logs enable row level security;

create policy "Profiles are visible to their owner and officers" on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_app_role() in ('officer', 'recruiter'));
create policy "Users update only their own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.current_app_role());

create policy "Student profile visible to owner and hiring staff" on public.student_profiles for select to authenticated
  using (user_id = auth.uid() or public.current_app_role() in ('officer', 'recruiter'));
create policy "Students update their own profile" on public.student_profiles for update to authenticated
  using (user_id = auth.uid() and public.current_app_role() = 'student') with check (user_id = auth.uid());

create policy "Authenticated users read companies" on public.companies for select to authenticated using (true);
create policy "Anonymous visitors see companies with published jobs" on public.companies for select to anon
  using (exists (select 1 from public.jobs where jobs.company_id = companies.id and jobs.status = 'published'));
create policy "Officers manage companies" on public.companies for all to authenticated
  using (public.current_app_role() in ('officer', 'recruiter')) with check (public.current_app_role() in ('officer', 'recruiter'));

create policy "Published jobs are visible to all and staff see all" on public.jobs for select
  using (status = 'published' or (auth.uid() is not null and public.current_app_role() in ('officer', 'recruiter')));
create policy "Officers create and update jobs" on public.jobs for all to authenticated
  using (public.current_app_role() in ('officer', 'recruiter')) with check (public.current_app_role() in ('officer', 'recruiter'));

create policy "Students see own applications and staff see all" on public.applications for select to authenticated
  using (student_id = auth.uid() or public.current_app_role() in ('officer', 'recruiter'));
create policy "Students apply to published jobs" on public.applications for insert to authenticated
  with check (student_id = auth.uid() and public.current_app_role() = 'student' and exists (
    select 1 from public.jobs where id = job_id and status = 'published'));
create policy "Staff update application stage" on public.applications for update to authenticated
  using (public.current_app_role() in ('officer', 'recruiter'))
  with check (public.current_app_role() in ('officer', 'recruiter'));

create policy "Application participants view rounds" on public.interview_rounds for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and (a.student_id = auth.uid() or public.current_app_role() in ('officer', 'recruiter'))));
create policy "Staff manage interview rounds" on public.interview_rounds for all to authenticated
  using (public.current_app_role() in ('officer', 'recruiter')) with check (public.current_app_role() in ('officer', 'recruiter'));

create policy "Application participants view history" on public.application_events for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and (a.student_id = auth.uid() or public.current_app_role() in ('officer', 'recruiter'))));
create policy "Users can view their own audit events" on public.audit_logs for select to authenticated
  using (actor_id = auth.uid() or public.current_app_role() in ('officer', 'recruiter'));

grant usage on schema public to anon, authenticated;
grant select on public.jobs to anon, authenticated;
grant select on public.companies to anon;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, email) on public.profiles to authenticated;
grant select, update on public.student_profiles to authenticated;
grant select, insert, update, delete on public.companies, public.jobs to authenticated;
grant select, insert on public.applications to authenticated;
revoke update on public.applications from authenticated;
grant update (stage, updated_at) on public.applications to authenticated;
grant select, insert, update, delete on public.interview_rounds to authenticated;
grant select on public.application_events, public.audit_logs to authenticated;
