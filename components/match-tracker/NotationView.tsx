"use client";
import React from "react";
import MinuteStep from "@/components/MinuteStep";
import { evIcon } from "@/lib/event-icons";
import { contrastOn } from "@/lib/util";
import { whoToken } from "@/lib/event-line";

export interface NotationViewProps {
  notaView: "blocks" | "text";
  setNotaView: (v: "blocks" | "text") => void;
  canUndo: boolean;
  undoRaw: () => void;
  setBlkEdit: (v: any) => void;
  setBlkIns: (v: any) => void;
  setLineupEdit: (v: any) => void;
  raw: string;
  setRaw: (v: string) => void;
  blocks: any;
  blkEdit: any;
  blkIns: any;
  blkOk: () => void;
  blkDelete: () => void;
  blkPill: (b: any) => React.ReactNode;
  openBlk: (b: any) => void;
  openInsert: (b: any) => void;
  liveEvents: any[];
  effMode: "gaa" | "goals";
  evLabel: (key: string) => string;
  colorHome: string;
  colorAway: string;
  homeName: string;
  awayName: string;
  gmPicker: (team: string, onPick: (p: any) => void, opts?: any) => React.ReactNode;
  insCommit: (line: string) => void;
  insPickTeam: (team: string) => void;
  buildEventLine: (ev: string, team: string, player: any, minute: any) => string;
  subWho: (p: any) => string;
  whoCtx: () => any;
  onPitchSet: (team: string) => any;
  benchSet: (team: string) => any;
  notePhantom: boolean;
  noteLine: () => string;
}

// Notation view (Advanced tab): block list / raw-text toggle, block edit + delete,
// and the guided insert flow. Extracted from MatchTracker (decomposition) — behaviour-identical.
export default function NotationView(props: NotationViewProps) {
  const {
    notaView, setNotaView, canUndo, undoRaw, setBlkEdit, setBlkIns, setLineupEdit,
    raw, setRaw, blocks, blkEdit, blkIns, blkOk, blkDelete, blkPill, openBlk, openInsert,
    liveEvents, effMode, evLabel, colorHome, colorAway, homeName, awayName,
    gmPicker, insCommit, insPickTeam, buildEventLine, subWho, whoCtx,
    onPitchSet, benchSet, notePhantom, noteLine,
  } = props;
  return (
          <>
            <div className="mt-row" style={{ marginTop: 0, marginBottom: 6 }}>
              <p className="mt-h" style={{ margin: 0, flex: 1 }}>{notaView === "blocks" ? "Notation — tap a line to edit" : "Raw notation (edit freely — re-parses instantly)"}</p>
              {canUndo && <button className="mt-add alt" onClick={undoRaw}>↩ Undo</button>}
              <button className="mt-add alt" onClick={() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setNotaView(notaView === "blocks" ? "text" : "blocks"); }}>
                {notaView === "blocks" ? "Edit as text" : "Blocks"}
              </button>
            </div>
            {notaView === "text" ? (
              <>
                <textarea className="mt-ta" value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
                <p className="mt-note" style={{ marginTop: 8 }}>
                  Format reminder: header <code>Team @ Opp</code> (@ = away, v = home) · roster <code>11. Rick</code> ·
                  start each half with the clock time on its own line · scoring lines <code>min scorer [free|goal|own goal|'65|'45]</code> ·
                  opposition = <code>T</code> / <code>T11</code> · subs <code>X for Y</code> · cards <code>min who yellow|red card</code> ·
                  corners <code>min [T] corner</code> · added time <code>min HT +3</code> · notes anything else.
                </p>
              </>
            ) : (
              <div className="mt-blks">
                {blocks.list.map((b: any) => (
                  <React.Fragment key={b.idx}>
                    {blkEdit && blkEdit.idx === b.idx ? (
                      <div className="mt-blk editing">
                        {blkEdit.minute != null && <MinuteStep val={blkEdit.minute} onChange={(m) => setBlkEdit({ ...blkEdit, minute: m, confirmDel: false })} />}
                        <input className="mt-blkta" style={{ marginTop: blkEdit.minute != null ? 7 : 0 }} value={blkEdit.rest}
                          onChange={(e) => setBlkEdit({ ...blkEdit, rest: e.target.value, confirmDel: false })} spellCheck={false} />
                        <div className="mt-blkrow">
                          <button className="mt-add" onClick={blkOk}>OK</button>
                          <button className="mt-add alt" onClick={() => setBlkEdit(null)}>Cancel</button>
                          {blkEdit.kind !== "half" && (
                            <button className={"mt-add danger" + (blkEdit.confirmDel ? " armed" : "")} onClick={blkDelete}>
                              {blkEdit.confirmDel ? "Tap again to delete" : "Delete"}
                            </button>
                          )}
                        </div>
                        {blkEdit.minute != null && <p className="mt-note" style={{ margin: "6px 0 0" }}>OK re-parses — changing the minute moves the line to its spot in the half.</p>}
                      </div>
                    ) : (
                      <div className="mt-blk">
                        <button className="mt-blk-main" onClick={() => openBlk(b)}>{blkPill(b)}<span className="t">{b.text}</span></button>
                        <button className="mt-blk-add" onClick={() => openInsert(b)} title="Insert event after this line" aria-label="Insert after">＋</button>
                      </div>
                    )}
                    {blkIns && blkIns.afterIdx === b.idx && (
                      <div className="mt-blk editing">
                        <p className="mt-h" style={{ margin: "0 0 6px" }}>Insert after "{b.text.slice(0, 24)}…"</p>
                        {blkIns.stage !== "note" && <MinuteStep val={blkIns.minute} onChange={(m) => setBlkIns({ ...blkIns, minute: m })} />}

                        {/* stage 1 — what happened? (+ sub / note) */}
                        {blkIns.stage === "event" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>What happened?</p>
                            <div className="mt-grid">
                              {liveEvents.filter((ev) => !["half", "ht", "ft"].includes(ev.key)).map((ev) => (
                                <button key={ev.key} className="mt-big sm ev" onClick={() => setBlkIns({ ...blkIns, stage: "team", ev: ev.key })}>{evIcon(ev.key, effMode)}<span>{ev.label}</span></button>
                              ))}
                            </div>
                            <div className="mt-grid" style={{ marginTop: 7 }}>
                              <button className="mt-big sm ev" onClick={() => setBlkIns({ ...blkIns, stage: "team", ev: "sub" })}>{evIcon("sub")}<span>Sub</span></button>
                              <button className="mt-big sm" onClick={() => setBlkIns({ ...blkIns, stage: "note" })}>Note</button>
                            </div>
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns(null)}>Cancel</button></div>
                          </>
                        )}

                        {/* stage 2 — which team? */}
                        {blkIns.stage === "team" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{evLabel(blkIns.ev)} — which team?</p>
                            <div className="mt-grid">
                              <button className="mt-big sm" style={{ background: colorHome, color: contrastOn(colorHome) }} onClick={() => insPickTeam("home")}>{homeName}</button>
                              <button className="mt-big sm" style={{ background: colorAway, color: contrastOn(colorAway) }} onClick={() => insPickTeam("away")}>{awayName}</button>
                            </div>
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "event", ev: null })}>← Back</button></div>
                          </>
                        )}

                        {/* stage 3 — which player? */}
                        {blkIns.stage === "who" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{evLabel(blkIns.ev)} · {blkIns.team === "away" ? awayName : homeName} — who?</p>
                            {gmPicker(blkIns.team, (p) => insCommit(buildEventLine(blkIns.ev, blkIns.team, p, blkIns.minute)), { allowUnknown: true })}
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "team" })}>← Back</button></div>
                          </>
                        )}

                        {/* sub flow — off then on, on the team's jersey pitch (eligibility tracked) */}
                        {blkIns.stage === "subOff" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{blkIns.team === "away" ? awayName : homeName} sub — who goes off?</p>
                            {gmPicker(blkIns.team, (p) => setBlkIns({ ...blkIns, stage: "subOn", off: p }), { eligible: onPitchSet(blkIns.team) })}
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "team" })}>← Back</button></div>
                          </>
                        )}
                        {blkIns.stage === "subOn" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{subWho(blkIns.off)} off — who comes on?</p>
                            {gmPicker(blkIns.team, (p) => insCommit(`${blkIns.minute} ${whoToken(p, blkIns.team, whoCtx())} for ${whoToken(blkIns.off, blkIns.team, whoCtx())}`), { eligible: benchSet(blkIns.team) })}
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "subOff" })}>← Back</button></div>
                          </>
                        )}

                        {/* note flow */}
                        {blkIns.stage === "note" && (
                          <>
                            <input className="mt-blkta" style={{ marginTop: 7 }} placeholder="note text" value={blkIns.noteText} onChange={(e) => setBlkIns({ ...blkIns, noteText: e.target.value })} />
                            <label className="mt-note" style={{ display: "block", marginTop: 6 }}>
                              <input type="checkbox" checked={blkIns.noteMin} onChange={(e) => setBlkIns({ ...blkIns, noteMin: e.target.checked })} /> attach a minute
                            </label>
                            {blkIns.noteMin && <MinuteStep val={blkIns.minute} onChange={(m) => setBlkIns({ ...blkIns, minute: m })} />}
                            {notePhantom && <p className="mt-note" style={{ color: "#c0392b", margin: "4px 0 0" }}>Careful — a minuted line with no note keyword reads as a score. Leave the minute off for a plain note.</p>}
                            <div className="mt-blkrow">
                              <button className="mt-add" disabled={!noteLine()} onClick={() => insCommit(noteLine())}>OK</button>
                              <button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "event" })}>← Back</button>
                            </div>
                          </>
                        )}

                        {["event", "team", "who", "subOff", "subOn"].includes(blkIns.stage) && (
                          <p className="mt-note" style={{ margin: "8px 0 0" }}>Lands by minute within the half — may sit further down than where you tapped.</p>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
                {blocks.list.length === 0 && <p className="mt-note">Nothing yet — tap Start half above at throw-in, or Edit as text.</p>}
              </div>
            )}
          </>
  );
}
