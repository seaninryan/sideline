import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/util";
import TeamPage from "@/components/TeamPage";
import type { TeamRecord } from "@/lib/types";

async function fetchTeam(slug: string): Promise<TeamRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("teams").select("*")
    .eq(isUuid(slug) ? "id" : "short_code", slug).maybeSingle();
  return (data as TeamRecord) || null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const t = await fetchTeam(params.id);
  if (!t) return { title: "Here We Go" };
  return { title: `${t.name} · Here We Go`, description: `${t.name} squad on Here We Go` };
}

export default async function TeamRoutePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const team = await fetchTeam(params.id);
  if (!team) notFound();
  return <TeamPage team={team} isOwner={!!auth.user && auth.user.id === team.owner} />;
}
