"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { logAuthEvent } from "@/lib/audit";
import { ResumeDownloadLink } from "@/app/resume-download-link";

type Stage = "applied" | "screening" | "interview" | "offer" | "rejected" | "withdrawn";
type StudentDetails = { university?: string; major?: string; graduation_year?: number; skills?: string[]; github_username?: string; resume_path?: string | null; resume_file_name?: string | null };
type Applicant = { id?: string; full_name: string; email: string; student_profiles?: StudentDetails | StudentDetails[] };
type RecruiterJob = { id: string; title: string; companies?: { name: string } | { name: string }[] };
type Application = { id: string; stage: Stage; applied_at: string; profiles: Applicant | Applicant[]; jobs: RecruiterJob | RecruiterJob[] };
type RecruiterOpportunity = { id: string; title: string; description: string; application_deadline: string | null; employment_type: string; location: string; skill_tags: string[]; status: string; applications?: { count: number }[] };
type Interview = { id: string; application_id: string; round_number: number; title: string; scheduled_at: string | null; meeting_url: string | null; candidate_feedback: string | null; interview_notes?: { body: string } | { body: string }[]; status: string; applications?: { profiles?: { full_name: string } | { full_name: string }[]; jobs?: { title: string } | { title: string }[] } };
type Message = { id: string; sender_id: string; body: string; created_at: string; read_at: string | null };

const stageNames: Record<Stage, string> = { applied: "Applied", screening: "Screening", interview: "Interview", offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn" };
const localDateTimeValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function RecruiterPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("Recruiter");
  const [company, setCompany] = useState("Assigned company");
  const [companyId, setCompanyId] = useState("");
  const [jobs, setJobs] = useState<RecruiterOpportunity[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [scheduleFor, setScheduleFor] = useState<Application | null>(null);
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [messageFor, setMessageFor] = useState<Application | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [jobModal, setJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<RecruiterOpportunity | null>(null);
  const [jobSaving, setJobSaving] = useState(false);

  async function loadData(accessToken: string) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [appsResponse, interviewsResponse, jobsResponse] = await Promise.all([
      fetch("/api/applications", { headers }),
      fetch("/api/interviews", { headers }),
      fetch("/api/jobs", { headers }),
    ]);
    if (appsResponse.ok) setApplications((await appsResponse.json()).data || []);
    if (interviewsResponse.ok) setInterviews((await interviewsResponse.json()).data || []);
    if (jobsResponse.ok) setJobs((await jobsResponse.json()).data || []);
  }

  useEffect(() => {
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", session.user.id).single();
      if (profile?.role === "student") { router.replace("/student"); return; }
      if (profile?.role === "officer") { router.replace("/"); return; }
      if (profile?.role !== "recruiter") { router.replace("/login"); return; }
      setName(profile.full_name || "Recruiter"); setToken(session.access_token); setUserId(session.user.id);
      const { data: membership } = await supabase.from("company_memberships").select("company_id, companies(name)").eq("user_id", session.user.id).eq("active", true).limit(1).maybeSingle();
      const membershipRecord = membership as unknown as { company_id: string; companies?: { name: string } | { name: string }[] } | null;
      const assigned = Array.isArray(membershipRecord?.companies) ? membershipRecord.companies[0]?.name : membershipRecord?.companies?.name;
      if (assigned) setCompany(assigned);
      if (membershipRecord?.company_id) setCompanyId(membershipRecord.company_id);
      await loadData(session.access_token);
      setBusy(false);
    })().catch(() => { setNotice("Could not load recruiter workspace. Check your account assignment and database migration."); setBusy(false); });
  }, [router]);

  const visibleApplications = useMemo(() => applications.filter((application) => {
    const profile = Array.isArray(application.profiles) ? application.profiles[0] : application.profiles;
    const job = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs;
    const matchesSearch = `${profile?.full_name || ""} ${profile?.email || ""} ${job?.title || ""}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (stageFilter === "all" || application.stage === stageFilter);
  }), [applications, search, stageFilter]);

  async function changeStage(application: Application, stage: Stage) {
    const response = await fetch("/api/applications", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ applicationId: application.id, stage }) });
    const payload = await response.json();
    if (!response.ok) { setNotice(payload.error || "Could not update candidate stage."); return; }
    setApplications((current) => current.map((item) => item.id === application.id ? { ...item, stage } : item));
    setNotice(`Candidate moved to ${stageNames[stage]}.`);
  }

  async function scheduleInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!scheduleFor) return;
    const form = new FormData(event.currentTarget);
    const localDateTime = String(form.get("scheduledAt") || "");
    const scheduledAt = localDateTime ? new Date(localDateTime).toISOString() : "";
    const response = await fetch("/api/interviews", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ applicationId: scheduleFor.id, title: form.get("title"), scheduledAt, meetingUrl: form.get("meetingUrl") }) });
    const payload = await response.json();
    if (!response.ok) { setNotice(payload.error || "Could not schedule interview."); return; }
    setScheduleFor(null); await loadData(token); setNotice("Interview scheduled and saved.");
  }

  async function updateInterviewSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingInterview) return;
    const form = new FormData(event.currentTarget);
    const localDateTime = String(form.get("scheduledAt") || "");
    const response = await fetch("/api/interviews", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ interviewId: editingInterview.id, title: form.get("title"), scheduledAt: localDateTime ? new Date(localDateTime).toISOString() : "", meetingUrl: form.get("meetingUrl") }) });
    const payload = await response.json();
    if (!response.ok) { setNotice(payload.error || "Could not update interview schedule."); return; }
    setEditingInterview(null); await loadData(token); setNotice("Interview schedule updated and saved.");
  }

  async function saveFeedback(event: FormEvent<HTMLFormElement>, interview: Interview) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/interviews", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ interviewId: interview.id, internalNote: form.get("internalNote"), candidateFeedback: form.get("candidateFeedback"), status: form.get("status") }) });
    const payload = await response.json();
    if (!response.ok) { setNotice(payload.error || "Could not save feedback."); return; }
    await loadData(token); setNotice("Interview feedback saved.");
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!companyId) return;
    setJobSaving(true); const form = new FormData(event.currentTarget);
    const fields = { title: form.get("title"), employmentType: form.get("employmentType"), location: form.get("location"), description: form.get("description"), applicationDeadline: form.get("applicationDeadline"), skills: String(form.get("skills") || "").split(",").map((item) => item.trim()).filter(Boolean), status: form.get("status") };
    const response = await fetch("/api/jobs", { method: editingJob ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(editingJob ? { ...fields, jobId: editingJob.id } : { ...fields, companyId }) });
    const payload = await response.json(); setJobSaving(false);
    if (!response.ok) { setNotice(payload.error || "Could not publish this opportunity."); return; }
    setJobs((current) => editingJob ? current.map((job) => job.id === editingJob.id ? payload.data : job) : [payload.data, ...current]);
    setJobModal(false); setNotice(editingJob ? "Opportunity details updated." : "Opportunity published for your assigned company."); setEditingJob(null);
  }

  async function updateOpportunityStatus(jobId: string, status: string) {
    const response = await fetch("/api/jobs", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jobId, status }) });
    const payload = await response.json(); if (!response.ok) { setNotice(payload.error || "Could not update this role."); return; }
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status } : job));
  }

  async function deleteDraft(job: RecruiterOpportunity) {
    if (!window.confirm(`Delete the draft “${job.title}”? Only drafts with no applications can be removed.`)) return;
    const response = await fetch(`/api/jobs?jobId=${job.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) { setNotice(payload.error || "Could not delete this draft."); return; }
    setJobs((current) => current.filter((item) => item.id !== job.id)); setNotice("Draft opportunity deleted.");
  }

  async function openConversation(application: Application) {
    setMessageFor(application); setMessageText("");
    const response = await fetch(`/api/messages?applicationId=${application.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json(); setMessages(response.ok ? payload.data || [] : []);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!messageFor || !messageText.trim()) return;
    setSending(true);
    const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ applicationId: messageFor.id, body: messageText }) });
    const payload = await response.json(); setSending(false);
    if (!response.ok) { setNotice(payload.error || "Could not send message."); return; }
    setMessages((current) => [...current, payload.data]); setMessageText(""); setNotice("Message sent.");
  }

  async function signOut() { const supabase = createBrowserSupabaseClient(); await logAuthEvent(supabase, "logout"); await supabase.auth.signOut(); router.replace("/login"); }

  return <main className="workspace-page">
    <header className="workspace-top"><Link className="brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></Link><nav><a className="workspace-tab active" href="/recruiter">Candidate pipeline</a><a className="workspace-tab" href="/messages">Messages</a></nav><div className="workspace-user"><span>{name}</span><button onClick={signOut}>Sign out</button></div></header>
    <div className="workspace-body"><div className="workspace-eyebrow">RECRUITER WORKSPACE · {company.toUpperCase()}</div><h1>Candidate pipeline<span className="heading-period">.</span></h1><p className="page-subtitle">Review applicants, coordinate interviews, and share timely progress with candidates.</p>
      {notice && <div className="workspace-notice" role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
      {busy ? <div className="workspace-card">Loading your assigned candidates…</div> : <>
        <section className="workspace-metrics"><article><span>Total applicants</span><strong>{applications.length}</strong></article><article><span>Interview stage</span><strong>{applications.filter((item) => item.stage === "interview").length}</strong></article><article><span>Offers</span><strong>{applications.filter((item) => item.stage === "offer").length}</strong></article><article><span>Interviews scheduled</span><strong>{interviews.filter((item) => item.status === "scheduled").length}</strong></article></section>
        <section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">REVIEW AND RESPOND</span><h2>Applications</h2></div><div className="workspace-filters"><input aria-label="Search candidates" placeholder="Search candidates or roles" value={search} onChange={(event) => setSearch(event.target.value)}/><select aria-label="Filter by stage" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">All stages</option>{Object.entries(stageNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
          {visibleApplications.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Candidate</th><th>Opportunity</th><th>Applied</th><th>Current stage</th><th>Actions</th></tr></thead><tbody>{visibleApplications.map((application) => { const profile = Array.isArray(application.profiles) ? application.profiles[0] : application.profiles; const candidateProfile = Array.isArray(profile?.student_profiles) ? profile.student_profiles[0] : profile?.student_profiles; const job = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs; return <tr key={application.id}><td><strong>{profile?.full_name || "Candidate"}</strong><small>{candidateProfile?.major || candidateProfile?.university || profile?.email}</small>{candidateProfile?.skills?.length ? <small>{candidateProfile.skills.slice(0, 5).join(" · ")}</small> : null}{candidateProfile?.resume_path && profile?.id ? <ResumeDownloadLink className="workspace-inline-link" userId={profile.id}>{candidateProfile.resume_file_name || "View resume"} ↗</ResumeDownloadLink> : null}{candidateProfile?.github_username ? <a className="workspace-inline-link" href={`https://github.com/${encodeURIComponent(candidateProfile.github_username)}`} target="_blank" rel="noreferrer">GitHub profile ↗</a> : null}</td><td>{job?.title || "Opportunity"}</td><td>{new Date(application.applied_at).toLocaleDateString()}</td><td><select className={`stage-select stage-${application.stage}`} value={application.stage} onChange={(event) => void changeStage(application, event.target.value as Stage)} aria-label={`Change stage for ${profile?.full_name || "candidate"}`}>{Object.entries(stageNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td><td><div className="workspace-actions"><button onClick={() => setScheduleFor(application)}>Schedule interview</button><button onClick={() => void openConversation(application)}>Message</button></div></td></tr>; })}</tbody></table></div> : <div className="workspace-empty">{applications.length ? "No candidates match those filters." : "There are no applicants for your assigned company yet."}</div>}
        </section>
        <section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">YOUR COMPANY&apos;S OPENINGS</span><h2>{jobs.length} opportunities</h2></div><button className="primary-button" onClick={() => { setEditingJob(null); setJobModal(true); }}>Post an opportunity</button></div>{jobs.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Role</th><th>Type</th><th>Location</th><th>Applicants</th><th>Status</th><th>Manage</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.title}</strong><small>{job.description}</small>{job.application_deadline && <small>Apply by {new Date(`${job.application_deadline}T00:00:00`).toLocaleDateString()}</small>}{job.skill_tags?.length ? <small>{job.skill_tags.slice(0, 5).join(" · ")}</small> : null}</td><td>{job.employment_type}</td><td>{job.location}</td><td>{job.applications?.[0]?.count || 0}</td><td><span className={`job-status status-${job.status}`}>{job.status}</span></td><td><div className="workspace-actions"><button onClick={() => { setEditingJob(job); setJobModal(true); }}>Edit</button><select value={job.status} onChange={(event) => void updateOpportunityStatus(job.id, event.target.value)} aria-label={`Change ${job.title} status`}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select>{job.status === "draft" && (job.applications?.[0]?.count || 0) === 0 && <button className="workspace-danger" onClick={() => void deleteDraft(job)}>Delete draft</button>}</div></td></tr>)}</tbody></table></div> : <div className="workspace-empty">No opportunities have been posted for this company yet.</div>}</section>
        <section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">INTERVIEW MANAGEMENT</span><h2>Upcoming and completed interviews</h2></div></div>{interviews.length ? <div className="interview-list">{interviews.map((interview) => { const app = Array.isArray(interview.applications) ? interview.applications[0] : interview.applications; const candidate = Array.isArray(app?.profiles) ? app.profiles[0]?.full_name : app?.profiles?.full_name; const job = Array.isArray(app?.jobs) ? app.jobs[0]?.title : app?.jobs?.title; const privateNotes = Array.isArray(interview.interview_notes) ? interview.interview_notes[0]?.body : interview.interview_notes?.body; return <article className="interview-card" key={interview.id}><div><strong>{interview.title} · Round {interview.round_number}</strong><p>{candidate || "Candidate"} · {job || "Opportunity"}</p><small>{interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : "Time not set"} · {interview.status}</small>{interview.meeting_url && <a className="workspace-inline-link" href={interview.meeting_url} target="_blank" rel="noreferrer">Join meeting ↗</a>}<button type="button" className="workspace-inline-link" onClick={() => setEditingInterview(interview)}>Edit schedule</button></div><form onSubmit={(event) => void saveFeedback(event, interview)} className="feedback-form"><label>Private recruiter notes<textarea name="internalNote" aria-label="Private recruiter notes" defaultValue={privateNotes || ""} placeholder="Visible to assigned recruiters and placement officers"/></label><label>Feedback for candidate<textarea name="candidateFeedback" aria-label="Feedback for candidate" defaultValue={interview.candidate_feedback || ""} placeholder="Shared with the candidate in their progress view"/></label><div><select name="status" defaultValue={interview.status}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><button className="primary-button">Save interview update</button></div></form></article>; })}</div> : <div className="workspace-empty">No interviews are scheduled yet. Schedule one from an application above.</div>}</section>
      </>}
    </div>
    {scheduleFor && <div className="modal-backdrop"><form className="workspace-dialog" onSubmit={(event) => void scheduleInterview(event)}><div className="modal-top"><div><div className="section-kicker">INTERVIEW</div><h2>Schedule candidate</h2><p>{(Array.isArray(scheduleFor.profiles) ? scheduleFor.profiles[0] : scheduleFor.profiles)?.full_name}</p></div><button type="button" className="secondary-button" onClick={() => setScheduleFor(null)}>Close</button></div><label>Round name<input name="title" placeholder="Technical interview" required maxLength={120}/></label><label>Date and time<input type="datetime-local" name="scheduledAt" required/></label><label>Meeting link <small>Optional</small><input type="url" name="meetingUrl" placeholder="https://meet.example.com/..."/></label><button className="primary-button">Save interview</button></form></div>}
    {editingInterview && <div className="modal-backdrop"><form className="workspace-dialog" onSubmit={(event) => void updateInterviewSchedule(event)}><div className="modal-top"><div><div className="section-kicker">INTERVIEW · ROUND {editingInterview.round_number}</div><h2>Update interview schedule</h2><p>Changes are saved to this candidate’s interview.</p></div><button type="button" className="secondary-button" onClick={() => setEditingInterview(null)}>Close</button></div><label>Round name<input name="title" defaultValue={editingInterview.title} required minLength={2} maxLength={120}/></label><label>Date and time<input name="scheduledAt" type="datetime-local" defaultValue={localDateTimeValue(editingInterview.scheduled_at)} required/></label><label>Meeting link <small>Optional</small><input name="meetingUrl" type="url" defaultValue={editingInterview.meeting_url || ""} placeholder="https://meet.example.com/..."/></label><button className="primary-button">Save schedule</button></form></div>}{jobModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setJobModal(false); setEditingJob(null); } }}><form key={editingJob?.id || "new-job"} className="workspace-dialog" onSubmit={(event) => void createOpportunity(event)}><div className="modal-top"><div><div className="section-kicker">{editingJob ? "EDIT OPPORTUNITY" : "NEW OPPORTUNITY"} · {company}</div><h2>{editingJob ? "Update company role" : "Post a company role"}</h2><p>{editingJob ? "Your changes will appear in the student opportunities portal." : "This will appear in the student opportunities portal."}</p></div><button type="button" className="secondary-button" onClick={() => { setJobModal(false); setEditingJob(null); }}>Close</button></div><label>Role title<input name="title" defaultValue={editingJob?.title || ""} required minLength={2} maxLength={120} placeholder="Software Engineer"/></label><label>Employment type<select name="employmentType" defaultValue={editingJob?.employment_type || "Full-time"}><option>Full-time</option><option>Internship</option><option>Part-time</option><option>Contract</option></select></label><label>Location<input name="location" defaultValue={editingJob?.location || ""} placeholder="Chennai · Hybrid"/></label><label>Role details<textarea name="description" rows={4} defaultValue={editingJob?.description || ""} placeholder="Responsibilities and eligibility"/></label><label>Apply by <small>Optional</small><input name="applicationDeadline" type="date" defaultValue={editingJob?.application_deadline || ""}/></label><label>Skills <small>Separate with commas</small><input name="skills" defaultValue={editingJob?.skill_tags?.join(", ") || ""} placeholder="React, SQL, Communication"/></label><button className="primary-button" disabled={jobSaving}>{jobSaving ? "Saving…" : editingJob ? "Save changes" : "Publish opportunity"}</button></form></div>}
    {messageFor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMessageFor(null); }}><section className="workspace-dialog conversation-dialog"><div className="modal-top"><div><div className="section-kicker">APPLICATION CONVERSATION</div><h2>{(Array.isArray(messageFor.profiles) ? messageFor.profiles[0] : messageFor.profiles)?.full_name}</h2></div><button type="button" className="secondary-button" onClick={() => setMessageFor(null)}>Close</button></div><div className="conversation-messages">{messages.map((message) => <article className={`conversation-message ${message.sender_id === userId ? "outgoing" : "incoming"}`} key={message.id}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString()}</small></article>)}{messages.length === 0 && <p className="workspace-empty">Start a conversation about this application.</p>}</div><form onSubmit={(event) => void sendMessage(event)} className="conversation-form"><textarea value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a message to the candidate" required maxLength={5000}/><button className="primary-button" disabled={sending}>{sending ? "Sending…" : "Send message"}</button></form></section></div>}
  </main>;
}
