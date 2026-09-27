"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { logAuthEvent } from "@/lib/audit";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetRequest, setResetRequest] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => { if (new URLSearchParams(window.location.search).get("mode") === "reset") setRecoveryMode(true); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    try {
      const supabase = createBrowserSupabaseClient();
      if (resetRequest) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login?mode=reset` });
        if (resetError) throw resetError;
        setMessage("If an account exists for that email, a password reset link has been sent."); setResetRequest(false); return;
      }
      if (recoveryMode) {
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) throw passwordError;
        setRecoveryMode(false); setMessage("Your password has been updated. You can sign in with it now.");
        await supabase.auth.signOut(); return;
      }
      if (register) {
        const fullName = String(form.get("fullName") || "").trim();
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (signUpError) throw signUpError;
        if (!data.session) { setMessage("Check your email to confirm your account, then come back to sign in."); return; }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        if (data.session) await logAuthEvent(supabase, "login");
      }
      const requestedReturn = new URLSearchParams(window.location.search).get("returnTo");
      const returnTo = requestedReturn?.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/";
      router.replace(returnTo); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Check your details and try again.");
    } finally { setBusy(false); }
  }

  const isResetForm = recoveryMode || resetRequest;
  return <main className="auth-page"><div className="auth-card"><a className="brand auth-brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>hiretrack<span className="brand-dot">.</span></span></a><div className="auth-eyebrow">CAMPUS PLACEMENTS, CLEARLY</div><h1>{recoveryMode ? "Choose a new password" : resetRequest ? "Reset your password" : register ? "Start your journey" : "Welcome back"}<span className="heading-period">.</span></h1><p className="auth-subtitle">{recoveryMode ? "Set a new password for your HireTrack account." : resetRequest ? "We’ll email you a secure link to reset your password." : register ? "Create your student account to explore opportunities." : "Sign in to follow your placement progress."}</p><form onSubmit={submit} className="auth-form">{register && <label>Full name<input name="fullName" autoComplete="name" placeholder="Your name" required minLength={2}/></label>}<label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@college.edu" required/></label>{!resetRequest && <label>{recoveryMode ? "New password" : "Password"}<input name="password" type="password" autoComplete={register || recoveryMode ? "new-password" : "current-password"} placeholder="At least 8 characters" required minLength={8}/></label>}{error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="auth-message" role="status">{message}</p>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait…" : recoveryMode ? "Save new password" : resetRequest ? "Send reset link" : register ? "Create student account" : "Sign in"}</button></form>{!register && !recoveryMode && <div className="auth-switch"><button onClick={() => { setResetRequest(!resetRequest); setError(""); setMessage(""); }}>{resetRequest ? "Back to sign in" : "Forgot your password?"}</button></div>} {!isResetForm && <div className="auth-switch">{register ? "Already have an account?" : "New to HireTrack?"} <button onClick={() => { setRegister(!register); setError(""); setMessage(""); }}>{register ? "Sign in" : "Create an account"}</button></div>}<p className="auth-note">Students can register here. Placement officers assign recruiter accounts to their company from Recruiter access.</p></div><div className="auth-footer">Built for the next generation of talent <span>✳</span></div></main>;
}
