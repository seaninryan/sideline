import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { createClient } from "@/lib/supabase/server";
import { buildModel } from "@/lib/model";
import { buildScoreCardSVG } from "@/lib/infographic";
import { isUuid } from "@/lib/util";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Match score card";

const assetsDir = join(process.cwd(), "assets");

export default async function Image({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("data,is_public")
    .eq(isUuid(params.id) ? "id" : "short_code", params.id)
    .eq("is_public", true)
    .maybeSingle();

  const row = data as Pick<MatchRow, "data" | "is_public"> | null;
  const model = row
    ? buildModel(row.data)
    : { homeName: "Here We Go", awayName: "", homeColors: ["#0c3b2a", "#1f7a4d"], awayColors: ["#c0392b", "#2c5fa8"], homeTotals: { g: 0, p: 0, str: "", total: 0 }, awayTotals: { g: 0, p: 0, str: "", total: 0 }, grade: "", sport: "", outcome: { winner: null, margin: 0 }, ht: "", dateStr: "" };
  // INVARIANT: the score card renders only team names, score, grade and result —
  // NO individual player names — so it needs no applyNameDisplay() redaction. If
  // buildScoreCardSVG ever adds a scorer/lineup line, run the model through
  // applyNameDisplay(model, row.name_display) here first, or it leaks youth names.
  const { svg } = buildScoreCardSVG(model as any);

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: {
      fontDirs: [assetsDir],
      defaultFontFamily: "Liberation Sans",
      loadSystemFonts: false,
    },
  });
  const rendered = resvg.render();
  const pngBuf = rendered.asPng();
  const png = pngBuf.buffer.slice(pngBuf.byteOffset, pngBuf.byteOffset + pngBuf.byteLength) as ArrayBuffer;
  return new Response(png, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
