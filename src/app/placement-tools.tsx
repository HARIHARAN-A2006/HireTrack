"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { logAuthEvent } from "@/lib/audit";

type Maybe<T> = T | T[] | null | undefined;
type StudentProfile = { university?: string; major?: string; graduation_year?: number; skills?: string[]; github_username?: string };
type Person = { id: string; full_name: string; email?: string; student_profiles?: Maybe<StudentProfile> };
type Company = { id?: string; name: string };
type Job = { id: string; title: string; employment_type: string; location: string; description?: string; status: string; applications?: { count: number }[]; companies?: Maybe<Company> };
type Application = { id: string; student_id: string; stage: string; applied_at: string; profiles?: Maybe<Person>; jobs?: Maybe<Job> };
type SessionInfo = { token: string; userId: string; name: string };
type View = "applications" | "candidates" | "opportunities";
const one = <T,>(value: Maybe<T>): T | null => Array.isArray(value) ? value[0] || null : value || null;
const stages = ["applied", "screening", "interview", "offer", "rejected", "withdrawn"];
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export default function PlacementTools({ view }: { view: View }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void (async () => {
    const supabase = createBrowserSupabaseClient();
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) { router.replace("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", authSession.user.id).single();
    if (profile?.role === "recruiter") { router.replace("/recruiter"); return; }
    if (profile?.role === "student") { router.replace("/student"); return; }
    if (profile?.role !== "officer") { router.replace("/login"); return; }
    setSession({ token: authSession.access_token, userId: authSession.user.id, name: profile.full_name || "Placement team" });
    const headers = { Authorization: `Bearer ${authSession.access_token}` };
    const [appResponse, jobResponse] = await Promise.all([fetch("/api/applications", { headers }), fetch("/api/jobs", { headers })]);
    const appPayload = await appResponse.json(); const jobPayload = await jobResponse.json();
    if (!appResponse.ok) throw new Error(appPayload.error || "Could not load applications.");
    if (!jobResponse.ok) throw new Error(jobPayload.error || "Could not load opportunities.");
    setApplications(appPayload.data || []); setJobs(jobPayload.data || []); setLoading(false);
  })().catch((cause) => { setError(cause instanceof Error ? cause.message : "Could not load placement records."); setLoading(false); }); }, [router]);

  const pageInfo = {
    applications: ["Applications", "CANDIDATE PIPELINE", "Review every application, update progress, and keep communication attached to the opportunity."],
    candidates: ["Candidates", "STUDENT DIRECTORY", "Search students who have applied and review their education, skills, and work profile."],
    opportunities: ["Opportunities", "CAMPUS ROLES", "Publish clear job and internship listings, then pause or close them as hiring progresses."],
  } as const;
  const filteredApplications = useMemo(() => applications.filter((app) => {
    const person = one(app.profiles); const job = one(app.jobs);
    const matchesText = `${person?.full_name || ""} ${person?.email || ""} ${job?.title || ""}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (stage === "all" || app.stage === stage);
  }), [applications, search, stage]);

  async function updateStage(applicationId: string, nextStage: string) {
    if (!session) return;
    const response = await fetch("/api/applications", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ applicationId, stage: nextStage }) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error || "Could not update application stage."); return; }
    setApplications((current) => current.map((app) => app.id === applicationId ? { ...app, stage: nextStage } : app));
  }

  async function setJobStatus(jobId: string, nextStatus: string) {
    if (!session) return;
    const response = await fetch("/api/jobs", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ jobId, status: nextStatus }) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error || "Could not update opportunity."); return; }
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status: nextStatus } : job));
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session) return;
    setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ title: form.get("title"), company: form.get("company"), employmentType: form.get("employmentType"), location: form.get("location"), description: form.get("description"), skills: String(form.get("skills") || "").split(",").map((item) => item.trim()).filter(Boolean) }) });
    const payload = await response.json(); setSaving(false);
    if (!response.ok) { setError(payload.error || "Could not publish opportunity."); return; }
    setJobs((current) => [payload.data, ...current]); setShowForm(false);
  }

  async function signOut() { const supabase = createBrowserSupabaseClient(); await logAuthEvent(supabase, "logout"); await supabase.auth.signOut(); router.replace("/login"); }
  const [title, eyebrow, subtitle] = pageInfo[view];
  const candidates = useMemo(() => {
    const unique = new Map<string, Application>();
    for (const app of applications) if (!unique.has(app.student_id)) unique.set(app.student_id, app);
    return [...unique.values()].filter((app) => { const person = one(app.profiles); const info = one(person?.student_profiles); return `${person?.full_name || ""} ${person?.email || ""} ${info?.university || ""} ${info?.major || ""} ${(info?.skills || []).join(" ")}`.toLowerCase().includes(search.toLowerCase()); });
  }, [applications, search]);

  return <main className="workspace-page"><header className="workspace-top"><a className="brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><nav><a className="workspace-tab" href="/">Overview</a><a className={`workspace-tab ${view === "applications" ? "active" : ""}`} href="/applications">Applications</a><a className={`workspace-tab ${view === "opportunities" ? "active" : ""}`} href="/opportunities">Opportunities</a><a className={`workspace-tab ${view === "candidates" ? "active" : ""}`} href="/candidates">Candidates</a><a className="workspace-tab" href="/messages">Messages</a><a className="workspace-tab" href="/team">Recruiters</a><a className="workspace-tab" href="/activity">Activity</a></nav><div className="workspace-user"><span>{session?.name || "Placement team"}</span><button onClick={signOut}>Sign out</button></div></header><div className="workspace-body"><div className="workspace-eyebrow">{eyebrow}</div><h1>{title}<span className="heading-period">.</span></h1><p className="page-subtitle">{subtitle}</p>{error && <div className="workspace-notice" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {loading ? <section className="workspace-card"><div className="workspace-empty">Loading placement records…</div></section> : view === "applications" ? <section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">ALL STUDENT APPLICATIONS</span><h2>{applications.length} applications</h2></div><div className="workspace-filters"><input aria-label="Search applications" placeholder="Search names and roles" value={search} onChange={(event) => setSearch(event.target.value)}/><select aria-label="Filter by stage" value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All stages</option>{stages.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></div></div>{filteredApplications.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Candidate</th><th>Opportunity</th><th>Company</th><th>Applied</th><th>Stage</th><th>Conversation</th></tr></thead><tbody>{filteredApplications.map((app) => { const person = one(app.profiles); const job = one(app.jobs); const company = one(job?.companies); return <tr key={app.id}><td><strong>{person?.full_name || "Candidate"}</strong><small>{person?.email}</small></td><td>{job?.title || "Opportunity"}</td><td>{company?.name || "Company"}</td><td>{new Date(app.applied_at).toLocaleDateString()}</td><td><select className={`stage-select stage-${app.stage}`} value={app.stage} onChange={(event) => void updateStage(app.id, event.target.value)} aria-label={`Update ${person?.full_name || "candidate"} stage`}>{stages.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></td><td><a className="workspace-inline-link" href={`/messages?applicationId=${app.id}`}>Open messages</a></td></tr>; })}</tbody></table></div> : <div className="workspace-empty">{applications.length ? "No applications match your search." : "Student applications will appear here after a student applies."}</div>}</section> : null}
    {!loading && view === "candidates" && <section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">CANDIDATES WHO HAVE APPLIED</span><h2>{candidates.length} candidates</h2></div><input className="workspace-search" placeholder="Search name, college, or skill" value={search} onChange={(event) => setSearch(event.target.value)}/></div>{candidates.length ? <div className="workspace-candidate-grid">{candidates.map((app) => { const person = one(app.profiles); const info = one(person?.student_profiles); const job = one(app.jobs); return <article className="workspace-candidate-card" key={app.student_id}><div className="candidate-card-avatar">{(person?.full_name || "S").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><h3>{person?.full_name || "Student"}</h3><p>{info?.major || "Degree not added"}{info?.graduation_year ? ` · Class of ${info.graduation_year}` : ""}</p><small>{info?.university || "College not added"}</small><div className="skill-tags">{(info?.skills || []).slice(0, 6).map((skill) => <span key={skill}>{skill}</span>)}</div><div className="candidate-card-footer"><span>{job?.title || "Opportunity"} · {label(app.stage)}</span><a href={`/messages?applicationId=${app.id}`}>Message</a></div>{info?.github_username && <a className="workspace-inline-link" href={`https://github.com/${encodeURIComponent(info.github_username)}`} target="_blank" rel="noreferrer">GitHub profile ↗</a>}</article>; })}</div> : <div className="workspace-empty">{applications.length ? "No candidates match your search." : "Candidate profiles appear here when students apply."}</div>}</section>}
    {!loading && view === "opportunities" && <section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">PUBLISHED AND DRAFT ROLES</span><h2>{jobs.length} opportunities</h2></div><button className="primary-button" onClick={() => setShowForm((value) => !value)}>{showForm ? "Cancel" : "Post an opportunity"}</button></div>{showForm && <form className="opportunity-form" onSubmit={(event) => void createOpportunity(event)}><label>Role title<input name="title" required minLength={2} maxLength={120} placeholder="Software Engineering Intern"/></label><label>Company<input name="company" required minLength={2} maxLength={100} placeholder="Company name"/></label><div className="form-row"><label>Employment type<select name="employmentType"><option>Full-time</option><option>Internship</option><option>Part-time</option><option>Contract</option></select></label><label>Location<input name="location" placeholder="Chennai · Hybrid"/></label></div><label>Role details<textarea name="description" rows={4} placeholder="Responsibilities, eligibility, and selection process"/></label><label>Skills <small>Separate skills with commas</small><input name="skills" placeholder="Java, SQL, Communication"/></label><button className="primary-button" disabled={saving}>{saving ? "Publishing…" : "Publish role"}</button></form>}{jobs.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Role</th><th>Company</th><th>Work type</th><th>Location</th><th>Applicants</th><th>Status</th><th>Manage</th></tr></thead><tbody>{jobs.map((job) => { const company = one(job.companies); return <tr key={job.id}><td><strong>{job.title}</strong><small>{job.description || "No description added"}</small></td><td>{company?.name || "Company"}</td><td>{job.employment_type}</td><td>{job.location}</td><td>{job.applications?.[0]?.count || 0}</td><td><span className={`job-status status-${job.status}`}>{label(job.status)}</span></td><td><select value={job.status} aria-label={`Change ${job.title} status`} onChange={(event) => void setJobStatus(job.id, event.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select></td></tr>; })}</tbody></table></div> : <div className="workspace-empty">No opportunities yet. Post your first campus role.</div>}</section>}
  </div></main>;
}
