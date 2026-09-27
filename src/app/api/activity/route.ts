import { authenticateRequest, isAuthFailure } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role === "student") return Response.json({ error: "Activity feed is for placement staff." }, { status: 403 });
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") || 20), 1), 100);
  const { data, error } = await auth.supabase.from("application_events")
    .select("id, application_id, actor_id, from_stage, to_stage, note, created_at, profiles!application_events_actor_id_fkey(full_name), applications(id, student_id, profiles!applications_student_id_fkey(full_name), jobs(title, companies(name)))")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data });
}
