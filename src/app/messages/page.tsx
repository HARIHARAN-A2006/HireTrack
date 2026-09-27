"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { logAuthEvent } from "@/lib/audit";

type MessageJob = { title?: string; companies?: { name?: string } | { name?: string }[] };
type Application = { id: string; stage: string; applied_at: string; profiles?: { id?: string; full_name?: string } | { id?: string; full_name?: string }[]; jobs?: MessageJob | MessageJob[] };
type Message = { id: string; application_id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null; sender?: { full_name?: string; email?: string } | { full_name?: string; email?: string }[]; recipient?: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] };

export default function MessagesPage() {
  const router = useRouter();
  const [token, setToken] = useState(""); const [userId, setUserId] = useState(""); const [role, setRole] = useState("");
  const [applications, setApplications] = useState<Application[]>([]); const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState(""); const [draft, setDraft] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(true); const [sending, setSending] = useState(false);

  useEffect(() => { void (async () => {
    const supabase = createBrowserSupabaseClient(); const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (!profile) { router.replace("/login"); return; }
    setRole(profile.role); setUserId(session.user.id); setToken(session.access_token);
    const response = await fetch("/api/applications", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not load applications.");
    const rows = payload.data || []; setApplications(rows);
    const requestedId = new URLSearchParams(window.location.search).get("applicationId"); setSelectedId(rows.some((row: Application) => row.id === requestedId) ? requestedId : rows[0]?.id || "");
    setBusy(false);
  })().catch((error) => { setNotice(error instanceof Error ? error.message : "Could not load messages."); setBusy(false); }); }, [router]);

  useEffect(() => { if (!token || !selectedId) { setMessages([]); return; } void (async () => {
    const response = await fetch(`/api/messages?applicationId=${selectedId}`, { headers: { Authorization: `Bearer ${token}` } }); const payload = await response.json();
    if (!response.ok) { setNotice(payload.error || "Could not open this conversation."); setMessages([]); return; }
    const thread: Message[] = payload.data || []; setMessages(thread);
    const unread = thread.filter((message) => message.recipient_id === userId && !message.read_at).map((message) => message.id);
    if (unread.length) await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ messageIds: unread }) });
  })(); }, [selectedId, token, userId]);

  const selectedApp = applications.find((item) => item.id === selectedId);
  const conversationName = useMemo(() => {
    if (!selectedApp) return "Select an application";
    const candidate = Array.isArray(selectedApp.profiles) ? selectedApp.profiles[0]?.full_name : selectedApp.profiles?.full_name;
    return role === "student" ? "Placement and recruiter team" : candidate || "Candidate";
  }, [role, selectedApp]);

  async function send(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!draft.trim() || !selectedId) return; setSending(true); setNotice("");
    const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ applicationId: selectedId, body: draft }) }); const payload = await response.json(); setSending(false);
    if (!response.ok) { setNotice(payload.error || "Could not send this message."); return; }
    setMessages((current) => [...current, payload.data]); setDraft("");
  }

  const home = role === "student" ? "/student" : role === "recruiter" ? "/recruiter" : "/";
  return <main className="workspace-page"><header className="workspace-top"><a className="brand" href={home}><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><nav><a className="workspace-tab" href={home}>Workspace</a><a className="workspace-tab active" href="/messages">Messages</a></nav><button className="workspace-tab" onClick={async () => { const supabase = createBrowserSupabaseClient(); await logAuthEvent(supabase, "logout"); await supabase.auth.signOut(); router.replace("/login"); }}>Sign out</button></header><div className="workspace-body"><div className="workspace-eyebrow">APPLICATION COMMUNICATIONS</div><h1>Messages<span className="heading-period">.</span></h1><p className="page-subtitle">Keep each conversation connected to the opportunity it belongs to.</p>{notice && <div className="workspace-notice" role="status">{notice}</div>}
    <section className="message-center">{busy ? <div className="workspace-empty">Loading conversations…</div> : <><aside className="message-list"><h2>Your applications</h2>{applications.map((application) => { const job = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs; const company = Array.isArray(job?.companies) ? job.companies[0]?.name : job?.companies?.name; return <button key={application.id} className={`message-thread-button ${selectedId === application.id ? "selected" : ""}`} onClick={() => setSelectedId(application.id)}><strong>{job?.title || "Opportunity"}</strong><small>{company || (role === "student" ? "Your placement" : "Candidate application")}</small><span>{application.stage}</span></button>; })}{!applications.length && <p className="workspace-empty">Messages become available when an application is submitted.</p>}</aside><section className="message-thread"><div className="message-thread-head"><div><span className="section-kicker">{selectedApp ? "APPLICATION CONVERSATION" : "NO APPLICATION SELECTED"}</span><h2>{conversationName}</h2>{selectedApp && <p>{(Array.isArray(selectedApp.jobs) ? selectedApp.jobs[0] : selectedApp.jobs)?.title}</p>}</div></div><div className="message-history">{messages.map((message) => <article className={`chat-bubble ${message.sender_id === userId ? "mine" : "theirs"}`} key={message.id}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString()}</small></article>)}{selectedApp && !messages.length && <div className="workspace-empty">No messages yet. Start the conversation with a question or update.</div>}</div><form className="message-compose" onSubmit={(event) => void send(event)}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selectedApp ? "Write a message…" : "Choose an application first"} disabled={!selectedApp} maxLength={5000} required/><button className="primary-button" disabled={!selectedApp || sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button></form></section></>}</section>
  </div></main>;
}
