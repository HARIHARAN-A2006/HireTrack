-- Preserve the recruiter access boundary once applicants exist. Moving a job
-- to another company would otherwise grant that company's recruiters access
-- to existing applications, messages, and candidate resumes.
create or replace function public.prevent_job_company_reassignment_with_applications()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- Serialize reassignment against a concurrent application insert, whose
  -- foreign-key check takes a KEY SHARE lock on this same job row.
  perform 1 from public.jobs j where j.id = old.id for update;
  if old.company_id is distinct from new.company_id
    and exists (select 1 from public.applications a where a.job_id = old.id) then
    raise exception 'An opportunity with applications cannot be moved to another company.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_job_company_reassignment_with_applications() from public;

drop trigger if exists prevent_company_reassignment_with_applications on public.jobs;
create trigger prevent_company_reassignment_with_applications
  before update of company_id on public.jobs
  for each row execute procedure public.prevent_job_company_reassignment_with_applications();
