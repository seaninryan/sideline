import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { buildModel } from "@/lib/model";
import { applyNameDisplay } from "@/lib/name-display";
import PublicMatch from "@/components/PublicMatch";
import type { MatchRow } from "@/lib/types";

async function fetchPublic(id: string): Promise<MatchRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("id,data,is_public,name_display")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();
  return (data as MatchRow) || null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const row = await fetchPublic(params.id);
  if (!row) return { title: "Sideline" };
  const m = buildModel(row.data);
  const title = `${m.usName} ${m.totals.us.str} – ${m.totals.them.str} ${m.themName}`;
  return { title: `${title} · Sideline`, openGraph: { title, type: "website" } };
}

export default async function PublicMatchPage({ params }: { params: { id: string } }) {
  const row = await fetchPublic(params.id);
  if (!row) notFound();
  const model = applyNameDisplay(buildModel(row.data), row.name_display || row.data.nameDisplay || "full");
  return <PublicMatch model={model} />;
}
