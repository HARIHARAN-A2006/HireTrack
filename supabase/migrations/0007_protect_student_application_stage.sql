-- Students may create applications, but cannot forge an advanced stage or
-- submit a custom application timestamp through direct PostgREST access.
revoke insert on public.applications from authenticated;
grant insert (job_id, student_id, cover_note) on public.applications to authenticated;

drop policy if exists "Students apply to published jobs" on public.applications;
drop policy if exists "Students apply to published jobs before deadline" on public.applications;
create policy "Students apply to published jobs before deadline" on public.applications for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.current_app_role() = 'student'
    and stage = 'applied'
    and exists (
      select 1 from public.jobs
      where jobs.id = job_id and jobs.status = 'published'
        and (jobs.application_deadline is null or jobs.application_deadline >= current_date)
    )
  );
