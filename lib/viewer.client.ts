import type { SupabaseClient } from "@supabase/supabase-js";

// Whether the signed-in user is an admin. Reads their own profile row (RLS
// self-read). Swallows any error (table/column absent before the migration runs,
// or signed out) → false, so the menu degrades gracefully.
export async function fetchIsAdmin(sb: SupabaseClient, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await sb.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    return !!data?.is_admin;
  } catch {
    return false;
  }
}
