-- Private student resumes. Apply after 0001, 0002, and 0003.

alter table public.student_profiles
  add column if not exists resume_path text,
  add column if not exists resume_file_name text,
  add column if not exists resume_uploaded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profiles_resume_metadata_check'
      and conrelid = 'public.student_profiles'::regclass
  ) then
    alter table public.student_profiles
      add constraint student_profiles_resume_metadata_check check (
        (resume_path is null and resume_file_name is null and resume_uploaded_at is null)
        or (resume_path is not null
          and split_part(resume_path, '/', 1) = user_id::text
          and resume_file_name is not null
          and length(resume_file_name) between 1 and 255
          and resume_uploaded_at is not null)
      );
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-resumes',
  'candidate-resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students read own resumes" on storage.objects;
create policy "Students read own resumes" on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.current_app_role() = 'student'
    and exists (
      select 1 from public.student_profiles sp
      where sp.user_id = auth.uid() and sp.resume_path = storage.objects.name
    )
  );

drop policy if exists "Placement staff read candidate resumes" on storage.objects;
create policy "Placement staff read candidate resumes" on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and (
      (public.current_app_role() = 'officer' and exists (
        select 1 from public.student_profiles sp
        where sp.resume_path = storage.objects.name
      ))
      or (public.current_app_role() = 'recruiter' and exists (
        select 1
        from public.student_profiles sp
        join public.applications a on a.student_id = sp.user_id
        join public.jobs j on j.id = a.job_id
        where sp.resume_path = storage.objects.name
          and public.is_company_member(j.company_id)
      ))
    )
  );

drop policy if exists "Students upload own resumes" on storage.objects;
create policy "Students upload own resumes" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-resumes'
    and public.current_app_role() = 'student'
    and split_part(name, '/', 1) = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|doc|docx)$'
  );

drop policy if exists "Students delete own resumes" on storage.objects;
create policy "Students delete own resumes" on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and public.current_app_role() = 'student'
    and split_part(name, '/', 1) = auth.uid()::text
  );
