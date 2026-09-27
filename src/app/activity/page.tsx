"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Audit = { id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string; profiles?: { full_name: string; email: string } | { full_name: string; email: string }[] | null };
const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;
const label = (value: string) => value.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ActivityPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Audit[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { void (async () => {
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (profile?.role !== "officer") { router.replace(profile?.role === "recruiter" ? "/recruiter" : "/student"); return; }
    const response = await fetch("/api/audit", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || "Could not load the audit history."); else setRows(payload.data || []);
    setLoading(false);
  })().catch(() => { setError("Could not load the audit history."); setLoading(false); }); }, [router]);
  return <main className="workspace-page"><header className="workspace-top"><Link className="brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></Link><nav><Link className="workspace-tab" href="/">Overview</Link><Link className="workspace-tab active" href="/activity">Activity history</Link></nav><Link className="workspace-tab" href="/">Back to dashboard</Link></header><div className="workspace-body"><div className="workspace-eyebrow">PLACEMENT ADMINISTRATION</div><h1>Activity history<span className="heading-period">.</span></h1><p className="page-subtitle">A database-backed record of account access and placement actions.</p>{error && <div className="workspace-notice" role="alert">{error}</div>}<section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">LATEST EVENTS</span><h2>{rows.length} recorded actions</h2></div></div>{loading ? <div className="workspace-empty">Loading activity…</div> : rows.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Action</th><th>Actor</th><th>Item</th><th>Details</th><th>Time</th></tr></thead><tbody>{rows.map((row) => { const actor = one(row.profiles); const detail = Object.entries(row.details || {}).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).map(([key, value]) => `${label(key)}: ${value}`).join(" · "); return <tr key={row.id}><td><strong>{label(row.action)}</strong></td><td>{actor?.full_name || actor?.email || "System"}</td><td>{label(row.entity_type)}{row.entity_id ? <small>{row.entity_id}</small> : null}</td><td>{detail || "—"}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>; })}</tbody></table></div> : <div className="workspace-empty">No recorded actions yet. New applications, stage changes, sign-ins, jobs, interviews, and messages will appear here.</div>}</section></div></main>;
}
