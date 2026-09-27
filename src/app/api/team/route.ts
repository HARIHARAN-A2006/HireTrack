import { authenticateRequest, isAuthFailure } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role !== "officer") return Response.json({ error: "Only placement officers can manage recruiter access." }, { status: 403 });
  const [{ data: companies, error: companyError }, { data: memberships, error: memberError }] = await Promise.all([
    auth.supabase.from("companies").select("id, name").order("name"),
    auth.supabase.from("company_memberships").select("id, active, created_at, companies(id, name), recruiter:profiles!company_memberships_user_id_fkey(id, full_name, email)").order("created_at", { ascending: false }),
  ]);
  if (companyError || memberError) return Response.json({ error: companyError?.message ?? memberError?.message }, { status: 400 });
  return Response.json({ companies, memberships });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role !== "officer") return Response.json({ error: "Only placement officers can manage recruiter access." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9a-f-]{36}$/i.test(companyId)) {
    return Response.json({ error: "Enter a valid recruiter email and select a company." }, { status: 422 });
  }
  const { data, error } = await auth.supabase.rpc("assign_recruiter_to_company", { target_email: email, target_company_id: companyId });
  if (error) return Response.json({ error: error.message }, { status: error.code === "P0002" ? 404 : 400 });
  return Response.json({ data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role !== "officer") return Response.json({ error: "Only placement officers can manage recruiter access." }, { status: 403 });
  const membershipId = new URL(request.url).searchParams.get("membershipId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(membershipId)) return Response.json({ error: "Provide a valid company membership." }, { status: 422 });
  const { error } = await auth.supabase.from("company_memberships").update({ active: false }).eq("id", membershipId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true });
}
