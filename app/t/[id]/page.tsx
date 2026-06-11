import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/util";
import { redactRoster } from "@/lib/name-display";
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
  return { title: `${t.name}${t.squad ? " · " + t.squad : ""} · Here We Go`, description: `${t.name}${t.squad ? " · " + t.squad : ""} squad on Here We Go` };
}

export default async function TeamRoutePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const team = await fetchTeam(params.id);
  if (!team) notFound();
  const isOwner = !!auth.user && auth.user.id === team.owner;
  const { data: fx } = await supabase
    .from("matches")
    .select("id,short_code,data,match_date,home_team_id,away_team_id")
    .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
    .eq("is_public", true)
    .order("match_date", { ascending: false, nullsFirst: false })
    .limit(50);
  const fixtures = (fx || []).map((r: any) => ({ id: r.id, href: `/m/${r.short_code || r.id}`, data: r.data, date: r.match_date || r.data?.matchDate || r.data?.date || null }));
  // public viewers see player names redacted per the team's name_display; the owner sees full
  if (!isOwner) team.roster = redactRoster(team.roster, team.name_display || "full");
  delete (team as any).owner; // don't ship the owner uuid to the public client
  return <TeamPage team={team} isOwner={isOwner} fixtures={fixtures} />;
}
