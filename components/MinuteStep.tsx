"use client";
import React from "react";
export default function MinuteStep({ val, onChange }: { val: number; onChange: (n: number) => void }) {
  return (
    <div className="mt-minstep">
      <button onClick={() => onChange((val + 59) % 60)}>−</button>
      <input inputMode="numeric" value={val}
        onChange={(e) => { const n = parseInt(e.target.value, 10); onChange(isNaN(n) ? 0 : Math.min(59, Math.max(0, n))); }} />
      <button onClick={() => onChange((val + 1) % 60)}>+</button>
      <span style={{ fontSize: 11, color: "#9a8c66" }}>min</span>
    </div>
  );
}
