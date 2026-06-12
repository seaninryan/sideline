import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import AdminUserMatches, { type AdminMatch } from "@/components/AdminUserMatches";

export default async function AdminUserPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (!me?.is_admin) redirect("/");

  const { data: profile } = await supabase
    .from("profiles").select("id,email,full_name,avatar_url,is_admin,created_at").eq("id", params.id).maybeSingle();
  if (!profile) notFound();
  const { data: rows } = await supabase
    .from("matches").select("id,data,is_public,short_code").eq("owner", params.id).order("updated_at", { ascending: false });

  return <AdminUserMatches profile={profile as Profile} matches={(rows as AdminMatch[]) ?? []} email={auth.user.email ?? null} />;
}
