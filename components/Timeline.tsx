import React from "react";

// Shared centre-rail timeline (editor Details tab + public page). Home events
// sit on the left half (minute + name on the outer edge, running score by the
// rail), the away team mirrors to the right; a kit-coloured dot rides the rail.
// Renders every event type: scores (scorer + goal/free pill + running score),
// cards (coloured), corners (ordinal), subs (▲ on / ▼ off), notes, added-time.
export default function Timeline({ timeline = [], halfMarks = [], colorHome, colorHome2, colorAway, colorAway2, nameHome = "Home", nameAway = "Away" }: {
  timeline?: any[]; halfMarks?: any[];
  colorHome: string; colorHome2: string; colorAway: string; colorAway2: string;
  nameHome?: string; nameAway?: string;
}) {
  if (!timeline.length) return <p style={{ color: "#6f7d72" }}>No events recorded.</p>;
  return (
    <div className="mt-tl">
      {[1, 2].map((h) => {
        const items = timeline.filter((t) => t.half === h);
        if (!items.length) return null;
        const mk = halfMarks.find((m) => m.half === h && m.clock);
        const addedMk = halfMarks.find((m) => m.half === h && m.marker && m.added > 0);
        return (
          <div key={h}>
            <div className="mt-half">{h === 1 ? "First half" : "Second half"}{mk ? ` · ${mk.clock}` : ""}</div>
            {items.map((it, i) => {
              const mm = it.minute != null ? `${it.mmin || it.minute}'` : "✎";
              if (it.kind === "score") {
                const descriptive = !it.sure && it.scorer && it.scorer !== "Opposition" && it.scorer !== "Unknown";
                const evName = it.scorer === "Opposition" ? nameAway : it.scorer;
                return (
                  <div key={i} className={`mt-ev ${it.side} ${it.type}`} style={{ "--dot": it.side === "home" ? colorHome : colorAway, "--ring": it.side === "home" ? colorHome2 : colorAway2 } as React.CSSProperties}>
                    <span className="m">{it.mmin || it.minute}'</span>
                    <span>
                      {descriptive
                        ? <>{it.type === "goal" && <span className="mt-pill goal" style={{ marginLeft: 0, marginRight: 6 }}>goal</span>}<span style={{ color: "#6f7d72" }}>{it.desc || it.scorer}</span></>
                        : <>{evName}{it.type === "goal" ? <span className="mt-pill goal">goal</span> : it.fromFree ? <span className="mt-pill free">free</span> : it.setPiece ? <span className="mt-pill free">&apos;{it.setPiece}</span> : ""}</>}
                    </span>
                    <span className="sc"><span className={it.side === "home" ? "chg" : ""}>{it.homeScore}</span> – <span className={it.side === "away" ? "chg" : ""}>{it.awayScore}</span></span>
                  </div>
                );
              }
              if (it.kind === "card") {
                const who = it.side === "away" && (!it.who || /^t\d*$/i.test(it.who)) ? nameAway : (it.who || nameHome);
                return <div key={i} className={"mt-ev note" + (it.side === "away" ? " away" : "")}>
                  <span className="m">{mm}</span>
                  <span><span style={{ display: "inline-block", width: 9, height: 12, borderRadius: 2, background: it.card === "red" ? "#e74c3c" : "#f1c40f", border: "1px solid rgba(0,0,0,.25)", verticalAlign: "-2px", marginRight: 6 }} />{who}</span>
                </div>;
              }
              if (it.kind === "corner") {
                const nth = timeline.filter((x) => x.kind === "corner" && x.side === it.side && x.seq <= it.seq).length;
                const ord = nth === 1 ? "1st" : nth === 2 ? "2nd" : nth === 3 ? "3rd" : `${nth}th`;
                return <div key={i} className={"mt-ev note" + (it.side === "away" ? " away" : "")}>
                  <span className="m">{mm}</span>
                  <span style={{ color: "#6f7d72" }}>⚑ {ord} corner — {it.side === "away" ? nameAway : nameHome}</span>
                </div>;
              }
              if (it.kind === "sub") return <div key={i} className="mt-ev subev"><span className="m">{mm}</span><span><span style={{ color: "#1f7a4d", fontWeight: 600 }}>▲ {it.on}</span>&ensp;<span style={{ color: "#c0392b", fontWeight: 600 }}>▼ {it.off}</span></span></div>;
              return <div key={i} className="mt-ev note"><span className="m">{mm}</span><span style={{ color: "#6f7d72" }}>{it.text}</span></div>;
            })}
            {addedMk && <div className="mt-ev mid"><span className="chip">⏱ +{addedMk.added} added</span></div>}
          </div>
        );
      })}
    </div>
  );
}
