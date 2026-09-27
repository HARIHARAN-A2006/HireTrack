import { authenticateRequest, isAuthFailure } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  const params = new URL(request.url).searchParams;
  let query = auth.supabase.from("applications").select("*, profiles!applications_student_id_fkey(id, full_name, email), jobs(id, title, employment_type, location, companies(name))").order("applied_at", { ascending: false });
  const stage = params.get("stage");
  const jobId = params.get("jobId");
  if (stage) query = query.eq("stage", stage);
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role !== "student") return Response.json({ error: "Only student accounts can apply to opportunities." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  if (typeof body.jobId !== "string") return Response.json({ error: "A jobId is required." }, { status: 422 });
  const { data, error } = await auth.supabase.from("applications").insert({
    job_id: body.jobId, student_id: auth.userId,
    cover_note: typeof body.coverNote === "string" ? body.coverNote.trim().slice(0, 3000) : "",
  }).select("*").single();
  if (error?.code === "23505") return Response.json({ error: "You have already applied for this opportunity." }, { status: 409 });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (!(["officer", "recruiter"] as string[]).includes(auth.role)) return Response.json({ error: "Only placement staff can update candidate stages." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  const allowed = ["applied", "screening", "interview", "offer", "rejected", "withdrawn"];
  if (typeof body.applicationId !== "string" || typeof body.stage !== "string" || !allowed.includes(body.stage)) {
    return Response.json({ error: "Provide an applicationId and a valid stage." }, { status: 422 });
  }
  const { data, error } = await auth.supabase.from("applications").update({ stage: body.stage, updated_at: new Date().toISOString() }).eq("id", body.applicationId).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 400 });
  return Response.json({ data });
}
