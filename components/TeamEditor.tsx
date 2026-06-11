"use client";
import React, { useEffect, useRef, useState } from "react";
import { teamStore } from "@/lib/team-store";
import { templateForSport } from "@/lib/team-templates";
import { addPlayer } from "@/lib/team-roster";
import { mkId } from "@/lib/util";
import { PALETTE, SPORTS } from "@/lib/constants";
import RosterPitch from "@/components/RosterPitch";
import PrivacyControl from "@/components/PrivacyControl";
import { privacyLevel, levelToColumns, type PrivacyLevel } from "@/lib/privacy";
import type { TeamRecord, TeamRoster, NameDisplay } from "@/lib/types";

const EMPTY: TeamRoster = { formation: [], players: [] };

export default function TeamEditor({ initial, onDone }: { initial?: TeamRecord | null; onDone: () => void }) {
  const [id] = useState(() => initial?.id || mkId());
  const [name, setName] = useState(initial?.name || "");
  const [color1, setColor1] = useState(initial?.color1 || "#f5c518");
  const [color2, setColor2] = useState(initial?.color2 || "#1f7a4d");
  const [sport, setSport] = useState(initial?.sport || "");
  const [roster, setRoster] = useState<TeamRoster>(initial?.roster || EMPTY);
  const [pick, setPick] = useState<null | "c1" | "c2">(null);

  // sharing (existing teams only)
  const [level, setLevel] = useState<PrivacyLevel>(privacyLevel(!!initial?.is_public, initial?.listed));
  const [nameDisp, setNameDisp] = useState<NameDisplay>(initial?.name_display || "full");
  const [shareBusy, setShareBusy] = useState(false);

  const applyLevel = async (next: PrivacyLevel) => {
    setShareBusy(true);
    setLevel(next);
    await teamStore.setPrivacy(id, levelToColumns(next));
    setShareBusy(false);
  };
  const changeNameDisp = async (v: NameDisplay) => {
    setNameDisp(v);
    if (level !== "private") { setShareBusy(true); await teamStore.setNameDisplay(id, v); setShareBusy(false); }
  };

  const chooseSport = (s: string) => {
    setSport(s);
    if (!s) return;
    if (roster.players.length && !window.confirm("Replace the current roster with the " + (SPORTS[s]?.label || s) + " template?")) return;
    setRoster(templateForSport(s));
  };

  const persist = () => { if (name.trim()) teamStore.set({ id, name: name.trim(), color1, color2, sport: sport || undefined, roster }); };
  // auto-save 0.8s after any change (skip the first render)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(persist, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, color1, color2, sport, roster]);
  const done = () => { persist(); onDone(); };

  const swatch = (val: string, set: (c: string) => void, which: "c1" | "c2") => (
    <>
      <button className="mt-swatch" style={{ background: val }} onClick={() => setPick(pick === which ? null : which)} />
      {pick === which && (
        <div className="te-pick">
          {PALETTE.map((c) => <button key={c} className="mt-swatch" style={{ background: c }} onClick={() => { set(c); setPick(null); }} />)}
          <input type="color" value={val} onChange={(e) => set(e.target.value)} />
        </div>
      )}
    </>
  );

  return (
    <div className="te">
      <div className="mt-row"><span className="mt-h" style={{ flex: 1, margin: 0 }}>{initial ? "Edit team" : "New team"}</span>
        <button className="mt-add alt" onClick={done}>‹ Done</button></div>

      <label className="te-field">Name <input className="mt-inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Racoons" /></label>
      <div className="te-field">Colours {swatch(color1, setColor1, "c1")} {swatch(color2, setColor2, "c2")}</div>
      <label className="te-field">Sport
        <select className="mt-sel" value={sport} onChange={(e) => chooseSport(e.target.value)}>
          <option value="">— none —</option>
          {Object.entries(SPORTS).map(([k, s]) => <option key={k} value={k}>{s.emoji} {s.label}</option>)}
        </select>
      </label>

      <p className="mt-note">Tap a player to edit name &amp; number; ⇄ Swap or ↕ Move to rearrange. {sport ? "" : "Pick a sport to load a template, or add players below."}</p>
      <RosterPitch roster={roster} color1={color1} color2={color2} editable onChange={setRoster} />
      <div className="mt-row" style={{ marginTop: 8 }}>
        <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "starting"))}>+ Player</button>
        <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "sub"))}>+ Sub</button>
      </div>

      {initial && (
        <div className="mt-live" style={{ marginTop: 16 }}>
          <PrivacyControl
            level={level}
            onLevel={applyLevel}
            link={typeof location !== "undefined" ? location.origin + "/t/" + (initial?.short_code || id) : undefined}
            nameDisplay={nameDisp}
            onNameDisplay={changeNameDisp}
            busy={shareBusy}
          />
        </div>
      )}
    </div>
  );
}
