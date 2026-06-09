"use client";
import React, { useEffect, useState } from "react";
import { teamStore } from "@/lib/team-store";
import { teamLinkPatch } from "@/lib/team-link";
import { SPORTS } from "@/lib/constants";
import type { MatchRecord, TeamRecord } from "@/lib/types";

// Inline panel to link a match to two team entities. `record` is the live match record and
// `currentHomeAway` its parsed venue; onApply receives the patch from teamLinkPatch
// (raw + identity + ids + oppRoster) to merge into editor state.
export default function LinkTeams({ userId, record, currentHomeAway, onApply, onClose }: {
  userId: string;
  record: MatchRecord;
  currentHomeAway: "home" | "away";
  onApply: (patch: ReturnType<typeof teamLinkPatch>) => void;
  onClose: () => void;
}) {
  const [teams, setTeams] = useState<TeamRecord[] | null>(null);
  const [usId, setUsId] = useState<string>(record.homeTeamId && record.awayTeamId
    ? (currentHomeAway === "home" ? record.homeTeamId : record.awayTeamId)! : "");
  const [oppId, setOppId] = useState<string>(record.homeTeamId && record.awayTeamId
    ? (currentHomeAway === "home" ? record.awayTeamId : record.homeTeamId)! : "");
  const [homeAway, setHomeAway] = useState<"home" | "away">(currentHomeAway);

  useEffect(() => { teamStore.list(userId).then(setTeams); }, [userId]);

  const apply = () => {
    const usTeam = (teams || []).find((t) => t.id === usId);
    const oppTeam = (teams || []).find((t) => t.id === oppId);
    if (!usTeam || !oppTeam) return;
    onApply(teamLinkPatch(record, { usTeam, oppTeam, homeAway }));
    onClose();
  };

  const opt = (t: TeamRecord) => <option key={t.id} value={t.id}>{t.sport && SPORTS[t.sport] ? SPORTS[t.sport].emoji + " " : ""}{t.name}</option>;

  return (
    <div className="mt-live" style={{ marginTop: 0 }}>
      <div className="mt-row"><span className="mt-h" style={{ margin: 0, flex: 1 }}>Link teams</span>
        <button className="mt-add alt" onClick={onClose}>✕ Close</button></div>
      {teams === null ? <p className="mt-note">Loading your teams…</p>
        : teams.length === 0 ? <p className="mt-note">No teams yet — create one in <b>Teams</b> first.</p>
        : <>
            <label className="te-field">Your team
              <select className="mt-sel" value={usId} onChange={(e) => setUsId(e.target.value)}><option value="">— pick —</option>{teams.map(opt)}</select></label>
            <label className="te-field">Opponent
              <select className="mt-sel" value={oppId} onChange={(e) => setOppId(e.target.value)}><option value="">— pick —</option>{teams.map(opt)}</select></label>
            <div className="mt-grid" style={{ marginBottom: 8 }}>
              <button className={"mt-big" + (homeAway === "home" ? " on" : " off")} onClick={() => setHomeAway("home")}>Home (v)</button>
              <button className={"mt-big" + (homeAway === "away" ? " on" : " off")} onClick={() => setHomeAway("away")}>Away (@)</button>
            </div>
            <p className="mt-note">Links the match for fixtures, seeds your lineup (if empty), and snapshots the opponent's lineup. Your scores aren't changed.</p>
            <button className="mt-add" disabled={!usId || !oppId || usId === oppId} onClick={apply}>Link</button>
          </>}
    </div>
  );
}
