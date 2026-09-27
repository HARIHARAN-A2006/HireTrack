import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase";

export type AppRole = "student" | "officer" | "recruiter";
export type AuthContext = { supabase: SupabaseClient; userId: string; role: AppRole };

export async function authenticateRequest(request: Request): Promise<AuthContext | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const config = getSupabaseConfig();
  if (!config) return Response.json({ error: "The server is not configured for authentication." }, { status: 503 });

  const supabase = createClient(config.url, config.key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) return Response.json({ error: "Your session is invalid or has expired." }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profileError || !profile) return Response.json({ error: "Your HireTrack profile could not be found." }, { status: 403 });
  return { supabase, userId: userData.user.id, role: profile.role as AppRole };
}

export function isAuthFailure(value: AuthContext | Response): value is Response {
  return value instanceof Response;
}
