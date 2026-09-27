"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient, getSupabaseConfig } from "@/lib/supabase";

type JobRow = { id: string; title: string; employment_type: string; location: string; description: string; skill_tags: string[]; companies: { name: string } | { name: string }[] | null };
type ApplicationRow = { id: string; job_id: string; stage: string; jobs?: { id: string; title: string; companies?: { name: string } | { name: string }[] } | { id: string; title: string; companies?: { name: string } | { name: string }[] }[]; application_events?: { id: string; from_stage: string | null; to_stage: string; note: string | null; created_at: string }[]; interview_rounds?: { id: string; title: string; scheduled_at: string | null; meeting_url: string | null; candidate_feedback: string | null; status: string }[] };
type GithubProfile = { username: string; name: string | null; bio: string | null; publicRepos: number; profileUrl: string; topRepositories: { name: string; url: string; language: string | null; stars: number }[] };

export default function StudentPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [github, setGithub] = useState("");
  const [githubProfile, setGithubProfile] = useState<GithubProfile | null>(null);
  const [search, setSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [applicationFilter, setApplicationFilter] = useState("all");

  const visibleJobs = jobs.filter((job) => {
    const company = Array.isArray(job.companies) ? job.companies[0]?.name : job.companies?.name;
    const app = applications.find((item) => item.job_id === job.id);
    const q = search.trim().toLowerCase();
    const skill = skillSearch.trim().toLowerCase();
    return (!q || `${job.title} ${company || ""} ${job.location} ${job.description}`.toLowerCase().includes(q))
      && (!skill || job.skill_tags?.some((tag) => tag.toLowerCase().includes(skill)))
      && (applicationFilter === "all" || (applicationFilter === "not_applied" ? !app : applicationFilter === "applied" ? Boolean(app) : app?.stage === applicationFilter));
  });

  async function load() {
    const supabase = createBrowserSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) { router.replace("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", session.user.id).single();
    if (profile?.role === "officer" || profile?.role === "recruiter") { router.replace("/"); return; }
    setName(profile?.full_name || "Student");
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const [jobsResponse, appsResponse] = await Promise.all([fetch("/api/jobs"), fetch("/api/applications", { headers })]);
    if (jobsResponse.ok) setJobs((await jobsResponse.json()).data || []);
    if (appsResponse.ok) setApplications((await appsResponse.json()).data || []);
    setLoading(false);
  }

  useEffect(() => { if (!getSupabaseConfig()) { setLoading(false); return; } void load().catch(() => { setNotice("Could not load your placement data."); setLoading(false); }); }, []);

  async function apply(jobId: string) {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify({ jobId }) });
    const payload = await response.json();
    setNotice(response.ok ? "Application submitted. You can follow its progress below." : payload.error || "Could not submit application.");
    if (response.ok) await load();
  }

  async function enrich(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setGithubProfile(null); setNotice("");
    const response = await fetch(`/api/github/${encodeURIComponent(github.trim())}`);
    const payload = await response.json();
    if (!response.ok) { setNotice(payload.error || "Could not find that profile."); return; }
    setGithubProfile(payload.data);
    const supabase = createBrowserSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) await supabase.from("student_profiles").update({ github_username: payload.data.username }).eq("user_id", sessionData.session.user.id);
  }


  if (!getSupabaseConfig()) return <main className="auth-page"><div className="auth-card"><a className="brand auth-brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><div className="auth-eyebrow">STUDENT PORTAL</div><h1>Connect your workspace<span className="heading-period">.</span></h1><p className="auth-subtitle">The student portal is ready to use once Supabase is connected. Follow the setup guide in the project README.</p><a className="primary-button auth-submit auth-link" href="/">Back to placement dashboard</a></div></main>;

  return <main className="student-page"><header className="student-top"><a className="brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><div className="student-top-right"><a href="/messages">Messages</a><a href="/student/profile">Edit profile</a><button onClick={async () => { await createBrowserSupabaseClient().auth.signOut(); router.replace("/login"); }}>Sign out</button></div></header><div className="student-content"><div className="eyebrow">YOUR PLACEMENT JOURNEY</div><h1>Welcome, {name.split(" ")[0]}<span className="heading-period">.</span></h1><p className="page-subtitle">Explore openings, apply once, and keep track of every next step.</p>{notice && <div className="student-notice" role="status">{notice}</div>}{loading ? <div className="student-loading">Loading your placement workspace…</div> : <><section className="student-section"><div className="student-section-heading"><div><span className="section-kicker">MATCH YOUR NEXT MOVE</span><h2>Open opportunities</h2></div><span className="student-count">{visibleJobs.length} of {jobs.length} roles</span></div><div className="student-job-filters"><input aria-label="Search opportunities" placeholder="Search role, company, location" value={search} onChange={(event) => setSearch(event.target.value)}/><input aria-label="Filter by skill" placeholder="Filter by skill" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)}/><select aria-label="Filter by application status" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value)}><option value="all">All applications</option><option value="not_applied">Not applied</option><option value="applied">Applied</option><option value="screening">Screening</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="rejected">Rejected</option></select></div><div className="student-job-list">{visibleJobs.map((job) => { const company = Array.isArray(job.companies) ? job.companies[0]?.name : job.companies?.name; const existing = applications.find((item) => item.job_id === job.id); return <article className="student-job" key={job.id}><div className="student-company-icon">{company?.slice(0, 1) || "H"}</div><div className="student-job-main"><h3><a href={`/jobs/${job.id}`}>{job.title}</a></h3><p>{company || "Campus partner"} <span>·</span> {job.employment_type} <span>·</span> {job.location}</p>{job.description && <small>{job.description.slice(0, 180)}{job.description.length > 180 ? "…" : ""}</small>}{job.skill_tags?.length > 0 && <div className="skill-tags">{job.skill_tags.slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}</div>}<a className="student-detail-link" href={`/jobs/${job.id}`}>View role details →</a></div><div className="student-job-action">{existing ? <span className={`student-stage stage-${existing.stage}`}>{existing.stage}</span> : <button className="primary-button" onClick={() => void apply(job.id)}>Apply <span>→</span></button>}</div></article>; })}{visibleJobs.length === 0 && <div className="student-empty">No roles match these filters. Clear a search or check back later.</div>}</div></section><section className="student-two-col"><article className="student-section"><div className="student-section-heading"><div><span className="section-kicker">YOUR APPLICATIONS</span><h2>Progress so far</h2></div></div>{applications.length ? <div className="student-app-list">{applications.map((app) => { const job = jobs.find((item) => item.id === app.job_id) || (Array.isArray(app.jobs) ? app.jobs[0] : app.jobs); return <div className="student-app-row student-app-expanded" key={app.job_id}><span><strong>{job?.title || "Opportunity"}</strong><small>{Array.isArray(job?.companies) ? job.companies[0]?.name : job?.companies?.name}</small>{app.application_events?.length ? <small className="student-history">Last update: {app.application_events[app.application_events.length - 1].note || `${app.application_events[app.application_events.length - 1].from_stage || "New"} → ${app.application_events[app.application_events.length - 1].to_stage}`} · {new Date(app.application_events[app.application_events.length - 1].created_at).toLocaleDateString()}</small> : null}{app.interview_rounds?.map((interview) => <small className="student-history" key={interview.id}>{interview.title}: {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : interview.status}{interview.meeting_url ? <> · <a href={interview.meeting_url} target="_blank" rel="noreferrer">Meeting link</a></> : null}{interview.candidate_feedback ? ` · Feedback: ${interview.candidate_feedback}` : ""}</small>)}<a className="student-message-link" href={`/messages?applicationId=${app.id}`}>Message placement / recruiter team →</a></span><span className={`student-stage stage-${app.stage}`}>{app.stage}</span></div>; })}</div> : <p className="student-empty">Applications you submit will appear here.</p>}</article><article className="student-section github-card"><div className="section-kicker">PROFILE ENRICHMENT</div><h2>Show what you build.</h2><p>Add your GitHub profile to give employers a quick look at your projects and open-source work.</p><form onSubmit={enrich} className="github-form"><span>github.com/</span><input value={github} onChange={(event) => setGithub(event.target.value)} placeholder="username" aria-label="GitHub username" required/><button className="primary-button">Find profile</button></form>{githubProfile && <div className="github-result"><div><strong>{githubProfile.name || githubProfile.username}</strong><a href={githubProfile.profileUrl} target="_blank" rel="noreferrer">View GitHub ↗</a></div><p>{githubProfile.bio || `${githubProfile.publicRepos} public repositories`}</p><div className="github-repos">{githubProfile.topRepositories.slice(0, 3).map((repo) => <a key={repo.name} href={repo.url} target="_blank" rel="noreferrer"><strong>{repo.name}</strong><small>{repo.language || "Project"} · {repo.stars} stars</small></a>)}</div></div>}</article></section></>}</div></main>;
}
