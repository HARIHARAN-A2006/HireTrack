"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    try {
      const supabase = createBrowserSupabaseClient();
      if (register) {
        const fullName = String(form.get("fullName") || "").trim();
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (signUpError) throw signUpError;
        if (!data.session) { setMessage("Check your email to confirm your account, then come back to sign in."); return; }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      router.replace("/"); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Check your details and try again.");
    } finally { setBusy(false); }
  }

  return <main className="auth-page"><div className="auth-card"><a className="brand auth-brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><div className="auth-eyebrow">CAMPUS PLACEMENTS, CLEARLY</div><h1>{register ? "Start your journey" : "Welcome back"}<span className="heading-period">.</span></h1><p className="auth-subtitle">{register ? "Create your student account to explore opportunities." : "Sign in to follow your placement progress."}</p><form onSubmit={submit} className="auth-form">{register && <label>Full name<input name="fullName" autoComplete="name" placeholder="Your name" required minLength={2}/></label>}<label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@college.edu" required/></label><label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} placeholder="At least 8 characters" required minLength={8}/></label>{error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="auth-message" role="status">{message}</p>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait…" : register ? "Create student account" : "Sign in"}</button></form><div className="auth-switch">{register ? "Already have an account?" : "New to HireTrack?"} <button onClick={() => { setRegister(!register); setError(""); setMessage(""); }}>{register ? "Sign in" : "Create an account"}</button></div><p className="auth-note">Placement officers: ask your project administrator to assign your officer role after account creation.</p></div><div className="auth-footer">Built for the next generation of talent <span>✳</span></div></main>;
}
