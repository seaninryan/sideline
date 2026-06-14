"use client";
import React from "react";
import Timeline from "@/components/Timeline";
import { evIcon } from "@/lib/event-icons";
import { contrastOn } from "@/lib/util";

export interface GameModeViewProps {
  phase: "pre" | "ht" | "play" | "over";
  halfMarks: any[];
  gmStage: any;
  setGmStage: (s: any) => void;
  liveEvents: any[];
  effMode: "gaa" | "goals";
  homeName: string;
  awayName: string;
  colorHome: string; colorAway: string; colorHome2: string; colorAway2: string;
  homeColor: string; awayColor: string; homeColor2: string; awayColor2: string;
  timelineHA: any[];
  undoTarget: any;
  canUndo: boolean;
  evLabel: (key: string) => string;
  addLive: (ev: string, player: any, team?: string) => void;
  pickGmTeam: (team: string) => void;
  gmPicker: (team: string, onPick: (p: any) => void, opts?: any) => React.ReactNode;
  onPitchSet: (team: string) => any;
  benchSet: (team: string) => any;
  completeSub: (on: any, off: any, team?: string) => void;
  undoRaw: () => void;
}

export default function GameModeView(props: GameModeViewProps) {
  const {
    phase, halfMarks, gmStage, setGmStage, liveEvents, effMode,
    homeName, awayName, colorHome, colorAway, colorHome2, colorAway2,
    homeColor, awayColor, homeColor2, awayColor2,
    timelineHA, undoTarget, canUndo, evLabel,
    addLive, pickGmTeam, gmPicker, onPitchSet, benchSet, completeSub, undoRaw,
  } = props;
  return (
          <div className="mt-game">
            <div className={"gm-phase gm-phase--" + phase}>
              <span className="dot" />
              <span className="lbl">
                {phase === "pre" ? "Before throw-in" : phase === "ht" ? "Half time" : phase === "over" ? "Full time" : `Half ${halfMarks.filter((m) => !m.marker).length} · in play`}
              </span>
            </div>

            {/* full time: only Undo + a pointer to Advanced */}
            {phase === "over" && (
              <p className="mt-note" style={{ marginTop: 0 }}>
                <b>Full time — match closed.</b> Need to change something? Edit it in the <b>Advanced</b> tab. (Or undo the FT line below to keep adding.)
              </p>
            )}

            {/* stage 1 — what happened? all events here; team is picked next where it matters */}
            {phase !== "over" && gmStage.stage === "event" && (
              (phase === "pre" || phase === "ht") ? (
                <>
                  <div className="mt-grid">
                    <button className="mt-big gm-team ev" onClick={() => addLive("half", null)}>{evIcon("half")}<span>Start half</span></button>
                  </div>
                  <p className="mt-note" style={{ marginTop: 10, marginBottom: 0 }}>
                    {phase === "pre" ? "Tap Start half at throw-in to open scoring." : "Half time — Start half opens the second half."}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>What happened?</p>
                  <div className="mt-grid">
                    {liveEvents.filter((ev) => !["half", "ht", "ft"].includes(ev.key)).map((ev) => (
                      <button key={ev.key} className="mt-big ev" onClick={() => setGmStage({ stage: "team", ev: ev.key })}>{evIcon(ev.key, effMode)}<span>{ev.label}</span></button>
                    ))}
                    <button className="mt-big ev" onClick={() => setGmStage({ stage: "team", ev: "sub" })}>{evIcon("sub")}<span>Sub</span></button>
                  </div>
                  <div className="mt-grid" style={{ marginTop: 10 }}>
                    <button className="mt-big ev" onClick={() => addLive("ht", null)}>{evIcon("ht")}<span>HT</span></button>
                    <button className="mt-big ev" onClick={() => addLive("ft", null)}>{evIcon("ft")}<span>FT</span></button>
                  </div>
                </>
              )
            )}

            {/* stage 2 — which team? (scores, cards, corner, sub) */}
            {phase !== "over" && gmStage.stage === "team" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{evLabel(gmStage.ev)} — which team?</p>
                <div className="mt-grid">
                  <button className="mt-big gm-team" style={{ background: colorHome, color: contrastOn(colorHome) }} onClick={() => pickGmTeam("home")}>{homeName}</button>
                  <button className="mt-big gm-team" style={{ background: colorAway, color: contrastOn(colorAway) }} onClick={() => pickGmTeam("away")}>{awayName}</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "event" })}>← Back</button>
              </>
            )}

            {/* stage 3 — which player? (scores / cards) */}
            {phase !== "over" && gmStage.stage === "who" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{evLabel(gmStage.ev)} · {gmStage.team === "away" ? awayName : homeName} — who?</p>
                {gmPicker(gmStage.team, (p) => { addLive(gmStage.ev, p, gmStage.team); setGmStage({ stage: "event" }); }, { allowUnknown: true })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team", ev: gmStage.ev })}>← Back</button>
              </>
            )}

            {/* sub flow — off then on, on the team's jersey pitch */}
            {phase !== "over" && gmStage.stage === "subOff" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.team === "away" ? awayName : homeName} sub — who goes off?</p>
                {gmPicker(gmStage.team, (p) => setGmStage({ ...gmStage, stage: "subOn", off: p }), { eligible: onPitchSet(gmStage.team) })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team", ev: "sub" })}>← Back</button>
              </>
            )}
            {phase !== "over" && gmStage.stage === "subOn" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.off.name || gmStage.off.num} off — who comes on?</p>
                {gmPicker(gmStage.team, (p) => { completeSub(p, gmStage.off, gmStage.team); setGmStage({ stage: "event" }); }, { eligible: benchSet(gmStage.team) })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ ...gmStage, stage: "subOff" })}>← Back</button>
              </>
            )}

            {/* pinned bottom: last entry + undo */}
            <div className="gm-undo">
              <span className="t">{undoTarget ? `Last: ${undoTarget.text}` : "Nothing added yet"}</span>
              <button className="mt-add alt" disabled={!canUndo} onClick={undoRaw}>↩ Undo</button>
            </div>

            {/* running timeline beneath the controls */}
            <p className="mt-h" style={{ marginTop: 16 }}>Timeline</p>
            <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} nameHome={homeName} nameAway={awayName} />
          </div>
  );
}
