import { authenticateRequest, isAuthFailure } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role === "student") return Response.json({ error: "Interview management is for placement staff." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  let query = auth.supabase.from("interview_rounds").select("*, interview_notes(body), applications(id, student_id, profiles!applications_student_id_fkey(full_name), jobs(title, companies(name)))").order("scheduled_at", { ascending: true });
  const applicationId = params.get("applicationId");
  if (applicationId) query = query.eq("application_id", applicationId);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role === "student") return Response.json({ error: "Only placement staff can schedule interviews." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : "";
  const meetingUrl = typeof body.meetingUrl === "string" ? body.meetingUrl.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || title.length < 2 || title.length > 120 || !Number.isFinite(Date.parse(scheduledAt))) {
    return Response.json({ error: "Provide an application, interview title, and valid date/time." }, { status: 422 });
  }
  if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) return Response.json({ error: "Meeting link must start with https:// or http://." }, { status: 422 });
  const { data: previous, error: readError } = await auth.supabase.from("interview_rounds").select("round_number").eq("application_id", applicationId).order("round_number", { ascending: false }).limit(1);
  if (readError) return Response.json({ error: readError.message }, { status: 400 });
  const { data, error } = await auth.supabase.from("interview_rounds").insert({
    application_id: applicationId,
    round_number: (previous?.[0]?.round_number ?? 0) + 1,
    title,
    scheduled_at: new Date(scheduledAt).toISOString(),
    meeting_url: meetingUrl || null,
    created_by: auth.userId,
  }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role === "student") return Response.json({ error: "Only placement staff can update interview feedback." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  const interviewId = typeof body.interviewId === "string" ? body.interviewId : "";
  const internalNote = typeof body.internalNote === "string" ? body.internalNote.trim().slice(0, 5000) : "";
  const candidateFeedback = typeof body.candidateFeedback === "string" ? body.candidateFeedback.trim().slice(0, 2000) : "";
  const status = typeof body.status === "string" ? body.status : "completed";
  if (!/^[0-9a-f-]{36}$/i.test(interviewId) || !["scheduled", "completed", "cancelled"].includes(status)) {
    return Response.json({ error: "Provide a valid interview and status." }, { status: 422 });
  }
  const { data, error } = await auth.supabase.from("interview_rounds").update({ candidate_feedback: candidateFeedback, status, updated_at: new Date().toISOString() }).eq("id", interviewId).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  const { error: noteError } = await auth.supabase.from("interview_notes").upsert({ interview_id: interviewId, author_id: auth.userId, body: internalNote, updated_at: new Date().toISOString() }, { onConflict: "interview_id" });
  if (noteError) return Response.json({ error: noteError.message }, { status: 400 });
  return Response.json({ data });
}
