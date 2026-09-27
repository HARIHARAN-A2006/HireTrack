"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Props = { userId: string; children: React.ReactNode; className?: string };

export function ResumeDownloadLink({ userId, children, className }: Props) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired. Sign in again to view this resume.");
      const response = await fetch(`/api/resumes/${encodeURIComponent(userId)}?format=json`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "Could not open this resume.");
      if (tab) tab.location.replace(result.url);
      else window.location.assign(result.url);
    } catch (error) {
      tab?.close();
      window.alert(error instanceof Error ? error.message : "Could not open this resume.");
    } finally {
      setBusy(false);
    }
  }

  return <button type="button" className={className} onClick={() => void download()} disabled={busy} aria-busy={busy}>
    {busy ? "Preparing resume…" : children}
  </button>;
}
