"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient, getSupabaseConfig } from "@/lib/supabase";
import { logAuthEvent } from "@/lib/audit";
import { ResumeDownloadLink } from "@/app/resume-download-link";

type JobRow = { id: string; title: string; employment_type: string; location: string; description: string; application_deadline: string | null; skill_tags: string[]; companies: { name: string } | { name: string }[] | null };
type ApplicationRow = { id: string; job_id: string; stage: string; jobs?: { id: string; title: string; companies?: { name: string } | { name: string }[] } | { id: string; title: string; companies?: { name: string } | { name: string }[] }[]; application_events?: { id: string; from_stage: string | null; to_stage: string; note: string | null; created_at: string }[]; interview_rounds?: { id: string; title: string; scheduled_at: string | null; meeting_url: string | null; candidate_feedback: string | null; status: string }[] };
const isDeadlinePassed = (deadline: string | null) => Boolean(deadline && deadline < new Date().toISOString().slice(0, 10));

type GithubProfile = { username: string; name: string | null; bio: string | null; publicRepos: number; profileUrl: string; topRepositories: { name: string; url: string; language: string | null; stars: number }[] };

export default function StudentPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
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

  const load = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) { router.replace("/login"); return; }
    const [{ data: profile }, { data: studentProfile, error: studentProfileError }] = await Promise.all([
      supabase.from("profiles").select("full_name, role").eq("id", session.user.id).single(),
      supabase.from("student_profiles").select("github_username, resume_path, resume_file_name").eq("user_id", session.user.id).single(),
    ]);
    if (profile?.role === "officer" || profile?.role === "recruiter") { router.replace("/"); return; }
    setUserId(session.user.id);
    setName(profile?.full_name || "Student");
    if (studentProfile) {
      setGithub(studentProfile.github_username || "");
      setResumePath(studentProfile.resume_path || null);
      setResumeFileName(studentProfile.resume_file_name || null);
    } else if (studentProfileError) {
      setNotice("Could not load your profile details. Refresh the page or check the latest database migration.");
    }
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const [jobsResponse, appsResponse] = await Promise.all([fetch("/api/jobs"), fetch("/api/applications", { headers })]);
    if (jobsResponse.ok) setJobs((await jobsResponse.json()).data || []);
    if (appsResponse.ok) setApplications((await appsResponse.json()).data || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (!getSupabaseConfig()) return;
    const timer = window.setTimeout(() => {
      void load().catch(() => { setNotice("Could not load your placement data."); setLoading(false); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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

  async function uploadResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeFile) { setNotice("Choose a PDF or Word resume first."); return; }
    if (resumeFile.size === 0 || resumeFile.size > 5 * 1024 * 1024) { setNotice("Choose a non-empty resume that is 5 MB or smaller."); return; }
    const extension = resumeFile.name.split(".").pop()?.toLowerCase() || "";
    const mimeByExtension: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const contentType = mimeByExtension[extension];
    if (!contentType || (resumeFile.type && resumeFile.type !== contentType)) { setNotice("Upload a PDF, DOC, or DOCX resume."); return; }
    setResumeBusy(true); setNotice("");
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setNotice("Your session expired. Sign in again to upload your resume."); setResumeBusy(false); return; }
    const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("candidate-resumes").upload(path, resumeFile, { contentType, upsert: false });
    if (uploadError) { setNotice(uploadError.message || "Could not upload your resume. Check that the resume migration has been applied."); setResumeBusy(false); return; }
    const safeName = resumeFile.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 255);
    const { error: saveError } = await supabase.from("student_profiles").update({ resume_path: path, resume_file_name: safeName, resume_uploaded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", session.user.id);
    if (saveError) {
      await supabase.storage.from("candidate-resumes").remove([path]);
      setNotice(saveError.message || "The file uploaded, but its profile record could not be saved."); setResumeBusy(false); return;
    }
    const previousFileCleanup = resumePath ? await supabase.storage.from("candidate-resumes").remove([resumePath]) : null;
    setResumePath(path); setResumeFileName(safeName); setResumeFile(null);
    setNotice(previousFileCleanup?.error
      ? "Your new resume is saved and available to authorized staff. The previous file is no longer linked, but storage cleanup did not finish."
      : "Resume uploaded. Your placement officer and authorized recruiters can view it from your application.");
    setResumeBusy(false);
  }

  async function removeResume() {
    if (!resumePath || !window.confirm("Remove your uploaded resume? You can upload another one later.")) return;
    setResumeBusy(true); setNotice("");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("student_profiles").update({ resume_path: null, resume_file_name: null, resume_uploaded_at: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) { setNotice(error.message); setResumeBusy(false); return; }
    const { error: storageError } = await supabase.storage.from("candidate-resumes").remove([resumePath]);
    setResumePath(null); setResumeFileName(null); setResumeFile(null);
    setNotice(storageError
      ? "Your resume is no longer linked to your profile or visible to staff, but the stored file could not be deleted."
      : "Resume removed from your profile.");
    setResumeBusy(false);
  }


  if (!getSupabaseConfig()) return <main className="auth-page"><div className="auth-card"><Link className="brand auth-brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></Link><div className="auth-eyebrow">STUDENT PORTAL</div><h1>Connect your workspace<span className="heading-period">.</span></h1><p className="auth-subtitle">The student portal is ready to use once Supabase is connected. Follow the setup guide in the project README.</p><Link className="primary-button auth-submit auth-link" href="/">Back to placement dashboard</Link></div></main>;

  return <main className="student-page"><header className="student-top"><Link className="brand" href="/student"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></Link><div className="student-top-right"><a href="/messages">Messages</a><a href="/student/profile">Edit profile</a><button onClick={async () => { const supabase = createBrowserSupabaseClient(); await logAuthEvent(supabase, "logout"); await supabase.auth.signOut(); router.replace("/login"); }}>Sign out</button></div></header><div className="student-content"><div className="eyebrow">YOUR PLACEMENT JOURNEY</div><h1>Welcome, {name.split(" ")[0]}<span className="heading-period">.</span></h1><p className="page-subtitle">Explore openings, apply once, and keep track of every next step.</p>{notice && <div className="student-notice" role="status">{notice}</div>}{loading ? <div className="student-loading">Loading your placement workspace…</div> : <><section className="student-section"><div className="student-section-heading"><div><span className="section-kicker">MATCH YOUR NEXT MOVE</span><h2>Open opportunities</h2></div><span className="student-count">{visibleJobs.length} of {jobs.length} roles</span></div><div className="student-job-filters"><input aria-label="Search opportunities" placeholder="Search role, company, location" value={search} onChange={(event) => setSearch(event.target.value)}/><input aria-label="Filter by skill" placeholder="Filter by skill" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)}/><select aria-label="Filter by application status" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value)}><option value="all">All applications</option><option value="not_applied">Not applied</option><option value="applied">Applied</option><option value="screening">Screening</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select></div><div className="student-job-list">{visibleJobs.map((job) => { const company = Array.isArray(job.companies) ? job.companies[0]?.name : job.companies?.name; const existing = applications.find((item) => item.job_id === job.id); const expired = isDeadlinePassed(job.application_deadline); return <article className="student-job" key={job.id}><div className="student-company-icon">{company?.slice(0, 1) || "H"}</div><div className="student-job-main"><h3><a href={`/jobs/${job.id}`}>{job.title}</a></h3><p>{company || "Campus partner"} <span>·</span> {job.employment_type} <span>·</span> {job.location}</p>{job.description && <small>{job.description.slice(0, 180)}{job.description.length > 180 ? "…" : ""}</small>}{job.application_deadline && <small>{expired ? "Applications closed" : `Apply by ${new Date(`${job.application_deadline}T00:00:00`).toLocaleDateString()}`}</small>}{job.skill_tags?.length > 0 && <div className="skill-tags">{job.skill_tags.slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}</div>}<a className="student-detail-link" href={`/jobs/${job.id}`}>View role details →</a></div><div className="student-job-action">{existing ? <span className={`student-stage stage-${existing.stage}`}>{existing.stage}</span> : expired ? <span className="student-stage stage-closed">Closed</span> : <button className="primary-button" onClick={() => void apply(job.id)}>Apply <span>→</span></button>}</div></article>; })}{visibleJobs.length === 0 && <div className="student-empty">No roles match these filters. Clear a search or check back later.</div>}</div></section><section className="student-two-col"><article className="student-section"><div className="student-section-heading"><div><span className="section-kicker">YOUR APPLICATIONS</span><h2>Progress so far</h2></div></div>{applications.length ? <div className="student-app-list">{applications.map((app) => { const job = jobs.find((item) => item.id === app.job_id) || (Array.isArray(app.jobs) ? app.jobs[0] : app.jobs); return <div className="student-app-row student-app-expanded" key={app.job_id}><span><strong>{job?.title || "Opportunity"}</strong><small>{Array.isArray(job?.companies) ? job.companies[0]?.name : job?.companies?.name}</small>{app.application_events?.length ? <small className="student-history">Last update: {app.application_events[app.application_events.length - 1].note || `${app.application_events[app.application_events.length - 1].from_stage || "New"} → ${app.application_events[app.application_events.length - 1].to_stage}`} · {new Date(app.application_events[app.application_events.length - 1].created_at).toLocaleDateString()}</small> : null}{app.interview_rounds?.map((interview) => <small className="student-history" key={interview.id}>{interview.title}: {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : interview.status}{interview.meeting_url ? <> · <a href={interview.meeting_url} target="_blank" rel="noreferrer">Meeting link</a></> : null}{interview.candidate_feedback ? ` · Feedback: ${interview.candidate_feedback}` : ""}</small>)}<a className="student-message-link" href={`/messages?applicationId=${app.id}`}>Message placement / recruiter team →</a></span><span className={`student-stage stage-${app.stage}`}>{app.stage}</span></div>; })}</div> : <p className="student-empty">Applications you submit will appear here.</p>}</article><article className="student-section github-card"><div className="section-kicker">PROFILE ENRICHMENT</div><h2>Show what you build.</h2><p>Add your GitHub profile to give employers a quick look at your projects and open-source work.</p><form onSubmit={enrich} className="github-form"><span>github.com/</span><input value={github} onChange={(event) => setGithub(event.target.value)} placeholder="username" aria-label="GitHub username" required/><button className="primary-button">Find profile</button></form>{githubProfile && <div className="github-result"><div><strong>{githubProfile.name || githubProfile.username}</strong><a href={githubProfile.profileUrl} target="_blank" rel="noreferrer">View GitHub ↗</a></div><p>{githubProfile.bio || `${githubProfile.publicRepos} public repositories`}</p><div className="github-repos">{githubProfile.topRepositories.slice(0, 3).map((repo) => <a key={repo.name} href={repo.url} target="_blank" rel="noreferrer"><strong>{repo.name}</strong><small>{repo.language || "Project"} · {repo.stars} stars</small></a>)}</div></div>}</article><article className="student-section resume-card"><div className="section-kicker">PRIVATE PROFILE DOCUMENT</div><h2>Share your resume.</h2><p>Upload a current resume so your placement officer and recruiters assigned to a company where you applied can review it.</p>{resumeFileName && <div className="resume-current"><strong>{resumeFileName}</strong><ResumeDownloadLink userId={userId}>View current resume ↗</ResumeDownloadLink><button type="button" className="resume-remove" onClick={() => void removeResume()} disabled={resumeBusy}>Remove resume</button></div>}<form onSubmit={(event) => void uploadResume(event)} className="resume-upload-form"><label>Choose a PDF or Word file<input key={resumeFileName || "empty"} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setResumeFile(event.currentTarget.files?.[0] || null); setNotice(""); }} disabled={resumeBusy}/></label>{resumeFile && <small>Selected: {resumeFile.name}</small>}<button className="primary-button" disabled={!resumeFile || resumeBusy}>{resumeBusy ? "Uploading…" : resumePath ? "Replace resume" : "Upload resume"}</button></form><small className="resume-privacy">PDF, DOC, or DOCX · Up to 5 MB · Stored privately in your account.</small></article></section></>}</div></main>;
}
