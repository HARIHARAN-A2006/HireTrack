"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient, getSupabaseConfig } from "@/lib/supabase";

type Status = "Applied" | "Screening" | "Interview" | "Offer" | "Rejected";
type Candidate = { id: number | string; name: string; initials: string; role: string; company: string; date: string; status: Status; color: string; score: number };
type Job = { id: number | string; title: string; company: string; type: string; location: string; applicants: number; color: string; logo: string };

const startingApplications: Candidate[] = [
  { id: 1, name: "Aarav Mehta", initials: "AM", role: "Product Designer", company: "Figma", date: "Today, 10:24 AM", status: "Interview", color: "lilac", score: 92 },
  { id: 2, name: "Diya Sharma", initials: "DS", role: "Frontend Engineer", company: "Vercel", date: "Today, 9:12 AM", status: "Screening", color: "peach", score: 88 },
  { id: 3, name: "Kabir Rao", initials: "KR", role: "Product Designer", company: "Linear", date: "Yesterday", status: "Applied", color: "mint", score: 84 },
  { id: 4, name: "Ananya Iyer", initials: "AI", role: "Data Analyst", company: "Notion", date: "Yesterday", status: "Offer", color: "blue", score: 96 },
  { id: 5, name: "Rohan Kapoor", initials: "RK", role: "Frontend Engineer", company: "Figma", date: "Sep 24, 2026", status: "Screening", color: "rose", score: 79 },
];

const startingJobs: Job[] = [
  { id: 1, title: "Product Designer", company: "Figma", type: "Full-time", location: "Bengaluru · Hybrid", applicants: 28, color: "job-purple", logo: "F" },
  { id: 2, title: "Frontend Engineer", company: "Vercel", type: "Internship", location: "Remote · India", applicants: 42, color: "job-black", logo: "V" },
  { id: 3, title: "Data Analyst", company: "Notion", type: "Full-time", location: "Mumbai · On-site", applicants: 19, color: "job-yellow", logo: "N" },
];

const navItems = ["Overview", "Applications", "Opportunities", "Candidates", "Messages"];
const statuses: Status[] = ["Applied", "Screening", "Interview", "Offer", "Rejected"];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3ZM19 14l1 2.5 2 1-2 1-1 2.5-1-2.5-2-1 2-1 1-2.5Z"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function Home() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("Overview");
  const [activeTab, setActiveTab] = useState("All applications");
  const [search, setSearch] = useState("");
  const [applications, setApplications] = useState(startingApplications);
  const [jobs, setJobs] = useState(startingJobs);
  const [jobModal, setJobModal] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notice, setNotice] = useState("");
  const [liveMode, setLiveMode] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [officerName, setOfficerName] = useState("Hariharan");

  useEffect(() => {
    if (!getSupabaseConfig()) return;
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/login"); return; }
      const session = sessionData.session;
      const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", session.user.id).single();
      if (profile?.role === "student") { router.replace("/student"); return; }
      if (profile?.role !== "officer" && profile?.role !== "recruiter") { router.replace("/login"); return; }
      if (profile.full_name) setOfficerName(profile.full_name);
      setAccessToken(session.access_token);
      setLiveMode(true);
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [jobsResponse, appsResponse] = await Promise.all([fetch("/api/jobs", { headers }), fetch("/api/applications", { headers })]);
      if (jobsResponse.ok) {
        const payload = await jobsResponse.json();
        setJobs((payload.data || []).map((row: { id: string; title: string; employment_type: string; location: string; companies?: { name?: string } | { name?: string }[]; applications?: { count: number }[] }) => {
          const company = Array.isArray(row.companies) ? row.companies[0]?.name : row.companies?.name;
          return { id: row.id, title: row.title, company: company || "Campus partner", type: row.employment_type, location: row.location, applicants: row.applications?.[0]?.count || 0, color: "job-green", logo: (company || "H").slice(0, 1).toUpperCase() };
        }));
      }
      if (appsResponse.ok) {
        const payload = await appsResponse.json();
        const colors = ["lilac", "peach", "mint", "blue", "rose"];
        setApplications((payload.data || []).map((row: { id: string; stage: string; applied_at: string; profiles?: { full_name?: string } | { full_name?: string }[]; jobs?: { title?: string; companies?: { name?: string } | { name?: string }[] } | { title?: string; companies?: { name?: string } | { name?: string }[] } }, index: number) => {
          const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
          const company = Array.isArray(job?.companies) ? job.companies[0]?.name : job?.companies?.name;
          const fullName = profile?.full_name || "Student";
          const rawStage = row.stage.charAt(0).toUpperCase() + row.stage.slice(1);
          const stage: Status = ["Applied", "Screening", "Interview", "Offer", "Rejected"].includes(rawStage) ? rawStage as Status : "Applied";
          return { id: row.id, name: fullName, initials: fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), role: job?.title || "Opportunity", company: company || "Campus partner", date: new Date(row.applied_at).toLocaleDateString(), status: stage, color: colors[index % colors.length], score: 0 };
        }));
      }
    })().catch(() => setNotice("Could not load live placement data. Check your Supabase settings."));
  }, [router]);

  const filteredApplications = useMemo(() => applications.filter((app) => {
    const matchesTab = activeTab === "All applications" || app.status === activeTab;
    const matchesSearch = `${app.name} ${app.role} ${app.company}`.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  }), [applications, activeTab, search]);
  const interviewCount = applications.filter((app) => app.status === "Interview").length;
  const offerCount = applications.filter((app) => app.status === "Offer").length;
  const interviewShare = applications.length ? Math.round(interviewCount / applications.length * 100) : 0;

  function updateStatus(id: number | string, status: Status) {
    setApplications((current) => current.map((app) => app.id === id ? { ...app, status } : app));
    if (liveMode) {
      void fetch("/api/applications", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ applicationId: id, stage: status.toLowerCase() }) }).then(async (response) => {
        if (!response.ok) { const payload = await response.json(); setNotice(payload.error || "Could not save this update."); }
      });
    }
    setNotice("Candidate stage updated");
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    const company = String(data.get("company") || "").trim();
    if (!title || !company) return;
    if (liveMode) {
      const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ title, company, employmentType: data.get("type"), location: data.get("location") }) });
      const payload = await response.json();
      if (!response.ok) { setNotice(payload.error || "Could not publish this opportunity."); return; }
      const row = payload.data;
      setJobs((current) => [{ id: row.id, title: row.title, company, type: row.employment_type, location: row.location, applicants: 0, color: "job-green", logo: company.slice(0, 1).toUpperCase() }, ...current]);
      setJobModal(false); setNotice("Opportunity published"); window.setTimeout(() => setNotice(""), 2600); return;
    }
    setJobs((current) => [{ id: Date.now(), title, company, type: String(data.get("type") || "Full-time"), location: String(data.get("location") || "Remote"), applicants: 0, color: "job-green", logo: company.slice(0, 1).toUpperCase() }, ...current]);
    setJobModal(false);
    setNotice("Opportunity added to your placements");
    window.setTimeout(() => setNotice(""), 2600);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <a className="brand" href="#home" onClick={() => setActiveNav("Overview")}><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switch"><span className="workspace-icon">B</span><span className="workspace-copy"><strong>BHARATH INSTITUTE OF HIGHER EDUCATION AND RESEARCH</strong><small>Placement team</small></span><Icon name="chevron" size={15}/></button>
        <div className="nav-label">MENU</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item, index) => <button key={item} onClick={() => { setActiveNav(item); setMobileMenu(false); }} className={`nav-item ${activeNav === item ? "nav-active" : ""}`}><Icon name={["grid", "briefcase", "briefcase", "users", "message"][index]}/><span>{item}</span>{item === "Messages" && <span className="nav-count">3</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Icon name="spark" size={16}/></div><strong>Make every hire count.</strong><p>Your placement season is looking bright. Keep your team in the loop.</p><button onClick={() => setNotice("Invite link copied to clipboard")}>Invite your team <Icon name="arrow" size={14}/></button></div>
          <button className="profile-switch" onClick={async () => { if (liveMode) { await createBrowserSupabaseClient().auth.signOut(); router.replace("/login"); } else setNotice("Demo dashboard · configure Supabase to sign in."); }}><span className="avatar avatar-teal">{officerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="workspace-copy"><strong>{officerName}</strong><small>{liveMode ? "Placement officer · Sign out" : "Placement officer · Demo"}</small></span><Icon name="dots" size={18}/></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu"><Icon name="menu"/></button>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-sep">/</span><strong>{activeNav}</strong></div>
          <div className="top-actions"><div className="season-pill"><span className="live-dot"/> Fall placement 2026</div><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotice("You’re all caught up") }><Icon name="bell"/><span/></button><span className="avatar avatar-teal top-avatar">{officerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span></div>
        </header>

        <div className="page-content">
          <section className="welcome-row"><div><div className="eyebrow">SUNDAY, SEPTEMBER 27, 2026 <span className="eyebrow-spark">✳</span></div><h1>{activeNav === "Overview" ? `Good morning, ${officerName.split(/\s+/)[0]}` : activeNav}<span className="heading-period">.</span></h1><p className="page-subtitle">Here&apos;s what&apos;s happening across your placements today.</p></div><button className="primary-button" onClick={() => setJobModal(true)}><Icon name="plus" size={17}/> Post an opportunity</button></section>

          <section className="stats-grid" aria-label="Placement overview">
            <article className="stat-card stat-highlight"><div className="stat-top"><span className="stat-label">Active opportunities</span><span className="stat-icon stat-icon-green"><Icon name="briefcase" size={17}/></span></div><div className="stat-value">{String(jobs.length).padStart(2, "0")}<span className="stat-trend"><span>↗</span> 2 this month</span></div><div className="stat-foot"><span className="mini-bars"><i/><i/><i/><i/><i/><i/><i/></span><span>Across 8 companies</span></div></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-label">Applications received</span><span className="stat-icon stat-icon-lilac"><Icon name="users" size={17}/></span></div><div className="stat-value">{applications.length}<span className="stat-trend trend-soft">this season</span></div><div className="stat-foot"><span className="stat-muted">across all roles</span><span className="avatar-stack"><i>AM</i><i>DS</i><i>KR</i><b>+{Math.max(applications.length - 3, 0)}</b></span></div></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-label">In interview stage</span><span className="stat-icon stat-icon-peach"><Icon name="message" size={17}/></span></div><div className="stat-value">{interviewCount}<span className="stat-trend trend-soft">in progress</span></div><div className="stat-foot"><div className="progress-track"><i style={{ width: `${interviewShare}%` }}/></div><span>{interviewShare}% of candidates</span></div></article>
            <article className="stat-card"><div className="stat-top"><span className="stat-label">Offers extended</span><span className="stat-icon stat-icon-blue">✳</span></div><div className="stat-value">{offerCount}<span className="stat-trend trend-soft">this season</span></div><div className="stat-foot"><span className="offer-avatars"><i>AI</i><i>VP</i><i>+{Math.max(offerCount - 2, 0)}</i></span><span>candidate offers</span></div></article>
          </section>

          <section className="content-grid">
            <article className="panel applications-panel">
              <div className="panel-heading"><div><div className="section-kicker">THE PIPELINE</div><h2>Recent applications <span className="heading-count">{applications.length}</span></h2></div><button className="text-button" onClick={() => setActiveNav("Applications")}>View all <Icon name="arrow" size={15}/></button></div>
              <div className="table-toolbar"><div className="tabs">{["All applications", "Screening", "Interview", "Offer"].map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={activeTab === tab ? "tab-active" : ""}>{tab}{tab === "All applications" && <span>{applications.length}</span>}</button>)}</div><label className="search-box"><Icon name="search" size={16}/><input placeholder="Search candidates" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search candidates"/><kbd>⌘ K</kbd></label></div>
              <div className="table-scroll"><table className="applications-table"><thead><tr><th>Candidate</th><th>Applied for</th><th>Applied</th><th>Stage</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredApplications.map((app) => <tr key={app.id}><td><div className="candidate-cell"><span className={`avatar avatar-${app.color}`}>{app.initials}</span><span><strong>{app.name}</strong><small><span className="candidate-score">✦ {app.score}</span> match score</small></span></div></td><td><strong className="role-title">{app.role}</strong><small className="company-name">{app.company}</small></td><td className="date-cell">{app.date}</td><td><label className={`status-pill status-${app.status.toLowerCase()}`}><span/>{app.status}<select value={app.status} aria-label={`Update ${app.name} stage`} onChange={(event) => updateStatus(app.id, event.target.value as Status)}><option value="Applied">Applied</option><option value="Screening">Screening</option><option value="Interview">Interview</option><option value="Offer">Offer</option><option value="Rejected">Rejected</option></select></label></td><td><button className="row-more" aria-label={`More options for ${app.name}`} onClick={() => setNotice(`${app.name} · ${app.role}`)}><Icon name="dots"/></button></td></tr>)}</tbody></table>{filteredApplications.length === 0 && <div className="empty-state">No applications match your search.</div>}</div>
              <div className="table-footer"><span>Showing <strong>{filteredApplications.length}</strong> of <strong>{applications.length}</strong> candidates</span><button onClick={() => setActiveNav("Applications")}>Go to applications <Icon name="arrow" size={14}/></button></div>
            </article>

            <article className="panel activity-panel"><div className="panel-heading"><div><div className="section-kicker">LIVE UPDATES</div><h2>Activity</h2></div><button className="icon-button small-icon" aria-label="More activity options"><Icon name="dots"/></button></div><div className="activity-list"><div className="activity-item"><span className="activity-avatar avatar-lilac">AM</span><div><p><strong>Aarav Mehta</strong> moved to <b>Interview</b></p><span>Product Designer · Figma</span><small>12 min ago</small></div><span className="activity-line"/></div><div className="activity-item"><span className="activity-avatar company-dot">V</span><div><p><strong>Vercel</strong> posted a new opportunity</p><span>Frontend Engineer · Internship</span><small>1 hour ago</small></div><span className="activity-line"/></div><div className="activity-item"><span className="activity-avatar avatar-peach">AI</span><div><p><strong>Ananya Iyer</strong> received an offer 🎉</p><span>Data Analyst · Notion</span><small>3 hours ago</small></div><span className="activity-line"/></div><div className="activity-item"><span className="activity-avatar avatar-mint">KR</span><div><p><strong>Kabir Rao</strong> completed their profile</p><span>Profile strength · 92%</span><small>Yesterday</small></div></div></div><button className="activity-link" onClick={() => setActiveNav("Applications")}>See all activity <Icon name="arrow" size={14}/></button></article>
          </section>

          <section className="panel jobs-panel"><div className="panel-heading"><div><div className="section-kicker">OPEN ROLES</div><h2>Opportunities <span className="heading-count">{jobs.length}</span></h2></div><button className="text-button" onClick={() => setJobModal(true)}><Icon name="plus" size={15}/> Add opportunity</button></div><div className="job-grid">{jobs.slice(0, 3).map((job) => <article className="job-card" key={job.id}><div className="job-card-top"><span className={`company-logo ${job.color}`}>{job.logo}</span><button className="row-more" aria-label={`Options for ${job.title}`} onClick={() => setNotice(`${job.title} at ${job.company}`)}><Icon name="dots"/></button></div><h3>{job.title}</h3><p className="job-company">{job.company}<span>·</span>{job.type}</p><p className="job-location">{job.location}</p><div className="job-card-bottom"><span className="job-applicant-stack"><i>AM</i><i>DS</i><i>+{Math.max(0, job.applicants - 2)}</i></span><span><strong>{job.applicants}</strong> applicants</span><button aria-label={`View ${job.title}`} onClick={() => { setActiveNav("Opportunities"); setNotice(`${job.title} · ${job.applicants} applicants`); }}><Icon name="arrow" size={16}/></button></div></article>)}</div></section>

          <footer className="page-footer"><span>Made for people building what&apos;s next <span>✳</span></span><span>HireTrack · Placement season 2026</span></footer>
        </div>
      </main>

      {jobModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setJobModal(false); }}><form className="job-modal" onSubmit={createJob}><div className="modal-top"><div><div className="section-kicker">NEW OPPORTUNITY</div><h2>Post a role</h2><p>Share a new opening with your campus community.</p></div><button className="icon-button" type="button" onClick={() => setJobModal(false)} aria-label="Close"><Icon name="close"/></button></div><label>Role title<input name="title" placeholder="e.g. Product Designer" required autoFocus/></label><label>Company<input name="company" placeholder="e.g. Figma" required/></label><div className="form-row"><label>Work type<select name="type"><option>Full-time</option><option>Internship</option><option>Part-time</option></select></label><label>Location<input name="location" placeholder="e.g. Bengaluru · Hybrid"/></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setJobModal(false)}>Cancel</button><button className="primary-button" type="submit"><Icon name="plus" size={16}/> Publish opportunity</button></div></form></div>}
      {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><Icon name="close" size={15}/></button></div>}
    </div>
  );
}
