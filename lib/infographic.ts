import { contrastOn, fmtScore, gpTotal } from "@/lib/util";
import type { Model } from "@/lib/types";
import { BRAND_SITE, BRAND_WORDMARK, BRAND_CHANT } from "@/lib/constants";
import { lineupBadges } from "./lineup-badges";

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

// Darken a near-white / very light kit colour so its line shows on the light chart
// panel — same logic as the on-screen <ScoreChart>, so the poster matches it.
function chartColor(c: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || "");
  if (!m) return c || "#888";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.72) return c;
  const h = (x: number) => Math.round(x * 0.62).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function buildScoreCardSVG(m: Model): { svg: string; width: number; height: number } {
  const W = 1200, H = 630;
  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  const homeS = m.homeTotals?.str ?? "0";
  const awayS = m.awayTotals?.str ?? "0";
  const grade = (m.grade || m.sport || "Match").toUpperCase();
  const outcome = m.outcome ?? { winner: null, margin: 0 };
  const result = outcome.winner === null ? "Tie" : `Won by ${outcome.margin}`;
  const ht = m.ht || "";
  const homeC1 = m.homeColors?.[0] ?? "#f5c518";
  const homeC2 = m.homeColors?.[1] ?? "#1f7a4d";
  const awayC1 = m.awayColors?.[0] ?? "#c0392b";
  const awayC2 = m.awayColors?.[1] ?? "#2c5fa8";
  const flag = (x: number, y: number, w: number, h: number, c1: string, c2: string) =>
    `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c1}"/>` +
    `<rect x="${x}" y="${y + h / 2}" width="${w}" height="${h / 2}" fill="${c2}"/></g>`;
  const t = (x: number, y: number, s: string, size: number, fill: string, opts: { w?: number; a?: string } = {}) =>
    `<text x="${x}" y="${y}" font-family="Liberation Sans, Arial, sans-serif" font-size="${size}" fill="${fill}" ` +
    `font-weight="${opts.w || 400}" text-anchor="${opts.a || "start"}">${esc(s)}</text>`;

  const PAPER = "#f4efe1", INK = "#0c3b2a", MUTE = "#5c6b60", PITCH = "#0c3b2a";
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
  // ---- brand banner across the top (like the website header) ----
  parts.push(`<rect x="0" y="0" width="${W}" height="96" fill="${PITCH}"/>`);
  parts.push(brandPillSVG(48, 24, 0.72));                                              // 128*0.72 ≈ 92 wide, 70*0.72 ≈ 50 tall
  parts.push(t(166, 64, BRAND_WORDMARK, 40, PAPER, { w: 700 }));                       // anchor start
  parts.push(t(W - 48, 60, BRAND_CHANT.toUpperCase(), 16, "#8fb0a3", { a: "end" }));
  // two-colour team stripe just under the banner (home left, away right)
  parts.push(`<rect x="0" y="96" width="${W / 2}" height="10" fill="${homeC1}"/>`);
  parts.push(`<rect x="${W / 2}" y="96" width="${W / 2}" height="10" fill="${awayC1}"/>`);
  // ---- match ----
  parts.push(t(W / 2, 175, grade, 32, MUTE, { w: 700, a: "middle" }));
  parts.push(flag(W * 0.25 - 40, 205, 80, 50, homeC1, homeC2));
  parts.push(flag(W * 0.75 - 40, 205, 80, 50, awayC1, awayC2));
  parts.push(t(W * 0.25, 305, m.homeName || "Home", 42, INK, { w: 700, a: "middle" }));
  parts.push(t(W * 0.75, 305, m.awayName || "Away", 42, INK, { w: 700, a: "middle" }));
  parts.push(t(W * 0.25, 455, homeS, 108, INK, { w: 700, a: "middle" }));
  parts.push(t(W / 2, 446, "–", 80, MUTE, { w: 400, a: "middle" }));
  parts.push(t(W * 0.75, 455, awayS, 108, INK, { w: 700, a: "middle" }));
  if (result) parts.push(t(W / 2, 532, result, 36, INK, { w: 700, a: "middle" }));
  if (ht) parts.push(t(W / 2, 570, `HT ${ht}`, 24, MUTE, { a: "middle" }));
  // just the link at the bottom (the banner carries the brand)
  parts.push(t(W / 2, 612, BRAND_SITE, 24, MUTE, { w: 700, a: "middle" }));

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
  const estW = (s: any, fs: number) => String(s).length * fs * 0.54;
  // a team jersey shirt (same silhouette as the on-screen <Jersey>), scaled into an sz×sz box at (x,y)
  const jersey = (x: number, y: number, sz: number, c1: string, c2: string, num?: any) => {
    const s = sz / 48;
    let g = `<g transform="translate(${x},${y}) scale(${s})">`;
    g += `<path d="M17 6 C19 9 29 9 31 6 L37 8 L47 15 L41 25 L35 21 L35 43 L13 43 L13 21 L7 25 L1 15 L11 8 Z" fill="${c1}" stroke="${c2}" stroke-width="2.5" stroke-linejoin="round"/>`;
    if (num != null && num !== "") g += `<text x="24" y="35" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700" fill="${contrastOn(c1)}" text-anchor="middle">${esc(num)}</text>`;
    return g + `</g>`;
  };
  const jerseyC = (cx: number, y: number, sz: number, c1: string, c2: string, num?: any) => jersey(cx - sz / 2, y, sz, c1, c2, num);

  const head: string[] = [], body: string[] = [], banner: string[] = [];
  const HH = 196;        // match-header band height
  const BAND = 48;       // brand banner above the header

  // ---- brand banner (top of the image, like the website header) ----
  banner.push(brandPillSVG(P, 9, 0.46));                                          // 128*0.46 ≈ 59 wide, 70*0.46 ≈ 32 tall
  banner.push(T(P + 64, 33, BRAND_WORDMARK, 17, PAPER, { w: 800, ls: 1.5 }));
  banner.push(T(W - P, 33, BRAND_CHANT.toUpperCase(), 8, "#8fb0a3", { a: "end", ls: 2 }));

  const hC1 = m.homeColors?.[0] ?? "#f5c518";
  const hC2 = m.homeColors?.[1] ?? "#1f7a4d";
  const aC1 = m.awayColors?.[0] ?? "#c0392b";
  const aC2 = m.awayColors?.[1] ?? "#2c5fa8";

  // ---- header band (sits below the banner) — mirrors the on-screen ScoreHeader ----
  head.push(R(0, 0, W / 2, 6, hC1), R(W / 2, 0, W / 2, 6, aC1));
  head.push(T(P, 30, (m.grade || m.sport || "Match").toUpperCase(), 12, PAPER, { w: 700, ls: 1 }));
  head.push(T(W - P, 30, m.dateStr, 11, "#cfe3d8", { a: "end" }));
  head.push(jerseyC(W * 0.27, 40, 46, hC1, hC2));
  head.push(jerseyC(W * 0.73, 40, 46, aC1, aC2));
  head.push(T(W * 0.27, 99, m.homeName, 15, PAPER, { w: 700, a: "middle" }));
  head.push(T(W * 0.73, 99, m.awayName, 15, PAPER, { w: 700, a: "middle" }));
  if (m.homeSquad) head.push(T(W * 0.27, 113, m.homeSquad, 10, "#9fc2b3", { a: "middle" }));
  if (m.awaySquad) head.push(T(W * 0.73, 113, m.awaySquad, 10, "#9fc2b3", { a: "middle" }));
  head.push(T(W * 0.27, 146, m.homeTotals.str, 42, PAPER, { w: 800, a: "middle" }));
  head.push(T(W * 0.73, 146, m.awayTotals.str, 42, PAPER, { w: 800, a: "middle" }));
  head.push(T(W * 0.5, 138, "–", 24, "#7fa395", { a: "middle" }));
  // neutral result indicator: "Leading by N" / "Won by N" under the leader, or "Tie" centred (like ScoreHeader)
  const homeT = m.homeTotals.total, awayT = m.awayTotals.total;
  const overFT = (m.halfMarks || []).some((x: any) => x.marker === "FT");
  const tie = homeT === awayT;
  const leaderHome = homeT > awayT;
  const resTxt = tie ? "TIE" : `${overFT ? "WON BY" : "LEADING BY"} ${Math.abs(homeT - awayT)}`;
  const resCx = tie ? W / 2 : (leaderHome ? W * 0.27 : W * 0.73);
  const resBg = tie ? "#e7dec6" : (leaderHome ? hC1 : aC1);
  const resFg = tie ? INK : contrastOn(resBg);
  const cw = estW(resTxt, 11) + 24;
  head.push(R(resCx - cw / 2, 158, cw, 22, resBg, 11, tie ? {} : { stroke: leaderHome ? hC2 : aC2, sw: 1 }));
  head.push(T(resCx, 173, resTxt, 11, resFg, { w: 700, a: "middle", ls: 0.8 }));

  let y = HH + BAND + 20;

  // ---- stats 2×2 (boxed, like the on-screen StatGrid) ----
  const maxLeadV = m.maxLeadVenue;
  const maxLeadTeam = maxLeadV === "home" ? (m.homeName || "").split(" ")[0] : maxLeadV === "away" ? (m.awayName || "").split(" ")[0] : "";
  const stats: [string, string][] = [["HALF-TIME", m.ht || "—"], ["LEAD CHANGES", String(m.leadChanges)],
    ["TIMES LEVEL", String(m.timesLevel)],
    ["BIGGEST LEAD", `${m.maxLead}${maxLeadV ? " " + maxLeadTeam : ""}`]];
  const sgap = 8, scellW = (CW - sgap) / 2, scellH = 50;
  stats.forEach((st, i) => {
    const c = i % 2, r = i < 2 ? 0 : 1;
    const bx = P + c * (scellW + sgap), by = y + r * (scellH + sgap);
    body.push(R(bx, by, scellW, scellH, "#ffffff", 10, { stroke: LINE, sw: 1 }));
    body.push(T(bx + scellW / 2, by + 28, st[1], 23, PITCH, { w: 800, a: "middle" }));
    body.push(T(bx + scellW / 2, by + 42, st[0], 8.5, MUTE, { w: 700, a: "middle", ls: 0.5 }));
  });
  y += 2 * scellH + sgap + 18;

  // ---- chart (mirrors the on-screen ScoreChart: darkened lines, green-flag goals,
  //      end-point score labels, a minute axis and sub/card rail markers — no legend) ----
  body.push(T(P, y, "SCORE PROGRESSION", 11, MUTE, { w: 700, ls: 1 }));
  y += 10;
  const chH = 172;
  body.push(R(P, y, CW, chH, "#ffffff", 10, { stroke: LINE, sw: 1 }));
  const cHome = chartColor(hC1), cAway = chartColor(aC1);
  const plotL = P + 30, plotR = P + CW - 28, plotT = y + 14, plotB = y + chH - 38;
  const railY = plotB + 13;
  const chartSeries = m.homeSeries as any[];
  const xMax = Math.max(1, ...chartSeries.map((p: any) => p.x));
  const yMax = Math.max(1, ...chartSeries.map((p: any) => Math.max(p.home, p.away)));
  const pX = (x: number) => plotL + (plotR - plotL) * (x / xMax);
  const pY = (v: number) => plotB - (plotB - plotT) * (v / yMax);
  for (let g = 0; g <= 2; g++) { const v = Math.round((yMax * g) / 2); const yy = pY(v); body.push(L(plotL, yy, plotR, yy, "#eee5cf", 1)); body.push(T(plotL - 6, yy + 4, String(v), 9, MUTE, { a: "end" })); }
  if (m.htLine != null) { const hx = pX(m.htLine); body.push(L(hx, plotT, hx, plotB, PITCH, 1, "4 3")); body.push(T(hx, plotT - 3, "HT", 8, PITCH, { a: "middle", w: 700 })); }
  const step = (key: string) => { let d = ""; chartSeries.forEach((p: any, i: number) => { const px = pX(p.x), py = pY(p[key]); if (!i) d += `M ${px} ${py}`; else { d += ` L ${px} ${pY(chartSeries[i - 1][key])} L ${px} ${py}`; } }); return d; };
  body.push(`<path d="${step("away")}" fill="none" stroke="${cAway}" stroke-width="2.5"/>`);
  body.push(`<path d="${step("home")}" fill="none" stroke="${cHome}" stroke-width="3"/>`);
  // goals: a ⚽ (soccer) or a tilted green umpire flag (GAA), matching the on-screen chart
  m.goalDots.forEach((d: any) => {
    const gx = pX(d.x), gy = pY(d.y);
    if (m.effMode === "goals") body.push(`<text x="${gx}" y="${gy}" font-size="16" text-anchor="middle" dominant-baseline="central">⚽</text>`);
    else body.push(`<g transform="translate(-6 4) rotate(30 ${gx} ${gy})"><line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy - 16}" stroke="#0c3b2a" stroke-width="1.5"/><rect x="${gx}" y="${gy - 16}" width="8" height="8" fill="#1f9d3f" stroke="#0c3b2a" stroke-width="0.6"/></g>`);
  });
  // 2-pointers (Gaelic football): a tilted orange flag, echoing the green goal flag
  (m.twoPtDots || []).forEach((d: any) => {
    const gx = pX(d.x), gy = pY(d.y);
    body.push(`<g transform="translate(-6 4) rotate(30 ${gx} ${gy})"><line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy - 16}" stroke="#0c3b2a" stroke-width="1.5"/><rect x="${gx}" y="${gy - 16}" width="8" height="8" fill="#e67e22" stroke="#0c3b2a" stroke-width="0.6"/></g>`);
  });
  // end-point cumulative score labels
  const lastPt = chartSeries[chartSeries.length - 1];
  if (lastPt) {
    body.push(T(plotR + 4, pY(lastPt.home) + 4, lastPt.homeScore, 11, cHome, { w: 700 }));
    body.push(T(plotR + 4, pY(lastPt.away) + 4, lastPt.awayScore, 11, cAway, { w: 700 }));
  }
  // x-axis minute labels (throw-in → final, evenly spread)
  const sn = chartSeries.length;
  const sidx = sn <= 5 ? chartSeries.map((_: any, i: number) => i) : [0, Math.floor(sn * 0.25), Math.floor(sn * 0.5), Math.floor(sn * 0.75), sn - 1];
  [...new Set(sidx)].forEach((i: any) => body.push(T(pX(chartSeries[i].x), plotB + 26, `${chartSeries[i].mmin ?? 0}'`, 8, MUTE, { a: "middle" })));
  // sub / card rail markers under the plot
  (m.chartMarkers || []).forEach((mk: any) => {
    const mx = pX(mk.x);
    if (mk.kind === "sub") {
      body.push(`<path d="M ${mx - 4} ${railY - 1} L ${mx + 4} ${railY - 1} L ${mx} ${railY - 7} Z" fill="#1f7a4d"/>`);
      body.push(`<path d="M ${mx - 4} ${railY + 1} L ${mx + 4} ${railY + 1} L ${mx} ${railY + 7} Z" fill="#c0392b"/>`);
    } else {
      body.push(R(mx - 4, railY - 6, 8, 11, mk.kind === "red" ? "#c0392b" : "#f5c518", 1.5, { stroke: "#0c3b2a", sw: 0.5 }));
    }
  });
  y += chH + 22;

  // ---- scorers: one combined leaderboard (jersey + name + columns), like the on-screen <Scorers> ----
  const gaa = m.effMode !== "goals";
  const scRows = [
    ...(m.homeScorers || []).map((s: any) => ({ ...s, c1: hC1, c2: hC2 })),
    ...(m.awayScorers || []).map((s: any) => ({ ...s, c1: aC1, c2: aC2 })),
  ].sort((a: any, b: any) => gpTotal(b.g, b.p, m.effMode) - gpTotal(a.g, a.p, m.effMode));
  body.push(T(P, y, "SCORERS", 11, MUTE, { w: 700, ls: 1 }));
  y += 16;
  // column header row
  const cols: [string, number][] = gaa
    ? [["GOALS", P + CW - 156], ["POINTS", P + CW - 110], ["FREES", P + CW - 64], ["TOTAL", P + CW - 18]]
    : [["GOALS", P + CW - 18]];
  body.push(T(P, y, "PLAYER", 9, MUTE, { w: 700, ls: 1 }));
  cols.forEach(([lab, cx]) => body.push(T(cx, y, lab, 9, MUTE, { w: 700, a: "middle", ls: 0.5 })));
  body.push(L(P, y + 6, P + CW, y + 6, LINE, 1));
  y += 21;
  if (!scRows.length) { body.push(T(P, y, "No scorers recorded", 12, MUTE)); y += 18; }
  scRows.forEach((s: any) => {
    body.push(L(P, y + 11, P + CW, y + 11, "#ece3cb", 1));
    body.push(jersey(P, y - 15, 21, s.c1, s.c2, s.num || ""));
    body.push(T(P + 28, y + 2, s.name, 13, INK, { w: 600 }));
    if (gaa) {
      body.push(T(P + CW - 156, y + 2, String(s.g), 15, PITCH, { w: 700, a: "middle" }));
      body.push(T(P + CW - 110, y + 2, String(s.p), 15, PITCH, { w: 700, a: "middle" }));
      body.push(T(P + CW - 64, y + 2, s.frees ? String(s.frees) : "–", 12, MUTE, { a: "middle" }));
      body.push(T(P + CW - 18, y + 2, `${s.g}-${s.p}`, 15, PITCH, { w: 700, a: "middle" }));
    } else {
      body.push(T(P + CW - 18, y + 2, String(s.g), 15, PITCH, { w: 700, a: "middle" }));
    }
    y += 25;
  });
  y += 18;

  // shared pitch renderer — jersey shirts on a green pitch, names + score/card/sub/og badges below
  const drawPitch = (rows: number[][], c1: string, c2: string, nameFor: (n: number) => string, side: "home" | "away") => {
    const pitchH = rows.length ? rows.length * 56 + 18 : 28;
    body.push(R(P, y, CW, pitchH, PITCH, 12));
    body.push(R(P, y + pitchH / 2 - 0.5, CW, 1, "#1c5a40"));
    body.push(C(P + CW / 2, y + pitchH / 2, 18, "none", { stroke: "#1c5a40", sw: 1 }));
    rows.forEach((row, ri) => {
      const jw = 30, gap = Math.min(54, (CW - 24 - row.length * jw) / Math.max(1, row.length - 1 + 0.0001));
      const total = row.length * jw + (row.length - 1) * gap;
      const sx = P + (CW - total) / 2, ry = y + 12 + ri * 56;
      row.forEach((n, ci) => {
        const jx = sx + ci * (jw + (isFinite(gap) ? gap : 0));
        const b = lineupBadges(m as any, side, n);
        body.push(jersey(jx, ry, jw, c1, c2, n));
        body.push(T(jx + jw / 2, ry + jw + 11, nameFor(n), 9.5, "#eaf3ee", { w: 600, a: "middle" }));
        if (b.subOn) body.push(T(jx - 2, ry + 9, "▲", 8, "#2ecc71"));
        if (b.subOff) body.push(T(jx + jw + 1, ry + 9, "▼", 8, "#ff6e63"));
        b.cards.forEach((c, ci2) => body.push(R(jx + jw - 3 - ci2 * 5, ry - 3, 4, 6, c === "red" ? "#e74c3c" : "#f1c40f", 1, { stroke: "rgba(0,0,0,.3)", sw: 0.5 })));
        if (b.og) body.push(T(jx + jw / 2, ry + jw + 22, "OG", 8, "#ff6e63", { w: 700, a: "middle" }));
        if (b.score) body.push(T(jx + jw / 2, ry + jw + (b.og ? 32 : 22), m.effMode === "goals" ? "●".repeat(b.score.g) : `${b.score.g}-${b.score.p}`, 9, "#f5c518", { w: 700, a: "middle", ls: m.effMode === "goals" ? 2 : 0 }));
      });
    });
    y += pitchH + 10;
  };

  // reusable bench-chip renderer — used for both teams' substitutes
  const drawBench = (players: any[], side: "home" | "away", c1: string, c2: string) => {
    let bx = P + 38, by = y + 4;
    const chipH = 17;
    players.forEach((p: any) => {
      const b = lineupBadges(m as any, side, p.num);
      const used = b.subOn || b.subOff;
      const scoreTxt = b.score ? (m.effMode === "goals" ? "●".repeat(b.score.g) : `${b.score.g}-${b.score.p}`) : "";
      const label = `${p.num} ${p.name}`;
      const arrowsW = (b.subOn ? 9 : 0) + (b.subOff ? 9 : 0);
      const w = label.length * 5.4 + arrowsW + (scoreTxt ? scoreTxt.length * 5.6 + 5 : 0) + 16;
      if (bx + w > P + CW) { bx = P + 38; by += chipH + 5; }
      body.push(R(bx, by, w, chipH, used ? c1 : "#ffffff", 8.5, { stroke: used ? c2 : LINE, sw: 1 }));
      let tx = bx + 8;
      body.push(T(tx, by + 12, label, 9.5, used ? contrastOn(c1) : INK, { w: 600 }));
      tx += label.length * 5.4 + 3;
      if (b.subOn) { body.push(T(tx, by + 12, "▲", 8.5, "#2ecc71", { w: 700 })); tx += 9; }
      if (b.subOff) { body.push(T(tx, by + 12, "▼", 8.5, "#ff6e63", { w: 700 })); tx += 9; }
      if (scoreTxt) body.push(T(tx + 2, by + 12, scoreTxt, 9, used ? contrastOn(c1) : PITCH, { w: 700 }));
      bx += w + 6;
    });
    y = by + chipH + 6;
  };

  // ---- lineup pitches: home first, then away (symmetric, from the venue rosters) ----
  const pitchFor = (roster: any) => {
    const players = (roster?.players) || [];
    const formation: number[][] = (roster?.formation && roster.formation.length) ? roster.formation : [];
    const nameFor = (n: number) => { const p = players.find((x: any) => x.num === n); return p ? p.name : ""; };
    const subsList = players.filter((p: any) => p.role === "sub");
    const missingList = players.filter((p: any) => p.role === "missing");
    return { formation, nameFor, subsList, missingList };
  };

  const renderTeamPitch = (
    teamName: string, formation: number[][], c1: string, c2: string,
    findNameFn: (n: number) => string, badgeSide: "home" | "away",
    subsList: any[], missingList: any[],
  ) => {
    body.push(T(P, y, `TEAM · ${(teamName || "").toUpperCase()}`, 11, MUTE, { w: 700, ls: 1 }));
    y += 12;
    drawPitch(formation, c1, c2, findNameFn, badgeSide);
    if (subsList.length) {
      body.push(T(P, y + 15, "SUBS", 9, MUTE, { w: 700, ls: 1 }));
      drawBench(subsList, badgeSide, c1, c2);
    }
    if (missingList.length) { body.push(T(P, y + 8, "Missing: " + missingList.map((p: any) => `${p.num} ${p.name}`).join("   "), 10, MUTE)); y += 18; }
    y += 16;
  };

  const home = pitchFor(m.homeRoster);
  const away = pitchFor(m.awayRoster);
  if (home.formation.length) renderTeamPitch(m.homeName, home.formation, hC1, hC2, home.nameFor, "home", home.subsList, home.missingList);
  if (away.formation.length) renderTeamPitch(m.awayName, away.formation, aC1, aC2, away.nameFor, "away", away.subsList, away.missingList);

  // ---- timeline (centre rail: home left, away right — scores, subs, cards, corners) ----
  body.push(T(P, y, "TIMELINE", 11, MUTE, { w: 700, ls: 1 }));
  y += 14;
  const railX = P + CW / 2;
  const tlTop = y;
  const tlBody: string[] = []; // items paint over the rail, so collect them and draw the rail first
  const halves = [...new Set(m.timelineHA.map((t: any) => t.half))].sort((a: any, b: any) => a - b);
  halves.forEach((h: any) => {
    const hTxt = h === 1 ? "FIRST HALF" : h === 2 ? "SECOND HALF" : `PERIOD ${h}`;
    const pw = estW(hTxt, 9) + 22;
    tlBody.push(R(railX - pw / 2, y, pw, 15, PAPER, 7.5, { stroke: LINE, sw: 1 }));
    tlBody.push(T(railX, y + 10.5, hTxt, 9, PITCH, { w: 700, ls: 1, a: "middle" }));
    y += 22;
    m.timelineHA.filter((t: any) => t.half === h).forEach((it: any) => {
      const cy = y + 6;
      const mm = it.minute != null ? `${it.mmin || it.minute}'` : "";
      if (it.kind === "score") {
        const isHome = it.side === "home";
        const col = isHome ? hC1 : aC1;
        const ring = isHome ? hC2 : aC2;
        const descriptive = !it.sure && it.scorer && it.scorer !== "Opposition" && it.scorer !== "Unknown";
        const evName = it.scorer === "Opposition" ? m.awayName : it.scorer;
        const name = descriptive ? (it.desc || it.scorer) : evName;
        // a small pill conveys goal / free / set-piece, like the on-screen timeline
        const chip = it.type === "goal" ? { t: "GOAL", bg: "#c0392b", fg: "#fff" }
          : it.twoPointer ? { t: "2PT", bg: "#e67e22", fg: "#fff" }
            : it.fromFree ? { t: "FREE", bg: "#e7dec6", fg: "#5a7a4a" }
              : it.setPiece ? { t: `'${it.setPiece}`, bg: "#e7dec6", fg: "#5a7a4a" } : null;
        const chipW = chip ? estW(chip.t, 8) + 12 : 0;
        const nameCol = descriptive ? MUTE : INK;
        tlBody.push(C(railX, cy, it.type === "goal" ? 6 : 4.5, col, { stroke: ring, sw: 2 }));
        if (isHome) {
          let tx = railX - 12;
          if (chip) { tlBody.push(R(tx - chipW, cy - 7, chipW, 13, chip.bg, 6.5)); tlBody.push(T(tx - chipW / 2, cy + 2.5, chip.t, 8, chip.fg, { w: 700, a: "middle", ls: 0.5 })); tx -= chipW + 6; }
          tlBody.push(T(tx, cy + 4, name, 11.5, nameCol, { w: it.type === "goal" ? 700 : 400, a: "end" })); tx -= estW(name, 11.5) + 6;
          if (mm) tlBody.push(T(tx, cy + 4, mm, 11, MUTE, { a: "end" }));
          tlBody.push(T(P, cy + 4, `${it.homeScore} – ${it.awayScore}`, 10.5, PITCH, { w: 700 }));
        } else {
          let tx = railX + 12;
          if (mm) { tlBody.push(T(tx, cy + 4, mm, 11, MUTE)); tx += estW(mm, 11) + 6; }
          tlBody.push(T(tx, cy + 4, name, 11.5, nameCol, { w: it.type === "goal" ? 700 : 400 })); tx += estW(name, 11.5) + 6;
          if (chip) { tlBody.push(R(tx, cy - 7, chipW, 13, chip.bg, 6.5)); tlBody.push(T(tx + chipW / 2, cy + 2.5, chip.t, 8, chip.fg, { w: 700, a: "middle", ls: 0.5 })); }
          tlBody.push(T(P + CW, cy + 4, `${it.homeScore} – ${it.awayScore}`, 10.5, PITCH, { w: 700, a: "end" }));
        }
      } else if (it.kind === "sub") {
        tlBody.push(C(railX, cy, 6, PAPER, { stroke: MUTE, sw: 1 }));
        tlBody.push(T(railX, cy + 3, "⇄", 7.5, MUTE, { a: "middle" }));
        const offTxt = `▼ ${it.off}`, onTxt = `▲ ${it.on}`;
        let tx = railX - 13;
        tlBody.push(T(tx, cy + 4, offTxt, 11, "#c0392b", { w: 700, a: "end" })); tx -= estW(offTxt, 11) + 7;
        tlBody.push(T(tx, cy + 4, onTxt, 11, "#1f7a4d", { w: 700, a: "end" })); tx -= estW(onTxt, 11) + 7;
        if (mm) tlBody.push(T(tx, cy + 4, mm, 11, MUTE, { w: 700, a: "end" }));
      } else if (it.kind === "card") {
        const isHome = it.side === "home";
        const cardCol = it.card === "red" ? "#e74c3c" : "#f1c40f";
        const who = (it.side === "away" && (!it.who || /^t\d*$/i.test(it.who))) ? m.awayName : (it.who || m.homeName);
        tlBody.push(C(railX, cy, 4.5, PAPER, { stroke: MUTE, sw: 1.5 }));
        if (isHome) {
          let tx = railX - 13;
          tlBody.push(T(tx, cy + 4, who, 11, INK, { a: "end" })); tx -= estW(who, 11) + 6;
          tlBody.push(R(tx - 8, cy - 7, 8, 11, cardCol, 1.5, { stroke: "rgba(0,0,0,.3)" })); tx -= 8 + 6;
          if (mm) tlBody.push(T(tx, cy + 4, mm, 11, MUTE, { a: "end" }));
        } else {
          let tx = railX + 13;
          if (mm) { tlBody.push(T(tx, cy + 4, mm, 11, MUTE)); tx += estW(mm, 11) + 6; }
          tlBody.push(R(tx, cy - 7, 8, 11, cardCol, 1.5, { stroke: "rgba(0,0,0,.3)" })); tx += 8 + 6;
          tlBody.push(T(tx, cy + 4, who, 11, INK));
        }
      } else if (it.kind === "corner") {
        const isHome = it.side === "home";
        const nth = m.timelineHA.filter((x: any) => x.kind === "corner" && x.side === it.side && (x.seq || 0) <= (it.seq || 0)).length;
        const ord = nth === 1 ? "1st" : nth === 2 ? "2nd" : nth === 3 ? "3rd" : `${nth}th`;
        const label = `⚑ ${ord} corner — ${isHome ? m.homeName : m.awayName}`;
        tlBody.push(C(railX, cy, 4.5, PAPER, { stroke: MUTE, sw: 1.5 }));
        if (isHome) tlBody.push(T(railX - 13, cy + 4, `${mm ? mm + "  " : ""}${label}`, 11, MUTE, { a: "end" }));
        else tlBody.push(T(railX + 13, cy + 4, `${mm ? mm + "  " : ""}${label}`, 11, MUTE));
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
    + R(0, 0, W, H, PAPER) + R(0, 0, W, HH + BAND, PITCH) + banner.join("")
    + `<g transform="translate(0,${BAND})">` + head.join("") + `</g>` + body.join("") + `</svg>`;
  return { svg, width: W, height: H };
}
