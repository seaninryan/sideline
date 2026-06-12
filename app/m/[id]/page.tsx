import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { buildModel } from "@/lib/model";
import { applyNameDisplay } from "@/lib/name-display";
import { isUuid } from "@/lib/util";
import { resolveMatchView } from "@/lib/match-view";
import PublicMatch from "@/components/PublicMatch";
import EditorApp from "@/components/EditorApp";
import type { MatchRow } from "@/lib/types";

// Fetch by short_code (new links) or UUID (legacy/private). NO is_public filter:
// RLS returns the row when the viewer owns it OR it is public, and we branch below.
async function fetchRow(slug: string): Promise<MatchRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("id,owner,data,is_public,name_display,short_code")
    .eq(isUuid(slug) ? "id" : "short_code", slug)
    .maybeSingle();
  return (data as MatchRow) || null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  if (params.id === "new") return { title: "New match · Here We Go" };
  const row = await fetchRow(params.id);
  if (!row || !row.is_public) return { title: "Here We Go" };
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

export default async function MatchPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const viewerId = auth.user?.id ?? null;

  // "new" sentinel: the create flow. Requires sign-in; opens the wizard.
  if (params.id === "new") {
    if (!viewerId) redirect("/");
    return <EditorApp wizard />;
  }

  const row = await fetchRow(params.id);

  let isAdmin = false;
  if (viewerId && row && row.owner !== viewerId && !row.is_public) {
    const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", viewerId).maybeSingle();
    isAdmin = !!me?.is_admin;
  }

  const kind = resolveMatchView({
    found: !!row,
    isOwner: !!row && !!viewerId && row.owner === viewerId,
    isPublic: !!row && !!row.is_public,
    isAdmin,
  });

  if (kind === "notfound") notFound();
  if (kind === "editor") return <EditorApp initialId={row!.id} />;

  // public read-only
  const model = applyNameDisplay(buildModel(row!.data), row!.name_display || row!.data.nameDisplay || "full");
  return <PublicMatch model={model} id={row!.id} />;
}
