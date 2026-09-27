"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient, getSupabaseConfig } from "@/lib/supabase";

type JobRow = { id: string; title: string; employment_type: string; location: string; description: string; skill_tags: string[]; companies: { name: string } | { name: string }[] | null };
type ApplicationRow = { job_id: string; stage: string };
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
    if (sessionData.session) await supabase.from("student_profiles").update({ github_username: payload.data.username, github_summary: payload.data }).eq("user_id", sessionData.session.user.id);
  }


  if (!getSupabaseConfig()) return <main className="auth-page"><div className="auth-card"><a className="brand auth-brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><div className="auth-eyebrow">STUDENT PORTAL</div><h1>Connect your workspace<span className="heading-period">.</span></h1><p className="auth-subtitle">The student portal is ready to use once Supabase is connected. Follow the setup guide in the project README.</p><a className="primary-button auth-submit auth-link" href="/">Back to placement dashboard</a></div></main>;

  return <main className="student-page"><header className="student-top"><a className="brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><div className="student-top-right"><a href="/student/profile">Edit profile</a><button onClick={async () => { await createBrowserSupabaseClient().auth.signOut(); router.replace("/login"); }}>Sign out</button></div></header><div className="student-content"><div className="eyebrow">YOUR PLACEMENT JOURNEY</div><h1>Welcome, {name.split(" ")[0]}<span className="heading-period">.</span></h1><p className="page-subtitle">Explore openings, apply once, and keep track of every next step.</p>{notice && <div className="student-notice" role="status">{notice}</div>}{loading ? <div className="student-loading">Loading your placement workspace…</div> : <><section className="student-section"><div className="student-section-heading"><div><span className="section-kicker">MATCH YOUR NEXT MOVE</span><h2>Open opportunities</h2></div><span className="student-count">{jobs.length} roles</span></div><div className="student-job-list">{jobs.map((job) => { const company = Array.isArray(job.companies) ? job.companies[0]?.name : job.companies?.name; const existing = applications.find((item) => item.job_id === job.id); return <article className="student-job" key={job.id}><div className="student-company-icon">{company?.slice(0, 1) || "H"}</div><div className="student-job-main"><h3>{job.title}</h3><p>{company || "Campus partner"} <span>·</span> {job.employment_type} <span>·</span> {job.location}</p>{job.description && <small>{job.description.slice(0, 180)}{job.description.length > 180 ? "…" : ""}</small>}{job.skill_tags?.length > 0 && <div className="skill-tags">{job.skill_tags.slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}</div>}</div><div className="student-job-action">{existing ? <span className={`student-stage stage-${existing.stage}`}>{existing.stage}</span> : <button className="primary-button" onClick={() => void apply(job.id)}>Apply <span>→</span></button>}</div></article>; })}{jobs.length === 0 && <div className="student-empty">No published opportunities right now. Check back soon.</div>}</div></section><section className="student-two-col"><article className="student-section"><div className="student-section-heading"><div><span className="section-kicker">YOUR APPLICATIONS</span><h2>Progress so far</h2></div></div>{applications.length ? <div className="student-app-list">{applications.map((app) => { const job = jobs.find((item) => item.id === app.job_id); return <div className="student-app-row" key={app.job_id}><span><strong>{job?.title || "Opportunity"}</strong><small>{Array.isArray(job?.companies) ? job.companies[0]?.name : job?.companies?.name}</small></span><span className={`student-stage stage-${app.stage}`}>{app.stage}</span></div>; })}</div> : <p className="student-empty">Applications you submit will appear here.</p>}</article><article className="student-section github-card"><div className="section-kicker">PROFILE ENRICHMENT</div><h2>Show what you build.</h2><p>Add your GitHub profile to give employers a quick look at your projects and open-source work.</p><form onSubmit={enrich} className="github-form"><span>github.com/</span><input value={github} onChange={(event) => setGithub(event.target.value)} placeholder="username" aria-label="GitHub username" required/><button className="primary-button">Find profile</button></form>{githubProfile && <div className="github-result"><div><strong>{githubProfile.name || githubProfile.username}</strong><a href={githubProfile.profileUrl} target="_blank" rel="noreferrer">View GitHub ↗</a></div><p>{githubProfile.bio || `${githubProfile.publicRepos} public repositories`}</p><div className="github-repos">{githubProfile.topRepositories.slice(0, 3).map((repo) => <a key={repo.name} href={repo.url} target="_blank" rel="noreferrer"><strong>{repo.name}</strong><small>{repo.language || "Project"} · {repo.stars} stars</small></a>)}</div></div>}</article></section></>}</div></main>;
}
