"use client";
import React from "react";
export default function ScoreChart({ series, goalDots, htLine, colorUs, colorThem }: {
  series: any[]; goalDots: any[]; htLine: any; colorUs: string; colorThem: string;
}) {
  const W = 720, H = 280, L = 40, Rp = 14, Tp = 14, Bp = 26;
  const xMax = Math.max(1, ...series.map((p) => p.x));
  const yMax = Math.max(1, ...series.map((p) => Math.max(p.us, p.them)));
  const pX = (x: number) => L + (W - L - Rp) * (x / xMax);
  const pY = (v: number) => (H - Bp) - ((H - Bp) - Tp) * (v / yMax);
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
  return (
    <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
      {grid.map((gd, i) => (
        <g key={i}>
          <line x1={L} y1={gd.y} x2={W - Rp} y2={gd.y} stroke="#e3d9bf" />
          <text x={L - 6} y={gd.y + 4} fontSize="11" fill="#6f7d72" textAnchor="end" fontFamily="Oswald,sans-serif">{gd.v}</text>
        </g>
      ))}
      {htLine != null && (
        <g>
          <line x1={pX(htLine)} y1={Tp} x2={pX(htLine)} y2={H - Bp} stroke="#0c3b2a" strokeDasharray="4 3" />
          <text x={pX(htLine)} y={Tp - 2} fontSize="10" fill="#0c3b2a" textAnchor="middle" fontWeight="700" fontFamily="Oswald,sans-serif">HT</text>
        </g>
      )}
      <path d={stepPath("them")} fill="none" stroke={colorThem} strokeWidth="2.5" />
      <path d={stepPath("us")} fill="none" stroke={colorUs} strokeWidth="3" />
      {goalDots.map((d, i) => (
        <circle key={i} cx={pX(d.x)} cy={pY(d.y)} r="4.5" fill={d.side === "us" ? colorUs : colorThem} stroke="#fff" strokeWidth="1.5" />
      ))}
    </svg>
  );
}
