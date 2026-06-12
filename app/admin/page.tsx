import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { aggregateUserStats } from "@/lib/admin";
import type { Profile } from "@/lib/types";
import AdminUsers from "@/components/AdminUsers";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (!me?.is_admin) redirect("/");

  const { data: profiles } = await supabase
    .from("profiles").select("id,email,full_name,avatar_url,is_admin,created_at");
  const { data: matches } = await supabase.from("matches").select("owner,is_public,listed");
  const stats = aggregateUserStats((profiles as Profile[]) ?? [], (matches as any[]) ?? []);
  return <AdminUsers stats={stats} email={auth.user.email ?? null} />;
}
