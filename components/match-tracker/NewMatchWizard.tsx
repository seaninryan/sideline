"use client";
import React from "react";
import TeamPicker from "@/components/TeamPicker";
import SportIcon from "@/components/SportIcon";
import { SPORTS } from "@/lib/constants";

export interface NewMatchWizardProps {
  nw: any;                       // { stage, date, sport, home, away }
  setNw: (nw: any) => void;
  nwTeams: any[];
  nwPickHome: (team: any) => void;
  nwCreateHome: (name: string, squad?: string) => void | Promise<void>;
  nwPickAway: (team: any) => void;
  nwCreateAway: (name: string, squad?: string) => void | Promise<void>;
  finishNew: () => void;
  onCancel: () => void;
}

// New-match wizard (date → home team → away team → Create).
// Extracted from MatchTracker (decomposition) — behaviour-identical.
export default function NewMatchWizard({
  nw, setNw, nwTeams, nwPickHome, nwCreateHome, nwPickAway, nwCreateAway, finishNew, onCancel,
}: NewMatchWizardProps) {
  return (
          <div className="mt-game nw">
            <div className="mt-row" style={{ marginBottom: 8 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>{nw.stage === "home" ? "Home team" : nw.stage === "away" ? "Away team" : "New match"}</span>
              <button className="mt-add alt" onClick={onCancel}>✕ Cancel</button>
            </div>

            {(() => {
              const idx = nw.stage === "date" ? 0 : nw.stage === "home" ? 1 : 2;
              return (
                <div className="nw-steps" aria-label={`Step ${idx + 1} of 3`}>
                  {[0, 1, 2].map((i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className={"nw-bar" + (i <= idx ? " done" : "")} />}
                      <span className={"nw-dot" + (i === idx ? " on" : i < idx ? " done" : "")}>{i + 1}</span>
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}

            {/* stage 1 — when + sport */}
            {nw.stage === "date" && (
              <>
                <p className="nw-prompt">First, choose when the match will be</p>
                <div className="mt-row nw-date">
                  <input type="date" value={nw.date.slice(0, 10)} onChange={(e) => e.target.value && setNw({ ...nw, date: `${e.target.value}T${nw.date.slice(11, 16)}` })} />
                  <input type="time" value={nw.date.slice(11, 16)} onChange={(e) => e.target.value && setNw({ ...nw, date: `${nw.date.slice(0, 10)}T${e.target.value}` })} />
                </div>
                {(() => { const d = new Date(nw.date); return isNaN(d.getTime()) ? null : <p className="nw-dow">{d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>; })()}
                <p className="nw-prompt" style={{ marginTop: 18 }}>…and which sport</p>
                <div className="nw-sports">
                  {Object.entries(SPORTS).map(([k, s]) => (
                    <button key={k} className={"nw-sport" + (nw.sport === k ? " on" : "")} onClick={() => setNw({ ...nw, sport: k, home: null, away: null })}>
                      <SportIcon sport={k} size={22} /> <span>{s.label}</span>
                    </button>
                  ))}
                </div>
                <div className="nw-nav">
                  <span className="grow" />
                  <button className="nw-link" disabled={!nw.sport} onClick={() => setNw({ ...nw, stage: "home" })}>Next →</button>
                </div>
              </>
            )}

            {/* stage 2 — home team */}
            {nw.stage === "home" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Pick the home team, or create one.</p>
                <TeamPicker teams={nwTeams} sport={nw.sport} onPick={nwPickHome} onCreate={nwCreateHome} />
                <div className="nw-nav">
                  <button className="nw-link" onClick={() => setNw({ ...nw, stage: "date" })}>← Back</button>
                </div>
              </>
            )}

            {/* stage 3 — away team (Create finishes) */}
            {nw.stage === "away" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Pick the away team{nw.away ? <> — <b>{nw.away.name}</b></> : ", or create one"}.</p>
                <TeamPicker teams={nwTeams} sport={nw.sport} exclude={nw.home && nw.home.id} onPick={nwPickAway} onCreate={nwCreateAway} />
                <div className="nw-nav">
                  <button className="nw-link" onClick={() => setNw({ ...nw, stage: "home", away: null })}>← Back</button>
                  <button className="mt-big gm-team" style={{ flex: 1, marginLeft: 10 }} disabled={!nw.home || !nw.away} onClick={finishNew}>Create match →</button>
                </div>
              </>
            )}
          </div>
  );
}
