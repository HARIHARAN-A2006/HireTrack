import { authenticateRequest, isAuthFailure } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  const applicationId = new URL(request.url).searchParams.get("applicationId");
  let query = auth.supabase.from("application_messages").select("id, application_id, sender_id, recipient_id, body, read_at, created_at, sender:profiles!application_messages_sender_id_fkey(full_name, email), recipient:profiles!application_messages_recipient_id_fkey(full_name, email)").order("created_at", { ascending: true });
  if (applicationId) query = query.eq("application_id", applicationId);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  const message = typeof body.body === "string" ? body.body.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !message || message.length > 5000) {
    return Response.json({ error: "Choose an application and write a message of up to 5,000 characters." }, { status: 422 });
  }
  const { data: recipientId, error: contactError } = await auth.supabase.rpc("get_application_contact", { target_application_id: applicationId });
  if (contactError) return Response.json({ error: contactError.message }, { status: 400 });
  if (!recipientId) return Response.json({ error: "No placement or recruiter contact is assigned to this application yet." }, { status: 409 });
  const { data, error } = await auth.supabase.from("application_messages").insert({ application_id: applicationId, sender_id: auth.userId, recipient_id: recipientId, body: message }).select("id, application_id, sender_id, recipient_id, body, created_at").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  const ids = Array.isArray(body.messageIds) ? body.messageIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) : [];
  if (!ids.length) return Response.json({ error: "Choose messages to mark as read." }, { status: 422 });
  const { error } = await auth.supabase.from("application_messages").update({ read_at: new Date().toISOString() }).in("id", ids).eq("recipient_id", auth.userId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true });
}
