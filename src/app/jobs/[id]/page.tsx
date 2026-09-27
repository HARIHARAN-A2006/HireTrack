"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserSupabaseClient, getSupabaseConfig } from "@/lib/supabase";

type Job = { id: string; title: string; description: string; employment_type: string; location: string; skill_tags: string[]; application_deadline: string | null; companies: { name: string } | { name: string }[] | null };

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void (async () => {
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers = session ? { Authorization: `Bearer ${session.access_token}` } : undefined;
    const [jobResponse, appResponse] = await Promise.all([
      fetch(`/api/jobs?jobId=${encodeURIComponent(id)}`, { headers }),
      session ? fetch("/api/applications", { headers }) : Promise.resolve(null),
    ]);
    const payload = await jobResponse.json();
    if (!jobResponse.ok || !payload.data?.length) setError(payload.error || "This opportunity could not be found. It may have closed.");
    else setJob(payload.data[0]);
    if (appResponse?.ok) {
      const apps = await appResponse.json();
      setApplied((apps.data || []).some((item: { job_id: string }) => item.job_id === id));
    }
    setLoading(false);
  })().catch(() => { setError("Could not load this opportunity."); setLoading(false); }); }, [id]);

  async function apply() {
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push(`/login?returnTo=${encodeURIComponent(`/jobs/${id}`)}`); return; }
    setBusy(true); setError("");
    const response = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ jobId: id }) });
    const payload = await response.json();
    if (response.ok) setApplied(true); else setError(payload.error || "Could not submit your application.");
    setBusy(false);
  }

  if (!getSupabaseConfig()) return <main className="auth-page"><div className="auth-card"><h1>Connect HireTrack</h1><p>Set up Supabase to view opportunities.</p></div></main>;
  return <main className="job-detail-page"><header className="student-top"><a className="brand" href="/student"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><a href="/student">All opportunities</a></header><div className="job-detail-content">{loading ? <p>Loading opportunity…</p> : error && !job ? <section className="student-section"><p className="student-notice">{error}</p><a href="/student">Back to opportunities</a></section> : job ? <><a className="job-back-link" href="/student">← All opportunities</a><section className="student-section job-detail-card"><span className="section-kicker">CAMPUS OPPORTUNITY</span><h1>{job.title}<span className="heading-period">.</span></h1><p className="job-detail-company">{Array.isArray(job.companies) ? job.companies[0]?.name : job.companies?.name || "Campus partner"}</p><div className="job-detail-facts"><span>{job.employment_type}</span><span>{job.location}</span>{job.application_deadline && <span>Apply by {new Date(`${job.application_deadline}T00:00:00`).toLocaleDateString()}</span>}</div><h2>About this role</h2><p className="job-detail-description">{job.description || "The employer has not added a detailed description yet."}</p>{job.skill_tags?.length > 0 && <><h2>Skills and qualifications</h2><div className="skill-tags">{job.skill_tags.map((skill) => <span key={skill}>{skill}</span>)}</div></>}<div className="job-detail-apply">{applied ? <span className="student-stage stage-applied">Application submitted</span> : <button className="primary-button" disabled={busy} onClick={() => void apply()}>{busy ? "Submitting…" : "Apply for this role →"}</button>}</div>{error && <p className="student-notice" role="alert">{error}</p>}</section></> : null}</div></main>;
}
