-- Run after creating an officer account and promoting it in Supabase.
-- Inserts one sample company and two published campus roles.
do $$
declare
  seed_officer_id uuid;
  seed_company_id uuid;
begin
  select id into seed_officer_id from public.profiles where role = 'officer' order by created_at limit 1;
  if seed_officer_id is null then
    raise exception 'Create an account and promote it to officer before seeding jobs.';
  end if;

  select id into seed_company_id from public.companies where name = 'Northstar Labs' order by created_at limit 1;
  if seed_company_id is null then
    insert into public.companies (name, website, created_by)
    values ('Northstar Labs', 'https://example.com', seed_officer_id)
    returning id into seed_company_id;
  end if;

  insert into public.jobs (company_id, created_by, title, description, employment_type, location, skill_tags, status)
  select seed_company_id, seed_officer_id, sample.title, sample.description, 'Internship', sample.location, sample.skills, 'published'
  from (values
    ('Frontend Engineer Intern', 'Build accessible product experiences with the engineering team.', 'Bengaluru · Hybrid', array['React', 'TypeScript', 'CSS']::text[]),
    ('Product Design Intern', 'Partner with product and research to shape clear, useful workflows.', 'Remote · India', array['Figma', 'Prototyping', 'Research']::text[])
  ) as sample(title, description, location, skills)
  where not exists (
    select 1 from public.jobs existing
    where existing.company_id = seed_company_id and existing.title = sample.title
  );
end $$;
