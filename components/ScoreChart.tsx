"use client";
import React from "react";

// Darken a near-white / very light kit colour so the line shows on the light
// chart panel (e.g. yellow). Done here so the editor and public page match.
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

export default function ScoreChart({ series, goalDots, chartMarkers = [], htLine, colorHome, colorAway, mode = "gaa" }: {
  series: any[]; goalDots: any[]; chartMarkers?: any[]; htLine: any;
  colorHome: string; colorAway: string; mode?: string;
}) {
  const W = 720, H = 300, L = 40, Rp = 48, Tp = 34, Bp = 46;
  const cHome = chartColor(colorHome), cAway = chartColor(colorAway);
  const xMax = Math.max(1, ...series.map((p) => p.x));
  const yMax = Math.max(1, ...series.map((p) => Math.max(p.home, p.away)));
  const pX = (x: number) => L + (W - L - Rp) * (x / xMax);
  const pY = (v: number) => (H - Bp) - ((H - Bp) - Tp) * (v / yMax);
  const railY = H - Bp + 16;
  const stepPath = (key: string) => {
    let d = "";
    series.forEach((p, i) => {
      const px = pX(p.x), py = pY(p[key]);
      if (!i) d += "M " + px + " " + py;
      else d += " L " + px + " " + pY(series[i - 1][key]) + " L " + px + " " + py;
    });
    return d;
  };
  const grid: { v: number; y: number }[] = [];
  for (let g = 0; g <= 2; g++) { const v = Math.round((yMax * g) / 2); grid.push({ v, y: pY(v) }); }

  // x-axis minute labels: a spread of series points (throw-in → final)
  const n = series.length;
  const idxs = n <= 5 ? series.map((_, i) => i) : [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
  const minuteLabels = Array.from(new Set(idxs)).map((i) => ({ x: series[i].x, label: `${series[i].mmin ?? 0}'` }));

  const last = series[n - 1];

  return (
    <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }} fontFamily="Oswald,sans-serif">
      {grid.map((gd, i) => (
        <g key={i}>
          <line x1={L} y1={gd.y} x2={W - Rp} y2={gd.y} stroke="#e3d9bf" />
          <text x={L - 6} y={gd.y + 4} fontSize="11" fill="#6f7d72" textAnchor="end">{gd.v}</text>
        </g>
      ))}

      {htLine != null && (
        <g>
          <line x1={pX(htLine)} y1={Tp} x2={pX(htLine)} y2={H - Bp} stroke="#0c3b2a" strokeDasharray="4 3" />
          <text x={pX(htLine)} y={Tp - 2} fontSize="10" fill="#0c3b2a" textAnchor="middle" fontWeight="700">HT</text>
        </g>
      )}

      <path d={stepPath("away")} fill="none" stroke={cAway} strokeWidth="2.5" />
      <path d={stepPath("home")} fill="none" stroke={cHome} strokeWidth="3" />

      {/* goals: ⚽ in soccer; a square green flag (umpire convention) in GAA */}
      {goalDots.map((d, i) => {
        const x = pX(d.x), y = pY(d.y);
        return (
          <g key={i} style={{ cursor: "default" }}>
            <title>{d.label}</title>
            {mode === "goals" ? (
              <text x={x} y={y} fontSize="15" textAnchor="middle" dominantBaseline="central">⚽</text>
            ) : (
              <g transform={`translate(-6 4) rotate(30 ${x} ${y})`}>
                {/* pole up the flag's left edge + square flag at the top; the whole "P" tilts together */}
                <line x1={x} y1={y} x2={x} y2={y - 18} stroke="#0c3b2a" strokeWidth="1.5" />
                <rect x={x} y={y - 18} width={9} height={9} fill="#1f9d3f" stroke="#0c3b2a" strokeWidth="0.6" />
              </g>
            )}
          </g>
        );
      })}

      {/* end-point cumulative score labels */}
      {last && (
        <g>
          <text x={W - Rp + 6} y={pY(last.home) + 4} fontSize="13" fontWeight="700" fill={cHome}>{last.homeScore}</text>
          <text x={W - Rp + 6} y={pY(last.away) + 4} fontSize="13" fontWeight="700" fill={cAway}>{last.awayScore}</text>
        </g>
      )}

      {/* sub / card markers on the rail below the plot */}
      {chartMarkers.map((mk, i) => {
        const x = pX(mk.x);
        if (mk.kind === "sub") {
          return (
            <g key={i} style={{ cursor: "default" }}>
              <title>{mk.label}</title>
              <path d={`M ${x - 4} ${railY - 1} L ${x + 4} ${railY - 1} L ${x} ${railY - 7} Z`} fill="#1f7a4d" />
              <path d={`M ${x - 4} ${railY + 1} L ${x + 4} ${railY + 1} L ${x} ${railY + 7} Z`} fill="#c0392b" />
            </g>
          );
        }
        return (
          <g key={i} style={{ cursor: "default" }}>
            <title>{mk.label}</title>
            <rect x={x - 4} y={railY - 6} width={8} height={11} rx={1.5} fill={mk.kind === "red" ? "#c0392b" : "#f5c518"} stroke="#0c3b2a" strokeWidth={0.5} />
          </g>
        );
      })}

      {/* x-axis minute labels */}
      {minuteLabels.map((t, i) => (
        <text key={i} x={pX(t.x)} y={H - 6} fontSize="10" fill="#6f7d72" textAnchor="middle">{t.label}</text>
      ))}
    </svg>
  );
}
