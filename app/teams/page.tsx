import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TeamsList from "@/components/TeamsList";

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");
  return <TeamsList userId={data.user.id} email={data.user.email ?? null} />;
}
