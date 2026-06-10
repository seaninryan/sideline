"use client";
import React, { useState } from "react";
import { renamePlayer, setNumber, removePlayer, swapPositions, movePlayer } from "@/lib/team-roster";
import Jersey from "@/components/Jersey";
import type { TeamRoster } from "@/lib/types";

type Player = TeamRoster["players"][number];

// Shared formation pitch. Read-only by default; with `editable`, tap a jersey to
// edit its name + number in place (rename / renumber — a clashing number bumps
// the other player), ⇄ Swap two players' positions, or ↕ Move a player to
// another line / the bench. All mutations go through `onChange(newRoster)`.
export default function RosterPitch({ roster, color1, color2, editable = false, onChange }: {
  roster: TeamRoster;
  color1?: string;
  color2?: string;
  editable?: boolean;
  onChange?: (r: TeamRoster) => void;
}) {
  const c1 = color1 || "#f5c518", c2 = color2 || "#1f7a4d";
  const [editNum, setEditNum] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ name: string; num: string }>({ name: "", num: "" });
  const [mode, setMode] = useState<null | "swap" | "move">(null);
  const [pick, setPick] = useState<number | null>(null); // swap: first picked; move: player being moved

  const byNum = (n: number) => roster.players.find((p) => p.num === n);
  const subs = roster.players.filter((p) => p.role === "sub");

  const openEdit = (p: Player) => { setMode(null); setPick(null); setEditNum(p.num); setDraft({ name: p.name || "", num: String(p.num) }); };
  const commit = () => {
    if (editNum == null) return;
    const nn = parseInt(draft.num, 10);
    let r = roster, cur = editNum;
    if (!isNaN(nn) && nn >= 1 && nn <= 99 && nn !== editNum) { r = setNumber(r, editNum, nn); cur = nn; }
    r = renamePlayer(r, cur, draft.name.trim());
    onChange?.(r); setEditNum(null);
  };
  const remove = () => { if (editNum != null) { onChange?.(removePlayer(roster, editNum)); setEditNum(null); } };

  const setModeBtn = (m: "swap" | "move") => { setEditNum(null); setPick(null); setMode((cur) => (cur === m ? null : m)); };

  const tap = (p: Player) => {
    if (!editable) return;
    if (mode === "swap") {
      if (pick == null) return setPick(p.num);
      if (pick === p.num) return setPick(null);
      onChange?.(swapPositions(roster, pick, p.num)); setPick(null); setMode(null);
      return;
    }
    if (mode === "move") { setPick(pick === p.num ? null : p.num); return; }
    openEdit(p);
  };

  const doMove = (target: number | "new" | "subs") => {
    if (pick == null) return;
    onChange?.(movePlayer(roster, pick, target)); setPick(null); setMode(null);
  };

  const slot = (p: Player, jerseySize: number) => {
    if (editable && editNum === p.num) {
      return (
        <div className="rp-edit" key={p.num}>
          <input className="rp-num" inputMode="numeric" value={draft.num} maxLength={2} aria-label="Number"
            onChange={(e) => setDraft({ ...draft, num: e.target.value.replace(/\D/g, "") })}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditNum(null); }} />
          <input className="rp-name" autoFocus value={draft.name} placeholder="name" aria-label="Name"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditNum(null); }} />
          <div className="rp-edit-btns">
            <button className="mt-add" onClick={commit}>OK</button>
            <button className="mt-add alt" onClick={() => setEditNum(null)}>Cancel</button>
            <button className="mt-add danger" onClick={remove}>Remove</button>
          </div>
        </div>
      );
    }
    const picked = !!mode && pick === p.num;
    return (
      <button className={"rp-slot" + (editable ? " ed" : "") + (picked ? " picked" : "")} key={p.num} onClick={() => tap(p)} disabled={!editable}>
        <Jersey num={p.num} c1={c1} c2={c2} size={jerseySize} />
        <span className="nm">{p.name || "—"}</span>
      </button>
    );
  };

  const moveTargets = editable && mode === "move" && pick != null;

  const hint = mode === "swap"
    ? (pick != null ? "Tap the second player to swap" : "Tap two players to swap")
    : mode === "move"
      ? (pick != null ? "Choose where to move them ↓" : "Tap a player to move")
      : "";

  return (
    <div className="rp-pitch" style={{ background: `linear-gradient(${c2}22, transparent 55%), #0c3b2a` }}>
      {editable && (
        <div className="rp-tools">
          <button className={"mt-btn" + (mode === "swap" ? " solid" : "")} onClick={() => setModeBtn("swap")}>⇄ Swap</button>
          <button className={"mt-btn" + (mode === "move" ? " solid" : "")} onClick={() => setModeBtn("move")}>↕ Move</button>
          {hint && <span className="rp-hint">{hint}</span>}
        </div>
      )}

      {roster.formation.map((row, ri) => (
        <div className="mt-line rp-line" key={ri}>
          {moveTargets && <button className="rp-target" onClick={() => doMove(ri)} aria-label={`Move to line ${ri + 1}`}>＋</button>}
          {row.map((n) => { const p = byNum(n); return p ? slot(p, 46) : null; })}
        </div>
      ))}
      {moveTargets && (
        <div className="mt-line rp-line rp-newline">
          <button className="rp-target wide" onClick={() => doMove("new")}>＋ New line</button>
        </div>
      )}
      {(subs.length > 0 || moveTargets) && (
        <>
          <div className="rp-subhead">Subs{moveTargets && <button className="rp-target sm" onClick={() => doMove("subs")} aria-label="Move to subs">＋ here</button>}</div>
          <div className="mt-line rp-line">{subs.map((p) => slot(p, 38))}</div>
        </>
      )}
    </div>
  );
}
