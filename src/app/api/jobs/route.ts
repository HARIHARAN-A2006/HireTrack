import { createClient } from "@supabase/supabase-js";
import { authenticateRequest, isAuthFailure } from "@/lib/api-auth";
import { getSupabaseConfig } from "@/lib/supabase";

export async function GET(request: Request) {
  const config = getSupabaseConfig();
  if (!config) return Response.json({ error: "Database is not configured." }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabase = createClient(config.url, config.key, token ? {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  } : { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const params = new URL(request.url).searchParams;
  const selection = token ? "*, companies(name, logo_url), applications(count)" : "*, companies(name, logo_url)";
  let query = supabase.from("jobs").select(selection).order("created_at", { ascending: false });
  const search = params.get("search")?.trim();
  const status = params.get("status");
  if (search) query = query.ilike("title", `%${search.replace(/[%_,]/g, " ")}%`);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (!(["officer", "recruiter"] as string[]).includes(auth.role)) return Response.json({ error: "Only placement staff can publish opportunities." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const companyName = typeof body.company === "string" ? body.company.trim() : "";
  if (title.length < 2 || title.length > 120 || companyName.length < 2 || companyName.length > 100) {
    return Response.json({ error: "Add a role title (2–120 characters) and company name (2–100 characters)." }, { status: 422 });
  }
  const { data: company, error: companyError } = await auth.supabase.from("companies").insert({ name: companyName, created_by: auth.userId }).select("id").single();
  if (companyError || !company) return Response.json({ error: companyError?.message ?? "Could not create company." }, { status: 400 });
  const { data, error } = await auth.supabase.from("jobs").insert({
    company_id: company.id, created_by: auth.userId, title,
    description: typeof body.description === "string" ? body.description.trim() : "",
    employment_type: typeof body.employmentType === "string" ? body.employmentType : "Full-time",
    location: typeof body.location === "string" ? body.location : "Remote",
    skill_tags: Array.isArray(body.skills) ? body.skills.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    status: body.status === "draft" ? "draft" : "published",
  }).select("*, companies(name, logo_url)").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data }, { status: 201 });
}
