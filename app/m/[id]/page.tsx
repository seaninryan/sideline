import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { buildModel } from "@/lib/model";
import { applyNameDisplay } from "@/lib/name-display";
import { isUuid } from "@/lib/util";
import PublicMatch from "@/components/PublicMatch";
import type { MatchRow } from "@/lib/types";

// The [id] segment is either a short_code (new links) or a full UUID (legacy links).
async function fetchPublic(slug: string): Promise<MatchRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("id,data,is_public,name_display,short_code")
    .eq(isUuid(slug) ? "id" : "short_code", slug)
    .eq("is_public", true)
    .maybeSingle();
  return (data as MatchRow) || null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const row = await fetchPublic(params.id);
  if (!row) return { title: "Here We Go" };
  const m = buildModel(row.data);
  const title = `${m.usName} ${m.totals.us.str} – ${m.totals.them.str} ${m.themName}`;
  const description = [m.grade, m.dateStr, m.result].filter(Boolean).join(" · ") || "Match report on Here We Go";
  const url = `/m/${params.id}`;
  return {
    title: `${title} · Here We Go`,
    description,
    openGraph: { title, description, url, siteName: "Here We Go", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicMatchPage({ params }: { params: { id: string } }) {
  const row = await fetchPublic(params.id);
  if (!row) notFound();
  const model = applyNameDisplay(buildModel(row.data), row.name_display || row.data.nameDisplay || "full");
  return <PublicMatch model={model} />;
}
