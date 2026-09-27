"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient, getSupabaseConfig } from "@/lib/supabase";

export default function StudentProfilePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [university, setUniversity] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [skills, setSkills] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!getSupabaseConfig()) return;
    void (async () => {
      const client = createBrowserSupabaseClient();
      const { data } = await client.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }
      const userId = data.session.user.id;
      const [{ data: profile }, { data: student }] = await Promise.all([
        client.from("profiles").select("full_name, role").eq("id", userId).single(),
        client.from("student_profiles").select("university, major, graduation_year, skills").eq("user_id", userId).single(),
      ]);
      if (profile?.role !== "student") { router.replace("/"); return; }
      setFullName(profile.full_name || ""); setUniversity(student?.university || ""); setMajor(student?.major || "");
      setYear(student?.graduation_year?.toString() || ""); setSkills((student?.skills || []).join(", "));
    })().catch(() => setNotice("Could not load your profile. Please sign in again."));
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const client = createBrowserSupabaseClient();
    const { data } = await client.auth.getSession();
    if (!data.session) { setNotice("Your session expired. Sign in again to save your profile."); setBusy(false); return; }
    const { error: nameError } = await client.from("profiles").update({ full_name: fullName.trim() }).eq("id", data.session.user.id);
    const { error } = await client.from("student_profiles").update({ university: university.trim(), major: major.trim(), graduation_year: year ? Number(year) : null, skills: skills.split(",").map((skill) => skill.trim()).filter(Boolean).slice(0, 30), updated_at: new Date().toISOString() }).eq("user_id", data.session.user.id);
    setNotice(nameError?.message || error?.message || "Your profile has been saved."); setBusy(false);
  }

  return <main className="auth-page"><section className="auth-card profile-editor"><a className="brand auth-brand" href="/student"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><div className="auth-eyebrow">CANDIDATE PROFILE</div><h1>Tell your story<span className="heading-period">.</span></h1><p className="auth-subtitle">Give placement teams a clear picture of your education and strengths.</p><form className="auth-form" onSubmit={save}><label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2}/></label><label>University<input value={university} onChange={(event) => setUniversity(event.target.value)} placeholder="BHARATH INSTITUTE OF HIGHER EDUCATION AND RESEARCH"/></label><label>Major or degree<input value={major} onChange={(event) => setMajor(event.target.value)} placeholder="e.g. Computer Science"/></label><label>Graduation year<input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} placeholder="2027"/></label><label>Skills <small>Separate each skill with a comma</small><input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="React, Python, Figma"/></label>{notice && <p className="auth-message" role="status">{notice}</p>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></form><a className="profile-back" href="/student">← Back to your placements</a></section></main>;
}
