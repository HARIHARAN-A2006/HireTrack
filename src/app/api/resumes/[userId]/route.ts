import { authenticateRequest, isAuthFailure } from "@/lib/api-auth";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return auth;
  const { userId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return Response.json({ error: "Provide a valid candidate ID." }, { status: 422 });
  if (auth.role === "student" && auth.userId !== userId) return Response.json({ error: "You can only view your own resume." }, { status: 403 });

  const { data: profile, error: profileError } = await auth.supabase
    .from("student_profiles")
    .select("resume_path, resume_file_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) return Response.json({ error: profileError.message }, { status: 400 });
  if (!profile?.resume_path || !profile.resume_file_name) return Response.json({ error: "This candidate has not uploaded a resume." }, { status: 404 });

  const safeFileName = profile.resume_file_name.replace(/["\\\r\n]/g, "_").slice(0, 255);
  const { data, error } = await auth.supabase.storage
    .from("candidate-resumes")
    .createSignedUrl(profile.resume_path, 90, { download: safeFileName });
  if (error || !data?.signedUrl) return Response.json({ error: "You do not have access to this resume, or the file is no longer available." }, { status: 404 });

  if (new URL(request.url).searchParams.get("format") === "json") {
    return Response.json({ url: data.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      "Cache-Control": "private, no-store",
    },
  });
}
