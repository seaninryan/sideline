"use client";
import React, { useState } from "react";
import { teamStore } from "@/lib/team-store";
import { templateForSport } from "@/lib/team-templates";
import { renamePlayer, renumberPlayer, addPlayer, removePlayer } from "@/lib/team-roster";
import { mkId, contrastOn } from "@/lib/util";
import { PALETTE, SPORTS } from "@/lib/constants";
import type { TeamRecord, TeamRoster } from "@/lib/types";

const EMPTY: TeamRoster = { formation: [], players: [] };

export default function TeamEditor({ initial, onDone }: { initial?: TeamRecord | null; onDone: () => void }) {
  const [id] = useState(() => initial?.id || mkId());
  const [name, setName] = useState(initial?.name || "");
  const [color1, setColor1] = useState(initial?.color1 || "#f5c518");
  const [color2, setColor2] = useState(initial?.color2 || "#1f7a4d");
  const [sport, setSport] = useState(initial?.sport || "");
  const [roster, setRoster] = useState<TeamRoster>(initial?.roster || EMPTY);
  const [edit, setEdit] = useState<{ num: number; name: string; num2: string } | null>(null);
  const [pick, setPick] = useState<null | "c1" | "c2">(null);
  const [busy, setBusy] = useState(false);

  const byNum = (n: number) => roster.players.find((p) => p.num === n);
  const subs = roster.players.filter((p) => p.role === "sub");

  const chooseSport = (s: string) => {
    setSport(s);
    if (!s) return;
    if (roster.players.length && !window.confirm("Replace the current roster with the " + (SPORTS[s]?.label || s) + " template?")) return;
    setRoster(templateForSport(s));
  };

  const openSlot = (num: number) => { const p = byNum(num); setEdit({ num, name: p?.name || "", num2: String(num) }); };
  const applySlot = () => {
    if (!edit) return;
    let r = renamePlayer(roster, edit.num, edit.name.trim());
    const n2 = parseInt(edit.num2, 10);
    if (n2 >= 1 && n2 <= 99 && n2 !== edit.num) r = renumberPlayer(r, edit.num, n2);
    setRoster(r); setEdit(null);
  };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const rec: TeamRecord = { id, name: name.trim(), color1, color2, sport: sport || undefined, roster };
    const ok = await teamStore.set(rec);
    setBusy(false);
    if (ok) onDone();
  };

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
        <button className="mt-add alt" onClick={onDone}>✕ Cancel</button></div>

      <label className="te-field">Name <input className="mt-inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Racoons" /></label>
      <div className="te-field">Colours {swatch(color1, setColor1, "c1")} {swatch(color2, setColor2, "c2")}</div>
      <label className="te-field">Sport
        <select className="mt-sel" value={sport} onChange={(e) => chooseSport(e.target.value)}>
          <option value="">— none —</option>
          {Object.entries(SPORTS).map(([k, s]) => <option key={k} value={k}>{s.emoji} {s.label}</option>)}
        </select>
      </label>

      <p className="mt-note">Tap a player to name them. {sport ? "" : "Pick a sport to load a template, or add players below."}</p>
      <div className="te-pitch" style={{ background: `linear-gradient(${color2}22, #0c3b2a 60%)` }}>
        {roster.formation.map((row, ri) => (
          <div className="mt-line" key={ri}>
            {row.map((n) => { const p = byNum(n); return (
              <button className="mt-jersey te-slot" key={n} onClick={() => openSlot(n)}>
                <span className="j" style={{ background: color1, color: contrastOn(color1), borderBottom: `4px solid ${color2}` }}>{n}</span>
                <span className="nm">{p?.name || "—"}</span>
              </button>
            ); })}
          </div>
        ))}
      </div>

      {edit && (
        <div className="mt-live" style={{ marginTop: 8 }}>
          <div className="mt-row">
            <span className="mt-h" style={{ margin: 0 }}>Player {edit.num}</span>
            <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={() => setEdit(null)}>Cancel</button>
          </div>
          <input className="mt-inp" autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="player name" />
          <div className="mt-row" style={{ marginTop: 6 }}>
            <label className="mt-note">No. <input style={{ width: 54 }} value={edit.num2} onChange={(e) => setEdit({ ...edit, num2: e.target.value.replace(/\D/g, "") })} /></label>
            <button className="mt-add" onClick={applySlot}>OK</button>
            <button className="mt-add danger" onClick={() => { setRoster(removePlayer(roster, edit.num)); setEdit(null); }}>Remove</button>
          </div>
        </div>
      )}

      <p className="mt-h" style={{ marginTop: 12 }}>Subs</p>
      <div className="mt-bench">
        {subs.map((p) => <button className="b" key={p.num} onClick={() => openSlot(p.num)}>{p.num}. {p.name || "—"}</button>)}
      </div>
      <div className="mt-row" style={{ marginTop: 8 }}>
        <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "starting"))}>+ Player</button>
        <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "sub"))}>+ Sub</button>
      </div>

      <div className="mt-row" style={{ marginTop: 14 }}>
        <button className="mt-add" disabled={!name.trim() || busy} onClick={save}>{busy ? "Saving…" : "Save team"}</button>
      </div>
    </div>
  );
}
