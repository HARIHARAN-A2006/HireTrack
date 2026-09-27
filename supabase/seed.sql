-- Run after creating an officer account and promoting it in Supabase.
-- Inserts one sample company and two published campus roles.
do $$
declare
  officer_id uuid;
  company_id uuid;
begin
  select id into officer_id from public.profiles where role = 'officer' order by created_at limit 1;
  if officer_id is null then
    raise exception 'Create an account and promote it to officer before seeding jobs.';
  end if;

  insert into public.companies (name, website, created_by)
  values ('Northstar Labs', 'https://example.com', officer_id)
  returning id into company_id;

  insert into public.jobs (company_id, created_by, title, description, employment_type, location, skill_tags, status)
  values
    (company_id, officer_id, 'Frontend Engineer Intern', 'Build accessible product experiences with the engineering team.', 'Internship', 'Bengaluru · Hybrid', array['React', 'TypeScript', 'CSS'], 'published'),
    (company_id, officer_id, 'Product Design Intern', 'Partner with product and research to shape clear, useful workflows.', 'Internship', 'Remote · India', array['Figma', 'Prototyping', 'Research'], 'published');
end $$;
