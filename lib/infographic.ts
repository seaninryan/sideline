import { contrastOn, fmtScore } from "@/lib/util";
import type { Model } from "@/lib/types";
import { BRAND_SITE, BRAND_WORDMARK, BRAND_CHANT } from "@/lib/constants";

/* Shared HWG brand pill (same geometry as the app icon / top-bar logo).
   Drawn as an SVG string so the poster and OG card share one source of truth.
   Pill text uses the rasterisation font (Liberation Sans / Arial), matching the icon. */
export function brandPillSVG(x: number, y: number, scale = 1): string {
  return `<g transform="translate(${x},${y}) scale(${scale})">`
    + `<rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" stroke-width="4"/>`
    + `<text x="64" y="50" font-family="Liberation Sans, Arial, sans-serif" font-size="40" font-weight="700" text-anchor="middle">`
    + `<tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan></text>`
    + `</g>`;
}

export function buildScoreCardSVG(m: Model): { svg: string; width: number; height: number } {
  const W = 1200, H = 630;
  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  const usS = m.totals?.us?.str ?? "0";
  const themS = m.totals?.them?.str ?? "0";
  const grade = (m.grade || m.sport || "Match").toUpperCase();
  const result = m.result || "";
  const ht = m.ht || "";
  const flag = (x: number, y: number, w: number, h: number, c1: string, c2: string) =>
    `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c1}"/>` +
    `<rect x="${x}" y="${y + h / 2}" width="${w}" height="${h / 2}" fill="${c2}"/></g>`;
  const t = (x: number, y: number, s: string, size: number, fill: string, opts: { w?: number; a?: string } = {}) =>
    `<text x="${x}" y="${y}" font-family="Liberation Sans, Arial, sans-serif" font-size="${size}" fill="${fill}" ` +
    `font-weight="${opts.w || 400}" text-anchor="${opts.a || "start"}">${esc(s)}</text>`;

  const PAPER = "#f4efe1", INK = "#0c3b2a", MUTE = "#5c6b60";
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
  parts.push(`<rect x="0" y="0" width="${W / 2}" height="10" fill="${m.colorUs}"/>`);
  parts.push(`<rect x="${W / 2}" y="0" width="${W / 2}" height="10" fill="${m.colorThem}"/>`);
  parts.push(t(W / 2, 90, grade, 34, MUTE, { w: 700, a: "middle" }));
  parts.push(flag(W * 0.25 - 40, 150, 80, 50, m.colorUs, m.colorUs2));
  parts.push(flag(W * 0.75 - 40, 150, 80, 50, m.colorThem, m.colorThem2));
  parts.push(t(W * 0.25, 250, m.usName || "Us", 44, INK, { w: 700, a: "middle" }));
  parts.push(t(W * 0.75, 250, m.themName || "Them", 44, INK, { w: 700, a: "middle" }));
  parts.push(t(W * 0.25, 410, usS, 120, INK, { w: 700, a: "middle" }));
  parts.push(t(W / 2, 400, "–", 90, MUTE, { w: 400, a: "middle" }));
  parts.push(t(W * 0.75, 410, themS, 120, INK, { w: 700, a: "middle" }));
  if (result) parts.push(t(W / 2, 500, result, 40, INK, { w: 700, a: "middle" }));
  if (ht) parts.push(t(W / 2, 545, `HT ${ht}`, 26, MUTE, { a: "middle" }));
  // brand lockup: [pill] HERE WE GO   herewego.ie
  parts.push(brandPillSVG(W / 2 - 215, 565, 0.62));        // 128*0.62 ≈ 79 wide, 70*0.62 ≈ 43 tall
  parts.push(t(W / 2 - 120, 600, BRAND_WORDMARK, 30, INK, { w: 700 }));     // anchor start
  parts.push(t(W / 2 + 130, 600, BRAND_SITE, 22, MUTE, { w: 400 }));        // anchor start

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
  return { svg, width: W, height: H };
}

/* ============================================================
   SHAREABLE INFOGRAPHIC  (pure SVG -> PNG, no external deps)
   ============================================================ */
export function buildInfographicSVG(m: Model): { svg: string; width: number; height: number } {
  const W = 420, P = 18, CW = W - 2 * P;
  const PITCH = "#0c3b2a", PAPER = "#f4efe1", INK = "#11241b", MUTE = "#6f7d72", LINE = "#ded4ba";
  const esc = (s: any) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const T = (x: number, y: number, s: any, size: number, fill: string, o: any = {}) => `<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" fill="${fill}" font-weight="${o.w || 400}" text-anchor="${o.a || "start"}"${o.ls ? ` letter-spacing="${o.ls}"` : ""}>${esc(s)}</text>`;
  const R = (x: number, y: number, w: number, h: number, fill: string, rx = 0, o: any = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${rx ? ` rx="${rx}"` : ""}${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ""}/>`;
  const L = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 1, dash = "") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const C = (cx: number, cy: number, r: number, fill: string, o: any = {}) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ""}/>`;
  const flag = (x: number, y: number, w: number, h: number, c1: string, c2: string, stroke = "rgba(0,0,0,.3)") =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h / 2}" fill="${c1}" rx="1.5"/><rect x="${x}" y="${y + h / 2}" width="${w}" height="${h / 2}" fill="${c2}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="1" rx="2"/>`;

  const head: string[] = [], body: string[] = [];
  const HH = 196;

  // ---- header band ----
  head.push(R(0, 0, W / 2, 6, m.colorUs), R(W / 2, 0, W / 2, 6, m.colorThem));
  head.push(T(P, 30, (m.grade || m.sport || "Match").toUpperCase(), 12, PAPER, { w: 700, ls: 1 }));
  head.push(T(W - P, 30, m.dateStr, 11, "#cfe3d8", { a: "end" }));
  head.push(flag(W * 0.27 - 16, 46, 32, 19, m.colorUs, m.colorUs2, "rgba(255,255,255,.55)"));
  head.push(flag(W * 0.73 - 16, 46, 32, 19, m.colorThem, m.colorThem2, "rgba(255,255,255,.55)"));
  head.push(T(W * 0.27, 84, m.usName, 15, PAPER, { w: 700, a: "middle" }));
  head.push(T(W * 0.73, 84, `${m.themName} (${m.homeAway === "home" ? "H" : "A"})`, 15, PAPER, { w: 700, a: "middle" }));
  head.push(T(W * 0.27, 132, m.totals.us.str, 44, PAPER, { w: 800, a: "middle" }));
  head.push(T(W * 0.73, 132, m.totals.them.str, 44, PAPER, { w: 800, a: "middle" }));
  head.push(T(W * 0.5, 124, "–", 24, "#7fa395", { a: "middle" }));
  const resTxt = m.result === "Win" ? "WIN" : m.result === "Loss" ? "DEFEAT" : "DRAW";
  const margin = Math.abs(m.totals.us.total - m.totals.them.total);
  const resFull = resTxt + (m.effMode === "gaa" && margin ? ` BY ${margin}` : "");
  const resBg = m.result === "Win" ? "#f5c518" : m.result === "Loss" ? "#c0392b" : "#e7dec6";
  const resFg = m.result === "Loss" ? "#ffffff" : "#11241b";
  const cw = resFull.length * 7.6 + 24;
  head.push(R(W / 2 - cw / 2, 152, cw, 24, resBg, 12));
  head.push(T(W / 2, 168, resFull, 11.5, resFg, { w: 700, a: "middle", ls: 1 }));

  let y = HH + 20;

  // ---- stats 2x2 ----
  const stats = [["Half-time", m.ht], ["Lead changes", String(m.leadChanges)], ["Times level", String(m.timesLevel)],
    ["Biggest lead", `${m.maxLead}${m.maxLeadSide ? " " + (m.maxLeadSide === "us" ? m.usName.split(" ")[0] : m.themName.split(" ")[0]) : ""}`]];
  const colW = CW / 2, rowH = 46;
  body.push(L(P + colW, y, P + colW, y + 2 * rowH, LINE, 1));
  body.push(L(P, y + rowH, P + CW, y + rowH, LINE, 1));
  stats.forEach((st, i) => {
    const c = i % 2, r = i < 2 ? 0 : 1;
    const cx = P + c * colW + colW / 2, yt = y + r * rowH;
    const big = st[0] === "Lead changes" || st[0] === "Times level";
    body.push(T(cx, yt + 21, st[1], big ? 21 : 15, PITCH, { w: 800, a: "middle" }));
    body.push(T(cx, yt + 37, st[0].toUpperCase(), 9, MUTE, { w: 700, a: "middle", ls: 0.5 }));
  });
  y += 2 * rowH + 16;

  // ---- chart ----
  const usShort = m.usName.split(" ")[0], themShort = m.themName.split(" ")[0];
  body.push(T(P, y, "SCORE PROGRESSION", 11, MUTE, { w: 700, ls: 1 }));
  // legend on title row, right side
  let lx = W - P;
  body.push(T(lx, y, themShort, 10, INK, { w: 700, a: "end" })); lx -= themShort.length * 5.6 + 6;
  body.push(flag(lx - 14, y - 8, 14, 9, m.colorThem, m.colorThem2)); lx -= 14 + 12;
  body.push(T(lx, y, usShort, 10, INK, { w: 700, a: "end" })); lx -= usShort.length * 5.6 + 6;
  body.push(flag(lx - 14, y - 8, 14, 9, m.colorUs, m.colorUs2));
  y += 10;
  const chH = 150;
  body.push(R(P, y, CW, chH, "#ffffff", 10, { stroke: LINE, sw: 1 }));
  const plotL = P + 32, plotR = P + CW - 12, plotT = y + 12, plotB = y + chH - 18;
  const xMax = Math.max(1, ...m.series.map((p: any) => p.x));
  const yMax = Math.max(1, ...m.series.map((p: any) => Math.max(p.us, p.them)));
  const pX = (x: number) => plotL + (plotR - plotL) * (x / xMax);
  const pY = (v: number) => plotB - (plotB - plotT) * (v / yMax);
  for (let g = 0; g <= 2; g++) { const v = Math.round((yMax * g) / 2); const yy = pY(v); body.push(L(plotL, yy, plotR, yy, "#eee5cf", 1)); body.push(T(plotL - 6, yy + 4, String(v), 9, MUTE, { a: "end" })); }
  if (m.htLine != null) { const hx = pX(m.htLine); body.push(L(hx, plotT, hx, plotB, PITCH, 1, "4 3")); body.push(T(hx, plotT - 3, "HT", 8, PITCH, { a: "middle", w: 700 })); }
  const step = (key: string) => { let d = ""; m.series.forEach((p: any, i: number) => { const px = pX(p.x), py = pY(p[key]); if (!i) d += `M ${px} ${py}`; else { d += ` L ${px} ${pY(m.series[i - 1][key])} L ${px} ${py}`; } }); return d; };
  body.push(`<path d="${step("them")}" fill="none" stroke="${m.colorThem}" stroke-width="2.5"/>`);
  body.push(`<path d="${step("us")}" fill="none" stroke="${m.colorUs}" stroke-width="3"/>`);
  m.goalDots.forEach((d: any) => body.push(C(pX(d.x), pY(d.y), 4, d.side === "us" ? m.colorUs : m.colorThem, { stroke: "#fff", sw: 1.5 })));
  y += chH + 22;

  // ---- our scorers ----
  body.push(T(P, y, `SCORERS · ${m.usName.toUpperCase()}`, 11, MUTE, { w: 700, ls: 1 }));
  y += 14;
  if (!m.usScorers.length) { body.push(T(P, y + 6, "No scores recorded", 12, MUTE)); y += 20; }
  m.usScorers.forEach((s: any) => {
    body.push(L(P, y + 17, P + CW, y + 17, "#ece3cb", 1));
    body.push(T(P, y + 12, `${s.num ? s.num + ". " : ""}${s.name}`, 13, INK, { w: 600 }));
    body.push(T(P + CW, y + 12, `${m.effMode === "goals" ? s.g : `${s.g}-${s.p}`}${s.frees ? `  (${s.frees}f)` : ""}`, 13, PITCH, { w: 700, a: "end" }));
    y += 23;
  });
  y += 16;

  // who was involved in subs (for lineup arrows)
  const subOnSet = new Set<number>(), subOffSet = new Set<number>();
  (m.timeline || []).forEach((t: any) => { if (t.kind === "sub") { if (t.onNum != null) subOnSet.add(t.onNum); if (t.offNum != null) subOffSet.add(t.offNum); } });

  // ---- lineup ----
  body.push(T(P, y, "TEAM", 11, MUTE, { w: 700, ls: 1 }));
  body.push(flag(P + 44, y - 9, 18, 11, m.colorUs, m.colorUs2));
  y += 12;
  const rows = m.formationRows && m.formationRows.length ? m.formationRows : [];
  const pitchH = rows.length ? rows.length * 54 + 20 : 28;
  body.push(R(P, y, CW, pitchH, PITCH, 12));
  body.push(R(P, y + pitchH / 2 - 0.5, CW, 1, "#1c5a40"));
  body.push(C(P + CW / 2, y + pitchH / 2, 18, "none", { stroke: "#1c5a40", sw: 1 }));
  const findName = (n: number) => { const p = (m.starters || []).find((x: any) => x.num === n); return p ? p.name : ""; };
  rows.forEach((row: number[], ri: number) => {
    const jw = 27, gap = Math.min(54, (CW - 24 - row.length * jw) / Math.max(1, row.length - 1 + 0.0001));
    const total = row.length * jw + (row.length - 1) * gap;
    const sx = P + (CW - total) / 2, ry = y + 13 + ri * 54;
    row.forEach((n, ci) => {
      const jx = sx + ci * (jw + (isFinite(gap) ? gap : 0));
      body.push(R(jx, ry, jw, jw, m.colorUs, 7));
      body.push(T(jx + jw / 2, ry + 18, String(n), 13, contrastOn(m.colorUs), { w: 800, a: "middle" }));
      body.push(T(jx + jw / 2, ry + jw + 12, findName(n), 9.5, "#eaf3ee", { w: 600, a: "middle" }));
      if (subOffSet.has(n)) body.push(T(jx + jw + 2, ry + 9, "▼", 8, "#ff6e63"));
      const sc = (m.usScorers || []).find((s: any) => s.num === n && (s.g || s.p));
      if (sc) body.push(T(jx + jw / 2, ry + jw + 23, m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`, 9, "#f5c518", { w: 700, a: "middle", ls: m.effMode === "goals" ? 2 : 0 }));
    });
  });
  y += pitchH + 10;
  if (m.subs && m.subs.length) {
    // bench chips, like the app: used subs wear the team colours, with on/off arrows and score badges
    body.push(T(P, y + 15, "SUBS", 9, MUTE, { w: 700, ls: 1 }));
    let bx = P + 38, by = y + 4;
    const chipH = 17;
    m.subs.forEach((p: any) => {
      const used = subOnSet.has(p.num) || subOffSet.has(p.num);
      const sc = (m.usScorers || []).find((s: any) => s.num === p.num && (s.g || s.p));
      const scoreTxt = sc ? (m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`) : "";
      const label = `${p.num} ${p.name}`;
      const arrowsW = (subOnSet.has(p.num) ? 9 : 0) + (subOffSet.has(p.num) ? 9 : 0);
      const w = label.length * 5.4 + arrowsW + (scoreTxt ? scoreTxt.length * 5.6 + 5 : 0) + 16;
      if (bx + w > P + CW) { bx = P + 38; by += chipH + 5; }
      body.push(R(bx, by, w, chipH, used ? m.colorUs : "#ffffff", 8.5, { stroke: used ? m.colorUs2 : LINE, sw: 1 }));
      let tx = bx + 8;
      body.push(T(tx, by + 12, label, 9.5, used ? contrastOn(m.colorUs) : INK, { w: 600 }));
      tx += label.length * 5.4 + 3;
      if (subOnSet.has(p.num)) { body.push(T(tx, by + 12, "▲", 8.5, "#2ecc71", { w: 700 })); tx += 9; }
      if (subOffSet.has(p.num)) { body.push(T(tx, by + 12, "▼", 8.5, "#ff6e63", { w: 700 })); tx += 9; }
      if (scoreTxt) body.push(T(tx + 2, by + 12, scoreTxt, 9, used ? contrastOn(m.colorUs) : PITCH, { w: 700 }));
      bx += w + 6;
    });
    y = by + chipH + 6;
  }
  if (m.missing && m.missing.length) { body.push(T(P, y + 8, "Missing: " + m.missing.map((p: any) => `${p.num} ${p.name}`).join("   "), 10, MUTE)); y += 18; }
  y += 16;

  // ---- timeline (centre rail: us left, them right, like the app) ----
  body.push(T(P, y, "TIMELINE", 11, MUTE, { w: 700, ls: 1 }));
  y += 14;
  const railX = P + CW / 2;
  const tlTop = y;
  const tlBody: string[] = []; // items paint over the rail, so collect them and draw the rail first
  const estW = (s: any, fs: number) => String(s).length * fs * 0.54;
  const halves = [...new Set(m.timeline.map((t: any) => t.half))].sort((a: any, b: any) => a - b);
  halves.forEach((h: any) => {
    const hTxt = h === 1 ? "FIRST HALF" : h === 2 ? "SECOND HALF" : `PERIOD ${h}`;
    const pw = estW(hTxt, 9) + 22;
    tlBody.push(R(railX - pw / 2, y, pw, 15, PAPER, 7.5, { stroke: LINE, sw: 1 }));
    tlBody.push(T(railX, y + 10.5, hTxt, 9, PITCH, { w: 700, ls: 1, a: "middle" }));
    y += 22;
    m.timeline.filter((t: any) => t.half === h).forEach((it: any) => {
      const cy = y + 6;
      const mm = it.minute != null ? `${it.mmin || it.minute}'` : "";
      if (it.kind === "score") {
        const us = it.side === "us";
        const col = us ? m.colorUs : m.colorThem;
        const ring = us ? m.colorUs2 : m.colorThem2;
        const descriptive = !it.sure && it.scorer && it.scorer !== "Opposition" && it.scorer !== "Unknown";
        const evName = it.scorer === "Opposition" ? m.themName : it.scorer;
        const label = descriptive ? `${it.type === "goal" ? "GOAL  " : ""}${it.desc || it.scorer}`
          : `${evName}${it.type === "goal" ? "  GOAL" : it.fromFree ? "  (free)" : it.setPiece ? `  ('${it.setPiece})` : ""}`;
        tlBody.push(C(railX, cy, it.type === "goal" ? 6 : 4.5, col, { stroke: ring, sw: 2 }));
        if (us) {
          tlBody.push(T(railX - 13, cy + 4, `${mm}  ${label}`, 11.5, descriptive ? MUTE : INK, { w: it.type === "goal" ? 700 : 400, a: "end" }));
          tlBody.push(T(P, cy + 4, `${it.usScore} – ${it.themScore}`, 10.5, PITCH, { w: 700 }));
        } else {
          tlBody.push(T(railX + 13, cy + 4, `${mm}  ${label}`, 11.5, descriptive ? MUTE : INK, { w: it.type === "goal" ? 700 : 400 }));
          tlBody.push(T(P + CW, cy + 4, `${it.usScore} – ${it.themScore}`, 10.5, PITCH, { w: 700, a: "end" }));
        }
      } else if (it.kind === "sub") {
        tlBody.push(C(railX, cy, 6, PAPER, { stroke: MUTE, sw: 1 }));
        tlBody.push(T(railX, cy + 3, "⇄", 7.5, MUTE, { a: "middle" }));
        const offTxt = `▼ ${it.off}`, onTxt = `▲ ${it.on}`;
        let tx = railX - 13;
        tlBody.push(T(tx, cy + 4, offTxt, 11, "#c0392b", { w: 700, a: "end" })); tx -= estW(offTxt, 11) + 7;
        tlBody.push(T(tx, cy + 4, onTxt, 11, "#1f7a4d", { w: 700, a: "end" })); tx -= estW(onTxt, 11) + 7;
        if (mm) tlBody.push(T(tx, cy + 4, mm, 11, MUTE, { w: 700, a: "end" }));
      } else {
        tlBody.push(C(railX, cy, 4.5, PAPER, { stroke: MUTE, sw: 1.5 }));
        tlBody.push(T(railX - 13, cy + 4, `${mm ? mm + "  " : ""}${it.text}`, 11, MUTE, { a: "end" }));
      }
      y += 20;
    });
    const am = (m.halfMarks || []).find((x: any) => x.half === h && x.marker && x.added > 0);
    if (am) {
      const aTxt = `+${am.added} added`;
      const aw = estW(aTxt, 9.5) + 20;
      tlBody.push(R(railX - aw / 2, y + 1, aw, 14, PAPER, 7, { stroke: LINE, sw: 1 }));
      tlBody.push(T(railX, y + 11, aTxt, 9.5, MUTE, { w: 600, a: "middle" }));
      y += 20;
    }
    y += 6;
  });
  body.push(L(railX, tlTop, railX, y - 4, LINE, 1.5));
  body.push(...tlBody);

  // ---- brand footer ----
  body.push(L(P, y + 2, P + CW, y + 2, LINE, 1));
  const pillS = 0.5;                          // 128*0.5 = 64 wide, 70*0.5 = 35 tall
  body.push(brandPillSVG(W / 2 - 32, y + 10, pillS));
  body.push(T(W / 2, y + 62, BRAND_WORDMARK, 13, INK, { w: 800, a: "middle", ls: 1.5 }));
  body.push(T(W / 2, y + 78, BRAND_SITE, 10, MUTE, { a: "middle", ls: 0.5 }));
  body.push(T(W / 2, y + 92, BRAND_CHANT.toUpperCase(), 8, "#9aa89e", { a: "middle", ls: 2 }));
  const H = y + 104;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + R(0, 0, W, H, PAPER) + R(0, 0, W, HH, PITCH) + head.join("") + body.join("") + `</svg>`;
  return { svg, width: W, height: H };
}
