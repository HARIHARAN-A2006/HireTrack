import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAuthEvent(client: SupabaseClient, event: "login" | "logout") {
  try {
    await client.rpc("log_auth_event", { target_event: event });
  } catch {
    // Auth should continue working if optional audit storage has not been migrated yet.
  }
}
