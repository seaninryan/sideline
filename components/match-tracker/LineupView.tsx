"use client";
import React from "react";
import RosterPitch from "@/components/RosterPitch";
import Jersey from "@/components/Jersey";
import { addPlayer } from "@/lib/team-roster";

export interface LineupViewProps {
  editLineup: any;                 // false | "home" | "away"
  setEditLineup: (v: any) => void;
  homeRoster: any;
  awayRoster: any;
  setHomeRoster: (r: any) => void;
  setAwayRoster: (r: any) => void;
  EMPTY_ROSTER: any;
  colorHome: string; colorAway: string; colorHome2: string; colorAway2: string;
  homeName: string; awayName: string;
  formationRows: any[];
  chunk: (arr: any[], n: number) => any[][];
  starters: any[];
  subs: any[];
  missing: any[];
  subPick: any;
  setSubPick: (v: any) => void;
  tapPlayer: (player: any, role: string, side: string) => void;
  subArrows: (num: number, side: string) => React.ReactNode;
  playerMarks: (num: number, side: string) => React.ReactNode;
  scoreFor: (num: number, side: string) => React.ReactNode;
}

// Lineup view: two editable jersey pitches (home/away) with tap-to-sub, plus the
// per-team roster editor. Extracted from MatchTracker (decomposition) — behaviour-identical.
export default function LineupView(props: LineupViewProps) {
  const {
    editLineup, setEditLineup, homeRoster, awayRoster, setHomeRoster, setAwayRoster, EMPTY_ROSTER,
    colorHome, colorAway, colorHome2, colorAway2, homeName, awayName,
    formationRows, chunk, starters, subs, missing,
    subPick, setSubPick, tapPlayer, subArrows, playerMarks, scoreFor,
  } = props;
  return (editLineup ? (() => {
          const side = editLineup === "away" ? "away" : "home";
          const roster = (side === "away" ? awayRoster : homeRoster) || EMPTY_ROSTER;
          const setRoster = side === "away" ? setAwayRoster : setHomeRoster;
          const c1 = side === "away" ? colorAway : colorHome, c2 = side === "away" ? colorAway2 : colorHome2;
          const nm = side === "away" ? awayName : homeName;
          return (
            <>
              <div className="mt-row" style={{ marginBottom: 8 }}>
                <span className="mt-h" style={{ margin: 0, flex: 1 }}>Edit {nm} — tap to rename/renumber; ⇄ Swap or ↕ Move</span>
                <button className="mt-add" onClick={() => setEditLineup(false)}>✓ Done</button>
              </div>
              <RosterPitch roster={roster} color1={c1} color2={c2} editable onChange={setRoster} />
              <div className="mt-row" style={{ marginTop: 8 }}>
                <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "starting"))}>+ Player</button>
                <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "sub"))}>+ Sub</button>
              </div>
            </>
          );
        })() : (() => {
          // one editable pitch per side, keyed by venue; home then away
          const renderEditPitch = (side: string) => {
            const isHome = side === "home";
            const rosterObj = isHome ? homeRoster : awayRoster;
            const c1 = isHome ? colorHome : colorAway, c2 = isHome ? colorHome2 : colorAway2;
            const nm = isHome ? homeName : awayName;
            const players = (rosterObj && rosterObj.players) || [];
            const rows = isHome
              ? formationRows
              : ((rosterObj && rosterObj.formation && rosterObj.formation.length)
                  ? rosterObj.formation
                  : chunk(players.filter((p: any) => p.role !== "sub").map((p: any) => p.num), 3));
            const sideStarters = isHome ? starters : players.filter((p: any) => p.role !== "sub" && p.role !== "missing");
            const sideSubs = isHome ? subs : players.filter((p: any) => p.role === "sub");
            const sideMissing = isHome ? missing : players.filter((p: any) => p.role === "missing");
            const hasLineup = isHome ? formationRows.length > 0 : (rosterObj && rosterObj.formation && rosterObj.formation.length > 0);
            return (
              <React.Fragment key={side}>
                <div className="mt-row" style={{ marginTop: isHome ? 0 : 18, marginBottom: 6 }}>
                  <span className="mt-h" style={{ margin: 0, flex: 1 }}>{nm}</span>
                  <button className="mt-add alt" onClick={() => setEditLineup(side)}>✎ Edit lineup</button>
                </div>
                {hasLineup ? (
                  <div className="mt-pitch" style={{ background: `linear-gradient(${c2}22, #0c3b2a 60%)` }}>
                    {rows.map((row: any, ri: number) => (
                      <div className="mt-line" key={ri}>
                        {row.map((n: any) => {
                          const p = sideStarters.find((x: any) => x.num === n);
                          const picked = subPick && subPick.side === side && subPick.role === "off" && subPick.num === n;
                          return (
                            <div className="mt-jersey" key={n} style={{ cursor: "pointer", outline: picked ? "2px solid #f5c518" : "none", outlineOffset: 2, borderRadius: 8 }} onClick={() => tapPlayer({ num: n, name: p ? p.name : String(n) }, "pitch", side)}>
                              <Jersey c1={c1} c2={c2} num={n} size={isHome ? 44 : 40} />
                              <div className="nm">{p ? p.name : ""} {subArrows(n, side)}{playerMarks(n, side)}</div>
                              {scoreFor(n, side)}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {sideSubs.length > 0 && (
                      <>
                        <div className="rp-subhead">Subs</div>
                        <div className="mt-line">
                          {sideSubs.map((p: any) => {
                            const picked = subPick && subPick.side === side && subPick.role === "on" && subPick.num === p.num;
                            return (
                              <div className="mt-jersey" key={p.num} style={{ cursor: "pointer", outline: picked ? "2px solid #f5c518" : "none", outlineOffset: 2, borderRadius: 8 }} onClick={() => tapPlayer({ num: p.num, name: p.name }, "bench", side)}>
                                <Jersey c1={c1} c2={c2} num={p.num} size={36} />
                                <div className="nm">{p.name} {subArrows(p.num, side)}{playerMarks(p.num, side)}</div>
                                {scoreFor(p.num, side)}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="mt-note">No {nm} lineup yet — tap Edit lineup to add players.</p>
                )}
                {sideMissing.length > 0 && <><p className="mt-h" style={{ marginTop: 14 }}>Missing</p><div className="mt-bench">{sideMissing.map((p: any) => <span className="b miss" key={p.num}>{p.num}. {p.name}</span>)}</div></>}
              </React.Fragment>
            );
          };
          return (
            <>
              {renderEditPitch("home")}
              {subPick ? (
                <div className="mt-live" style={{ marginTop: 10, marginBottom: 0 }}>
                  <div className="mt-row">
                    <span className="mt-h" style={{ margin: 0 }}>
                      {subPick.role === "off" ? <>{subPick.num}. {subPick.name} off — now tap who comes on</> : <>{subPick.num}. {subPick.name} on — now tap who comes off</>}
                    </span>
                    <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={() => setSubPick(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="mt-note" style={{ marginTop: 8 }}>Substitution: tap the player going off and the sub coming on (either order). The minute is filled in for you — edit it in Notation any time.</p>
              )}
              {renderEditPitch("away")}
            </>
          );
        })());
}
