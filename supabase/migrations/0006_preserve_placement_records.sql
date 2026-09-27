-- Keep the user-facing workspace from hard-deleting organizations or recruiter
-- assignments. Company deletion cascades into jobs and applications; recruiter
-- access should be revoked through the audited active=false workflow instead.
revoke delete on public.companies from authenticated;
revoke delete on public.company_memberships from authenticated;
