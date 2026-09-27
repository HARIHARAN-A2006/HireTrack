import { authenticateRequest, isAuthFailure } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role !== "officer") return Response.json({ error: "Only placement officers can view the full audit history." }, { status: 403 });
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") || 100), 1), 250);
  const { data, error } = await auth.supabase.from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, details, created_at, profiles!audit_logs_actor_id_fkey(full_name, email)")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data });
}
