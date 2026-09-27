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
  const jobId = params.get("jobId")?.trim();
  const skill = params.get("skill")?.trim();
  const status = params.get("status");
  if (jobId && !/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "Provide a valid opportunity ID." }, { status: 422 });
  if (search) query = query.ilike("title", `%${search.replace(/[%_,]/g, " ")}%`);
  if (jobId) query = query.eq("id", jobId);
  if (skill) query = query.contains("skill_tags", [skill]);
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
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const employmentType = typeof body.employmentType === "string" ? body.employmentType.trim() : "Full-time";
  const location = typeof body.location === "string" ? body.location.trim() : "Remote";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const applicationDeadline = typeof body.applicationDeadline === "string" ? body.applicationDeadline.trim() : "";
  const validDeadline = !applicationDeadline || (/^\d{4}-\d{2}-\d{2}$/.test(applicationDeadline)
    && !Number.isNaN(Date.parse(`${applicationDeadline}T00:00:00.000Z`))
    && new Date(`${applicationDeadline}T00:00:00.000Z`).toISOString().slice(0, 10) === applicationDeadline);
  const allowedEmploymentTypes = ["Full-time", "Internship", "Part-time", "Contract"];
  if (title.length < 2 || title.length > 120 || (auth.role === "officer" && (companyName.length < 2 || companyName.length > 100)) || (auth.role === "recruiter" && !/^[0-9a-f-]{36}$/i.test(companyId)) || !allowedEmploymentTypes.includes(employmentType) || location.length > 200 || description.length > 10000 || !validDeadline) {
    return Response.json({ error: "Check the role title, company, work type, location, and description fields." }, { status: 422 });
  }
  let resolvedCompanyId = companyId;
  if (auth.role === "officer") {
    const { data: existing } = await auth.supabase.from("companies").select("id").ilike("name", companyName).limit(1).maybeSingle();
    resolvedCompanyId = existing?.id || "";
    if (!resolvedCompanyId) {
      const { data: company, error: companyError } = await auth.supabase.from("companies").insert({ name: companyName, created_by: auth.userId }).select("id").single();
      if (companyError || !company) return Response.json({ error: companyError?.message ?? "Could not create company." }, { status: 400 });
      resolvedCompanyId = company.id;
    }
  } else {
    const { data: membership, error: membershipError } = await auth.supabase.from("company_memberships").select("company_id").eq("user_id", auth.userId).eq("company_id", companyId).eq("active", true).maybeSingle();
    if (membershipError || !membership) return Response.json({ error: "You can only post opportunities for a company assigned to your recruiter account." }, { status: 403 });
    resolvedCompanyId = membership.company_id;
  }
  const { data, error } = await auth.supabase.from("jobs").insert({
    company_id: resolvedCompanyId, created_by: auth.userId, title,
    description,
    employment_type: employmentType,
    location: location || "Remote",
    application_deadline: applicationDeadline || null,
    skill_tags: Array.isArray(body.skills) ? body.skills.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0 && item.length <= 80).slice(0, 30) : [],
    status: body.status === "draft" ? "draft" : "published",
  }).select("*, companies(name, logo_url)").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (auth.role === "student") return Response.json({ error: "Only placement staff can update opportunities." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request body." }, { status: 400 }); }
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "Provide a valid opportunity ID." }, { status: 422 });
  const updates: Record<string, string | string[] | null> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (title.length < 2 || title.length > 120) return Response.json({ error: "Role title must be between 2 and 120 characters." }, { status: 422 });
    updates.title = title;
  }
  if (typeof body.employmentType === "string") {
    if (!["Full-time", "Internship", "Part-time", "Contract"].includes(body.employmentType)) return Response.json({ error: "Choose a valid employment type." }, { status: 422 });
    updates.employment_type = body.employmentType;
  }
  if (typeof body.location === "string") {
    const location = body.location.trim();
    if (location.length > 200) return Response.json({ error: "Location must be 200 characters or fewer." }, { status: 422 });
    updates.location = location || "Remote";
  }
  if (typeof body.description === "string") {
    const description = body.description.trim();
    if (description.length > 10000) return Response.json({ error: "Role details must be 10,000 characters or fewer." }, { status: 422 });
    updates.description = description;
  }
  if (Object.hasOwn(body, "applicationDeadline")) {
    const deadline = body.applicationDeadline;
    if (deadline === null || deadline === "") updates.application_deadline = null;
    else if (typeof deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && !Number.isNaN(Date.parse(`${deadline}T00:00:00.000Z`)) && new Date(`${deadline}T00:00:00.000Z`).toISOString().slice(0, 10) === deadline) updates.application_deadline = deadline;
    else return Response.json({ error: "Enter a valid application deadline." }, { status: 422 });
  }
  if (Object.hasOwn(body, "skills")) {
    if (!Array.isArray(body.skills) || body.skills.some((skill) => typeof skill !== "string" || skill.trim().length > 80)) return Response.json({ error: "Skills must be a list of text values up to 80 characters each." }, { status: 422 });
    updates.skill_tags = body.skills.map((skill) => (skill as string).trim()).filter(Boolean).slice(0, 30);
  }
  if (typeof body.status === "string") {
    if (!["draft", "published", "closed"].includes(body.status)) return Response.json({ error: "Choose a valid opportunity status." }, { status: 422 });
    updates.status = body.status;
  }
  if (auth.role === "officer" && typeof body.company === "string") {
    const companyName = body.company.trim();
    if (companyName.length < 2 || companyName.length > 100) return Response.json({ error: "Company name must be between 2 and 100 characters." }, { status: 422 });
    const { data: existing, error: companyLookupError } = await auth.supabase.from("companies").select("id").ilike("name", companyName).limit(1).maybeSingle();
    if (companyLookupError) return Response.json({ error: companyLookupError.message }, { status: 400 });
    let companyId = existing?.id;
    if (!companyId) {
      const { data: created, error: createError } = await auth.supabase.from("companies").insert({ name: companyName, created_by: auth.userId }).select("id").single();
      if (createError || !created) return Response.json({ error: createError?.message ?? "Could not save this company." }, { status: 400 });
      companyId = created.id;
    }
    updates.company_id = companyId;
  } else if (Object.hasOwn(body, "company")) {
    return Response.json({ error: "Recruiters cannot change the company assigned to an opportunity." }, { status: 403 });
  }
  if (Object.keys(updates).length === 1) return Response.json({ error: "Provide at least one opportunity field to update." }, { status: 422 });
  const { data, error } = await auth.supabase.from("jobs").update(updates).eq("id", jobId).select("*, companies(name, logo_url), applications(count)").single();
  if (error) return Response.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 400 });
  return Response.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  if (!( ["officer", "recruiter"] as string[]).includes(auth.role)) return Response.json({ error: "Only placement staff can delete opportunities." }, { status: 403 });
  const jobId = new URL(request.url).searchParams.get("jobId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "Provide a valid opportunity ID." }, { status: 422 });
  const { error } = await auth.supabase.rpc("delete_empty_draft_job", { target_job_id: jobId });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "42501" ? 403 : ["23514", "23503"].includes(error.code || "") ? 409 : 400;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ success: true });
}
