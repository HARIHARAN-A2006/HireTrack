"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Company = { id: string; name: string };
type Membership = { id: string; active: boolean; profiles?: { full_name?: string; email?: string } | { full_name?: string; email?: string }[]; companies?: { name?: string } | { name?: string }[] };

export default function TeamPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load(accessToken: string) {
    const response = await fetch("/api/team", { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load recruiter assignments.");
    setCompanies(payload.companies || []); setMembers(payload.memberships || []);
    if (!companyId && payload.companies?.[0]) setCompanyId(payload.companies[0].id);
  }

  useEffect(() => {
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (profile?.role !== "officer") { router.replace(profile?.role === "recruiter" ? "/recruiter" : "/student"); return; }
      setToken(session.access_token); await load(session.access_token); setBusy(false);
    })().catch((error) => { setNotice(error instanceof Error ? error.message : "Could not load recruiter access."); setBusy(false); });
  }, [router]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice("");
    const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ companyId, email }) });
    const payload = await response.json(); setSaving(false);
    if (!response.ok) { setNotice(payload.error || "Could not assign this recruiter."); return; }
    setEmail(""); await load(token); setNotice("Recruiter assigned to the selected company.");
  }

  async function remove(membershipId: string) {
    const response = await fetch(`/api/team?membershipId=${membershipId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) { setNotice(payload.error || "Could not remove access."); return; }
    await load(token); setNotice("Recruiter access removed.");
  }

  return <main className="workspace-page"><header className="workspace-top"><a className="brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><nav><a className="workspace-tab" href="/">Placement dashboard</a><a className="workspace-tab active" href="/team">Recruiter access</a></nav><button className="workspace-tab" onClick={async () => { await createBrowserSupabaseClient().auth.signOut(); router.replace("/login"); }}>Sign out</button></header><div className="workspace-body"><div className="workspace-eyebrow">BHARATH INSTITUTE OF HIGHER EDUCATION AND RESEARCH</div><h1>Recruiter access<span className="heading-period">.</span></h1><p className="page-subtitle">Assign registered recruiter accounts to a company. Recruiters will only see applications for their assigned companies.</p>{notice && <div className="workspace-notice" role="status">{notice}</div>}
    <section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">ADD A COMPANY RECRUITER</span><h2>Assign recruiter</h2></div></div><form className="team-assign-form" onSubmit={(event) => void assign(event)}><label>Company<select value={companyId} onChange={(event) => setCompanyId(event.target.value)} required><option value="">Select a company</option>{companies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Recruiter account email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="recruiter@company.com" required/></label><button className="primary-button" disabled={saving || busy || !companyId}>{saving ? "Assigning…" : "Assign recruiter"}</button></form><p className="team-help">The recruiter must register at HireTrack first. This assignment grants recruiter access and scopes candidate records to this company.</p></section>
    <section className="workspace-card"><div className="workspace-card-head"><div><span className="section-kicker">ACCESS CONTROL</span><h2>Company assignments</h2></div></div>{busy ? <div className="workspace-empty">Loading assignments…</div> : members.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Recruiter</th><th>Company</th><th>Status</th><th>Action</th></tr></thead><tbody>{members.map((item) => { const recruiter = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; const company = Array.isArray(item.companies) ? item.companies[0] : item.companies; return <tr key={item.id}><td><strong>{recruiter?.full_name || "Recruiter"}</strong><small>{recruiter?.email}</small></td><td>{company?.name}</td><td>{item.active ? "Active" : "Inactive"}</td><td>{item.active && <button className="workspace-danger" onClick={() => void remove(item.id)}>Remove access</button>}</td></tr>; })}</tbody></table></div> : <div className="workspace-empty">No recruiters have been assigned yet.</div>}</section>
  </div></main>;
}
