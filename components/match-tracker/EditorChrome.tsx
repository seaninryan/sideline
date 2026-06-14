"use client";
import React from "react";
import AppHeader from "@/components/AppHeader";
import ScoreHeader from "@/components/ScoreHeader";
import ShareSheet from "@/components/ShareSheet";
import ShareImageModal from "@/components/ShareImageModal";
import TeamPicker from "@/components/TeamPicker";
import { gpTotal, fmtDateDow } from "@/lib/util";
import { PALETTE, SPORTS } from "@/lib/constants";
import { teamStore } from "@/lib/team-store";

export interface EditorChromeProps {
  nw: any;
  userEmail: string | null;
  userIsAdmin: boolean;
  userUid: string | null;
  onSignOut: () => void | Promise<void>;
  enterShare: () => void;
  remoteConflict: boolean;
  doResyncLatest: () => void;
  shareModel: any;
  setShareModel: (v: any) => void;
  modal: any;
  setModal: (v: any) => void;
  exportText: string;
  copyExport: () => void;
  importText: string;
  setImportText: (v: string) => void;
  doImport: () => void;
  share: boolean;
  curId: string | null;
  recordPayload: () => any;
  setShare: (v: boolean) => void;
  doExport: () => void;
  setNameDisplay: (v: any) => void;
  totals: any;
  homeName: string;
  awayName: string;
  homeColor: string; homeColor2: string; awayColor: string; awayColor2: string;
  header: any;
  sportLabel: string;
  matchDate: string;
  effMode: "gaa" | "goals";
  phase: string;
  homeSquadV: any;
  awaySquadV: any;
  showDetails: boolean;
  setShowDetails: (fn: any) => void;
  setColorPick: (v: any) => void;
  colorPick: any;
  setMatchDate: (v: string) => void;
  homeTeam: string;
  onHomeTeamChange: (v: string) => void;
  colorHome: string;
  colorHome2: string;
  doSwap: () => void;
  awayTeam: string;
  setHeaderField: (k: string, v: string) => void;
  colorAway: string;
  colorAway2: string;
  sport: string;
  setReTeam: (v: any) => void;
  setNwTeams: (v: any) => void;
  reTeam: any;
  nwTeams: any[];
  reTeamPickHome: (t: any) => void;
  reTeamCreateHome: (name: string, squad: string) => void;
  reTeamPickAway: (t: any) => void;
  reTeamCreateAway: (name: string, squad: string) => void;
  reTeamApply: () => void;
  setColorHome: (v: string) => void;
  setColorHome2: (v: string) => void;
  setColorAway: (v: string) => void;
  setColorAway2: (v: string) => void;
  usedColors: string[];
  tabs: any[];
  tab: string;
  setTab: (id: string) => void;
  savedMsg: string;
}

// EditorChrome — the persistent editor frame: header, conflict banner, share/backup
// modals, score header, details panel, colour picker, tabs (plus the autosave toast).
// Extracted from MatchTracker (decomposition ⑤) — behaviour-identical; the EXACT DOM
// nesting (the .mt-frozen wrapper + the toast after it) is preserved verbatim.
export default function EditorChrome(props: EditorChromeProps) {
  const {
    nw, userEmail, userIsAdmin, userUid, onSignOut, enterShare,
    remoteConflict, doResyncLatest, shareModel, setShareModel,
    modal, setModal, exportText, copyExport, importText, setImportText, doImport,
    share, curId, recordPayload, setShare, doExport, setNameDisplay,
    totals, homeName, awayName, homeColor, homeColor2, awayColor, awayColor2,
    header, sportLabel, matchDate, effMode, phase, homeSquadV, awaySquadV,
    showDetails, setShowDetails, setColorPick, colorPick, setMatchDate,
    homeTeam, onHomeTeamChange, colorHome, doSwap, awayTeam, setHeaderField, colorAway, colorHome2, colorAway2,
    sport, setReTeam, setNwTeams, reTeam, nwTeams,
    reTeamPickHome, reTeamCreateHome, reTeamPickAway, reTeamCreateAway, reTeamApply,
    setColorHome, setColorHome2, setColorAway, setColorAway2, usedColors,
    tabs, tab, setTab, savedMsg,
  } = props;
  return (
    <>
      {/* frozen top chrome — header + scoreboard + tabs stay pinned while the body scrolls */}
      <div className="mt-frozen">
      {/* persistent header */}
      {!nw && (
        <AppHeader
          email={userEmail}
          onSignOut={onSignOut}
          primary={
            <button className="mt-btn ah-icn" aria-label="Share" title="Share" onClick={enterShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
              </svg>
            </button>
          }
          screen="editor"
          isAdmin={userIsAdmin}
        />
      )}
      {!nw && remoteConflict && (
        <div className="mt-warn">
          Updated on another device.
          <button className="mt-add alt" style={{ marginLeft: 8 }} onClick={doResyncLatest}>Load latest</button>
        </div>
      )}
      {nw && (
        <AppHeader
          email={userEmail}
          onSignOut={onSignOut}
          screen="editor"
        />
      )}

      {!nw && shareModel && (
        <ShareImageModal model={shareModel.model} filename={shareModel.filename} title={shareModel.title} onClose={() => setShareModel(null)} />
      )}

      {!nw && modal && (
        <div className="mt-panel">
          {modal.kind === "backup" && (
            <>
              <div className="mt-panel-head"><h3>Backup &amp; transfer</h3><button className="mt-add alt" onClick={() => setModal(null)}>Close</button></div>
              <p className="hint">From the device that has your matches, tap Copy, then paste it into Import on the other device. ({modal.count} saved here.)</p>
              <textarea readOnly value={exportText} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
              <div className="row"><button className="mt-add" onClick={copyExport}>Copy</button></div>
              <p className="hint" style={{ marginTop: 14 }}>Import — paste a backup here to load every match onto this device:</p>
              <textarea value={importText} placeholder="paste backup text here" onChange={(e) => setImportText(e.target.value)} />
              <div className="row"><button className="mt-add" onClick={doImport} disabled={!importText.trim()}>Import</button></div>
            </>
          )}
        </div>
      )}

      {!nw && share && curId && (
        <ShareSheet
          record={{ ...recordPayload(), savedAt: Date.now() }}
          curId={curId}
          onClose={() => setShare(false)}
          onShareImage={() => { setShare(false); doExport(); }}
          onApplied={({ nameDisplay }) => setNameDisplay(nameDisplay)}
        />
      )}

      {/* score header (shared with the public page) — the editor adds an Edit-details toggle on the panel */}
      {!nw && (() => {
        const homeT = totals.home;
        const awayT = totals.away;
        return (
          <ScoreHeader
            homeName={homeName}
            awayName={awayName}
            homeStr={homeT.str}
            awayStr={awayT.str}
            homeColors={[homeColor, homeColor2]}
            awayColors={[awayColor, awayColor2]}
            grade={header.label || sportLabel || ""}
            dateStr={matchDate ? fmtDateDow(matchDate) : ""}
            homeTotal={gpTotal(homeT.g, homeT.p, effMode)}
            awayTotal={gpTotal(awayT.g, awayT.p, effMode)}
            phase={phase}
            live={phase === "play" || phase === "ht"}
            homeSquad={homeSquadV}
            awaySquad={awaySquadV}
            action={<button className="sh-edit" onClick={() => { setShowDetails((o: boolean) => !o); if (showDetails) setColorPick(null); }}>{showDetails ? "▾ Hide" : "✎ Edit"}</button>}
          />
        );
      })()}

      {/* match details panel — drops below the scoreboard */}
      {!nw && showDetails && (
      <div className="mt-settings">
        <label>Date <input type="date" value={(matchDate || "").slice(0, 10)} onChange={(e) => e.target.value && setMatchDate(`${e.target.value}T${(matchDate || "").slice(11, 16) || "12:00"}`)} />
          <input type="time" value={(matchDate || "").slice(11, 16)} onChange={(e) => e.target.value && setMatchDate(`${(matchDate || "").slice(0, 10)}T${e.target.value}`)} /></label>
        <label>Home team <input type="text" value={homeTeam} onChange={(e) => onHomeTeamChange(e.target.value)} /> <button className="mt-swatch" title="Primary" style={{ background: colorHome }} onClick={() => setColorPick(colorPick === "home" ? null : "home")} /><button className="mt-swatch" title="Secondary" style={{ background: colorHome2 }} onClick={() => setColorPick(colorPick === "home2" ? null : "home2")} /></label>
        <button className="mt-btn" title="Swap home/away" onClick={doSwap}>⇄ Swap</button>
        <label>Away team <input type="text" value={awayTeam} placeholder="Away team"
          onChange={(e) => setHeaderField("away", e.target.value)} /> <button className="mt-swatch" title="Primary" style={{ background: colorAway }} onClick={() => setColorPick(colorPick === "away" ? null : "away")} /><button className="mt-swatch" title="Secondary" style={{ background: colorAway2 }} onClick={() => setColorPick(colorPick === "away2" ? null : "away2")} /></label>
        <label>Sport
          <select className="mt-sel" style={{ color: "#222", background: "#fffdf6", borderColor: "#d8cfb8" }}
            value={sport}
            onChange={(e) => {
              const v = e.target.value;
              if (v === sport) return;
              setReTeam({ sport: v, prevSport: sport, home: null, away: null });
              if (userUid) teamStore.list(userUid).then(setNwTeams).catch(() => {});
            }}>
            {!sport && <option value="" disabled>— choose sport —</option>}
            {Object.entries(SPORTS).map(([k, s]) => <option key={k} value={k}>{s.emoji} {s.label}</option>)}
          </select>
        </label>
        {reTeam && (
          <div className="mt-live" style={{ marginTop: 10 }}>
            <div className="mt-row">
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>Re-pick teams for {SPORTS[reTeam.sport]?.label || "new sport"}</span>
              <button className="mt-add alt" onClick={() => setReTeam(null)}>✕ Cancel</button>
            </div>
            {!reTeam.home ? (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Pick the home team, or create one.</p>
                <TeamPicker teams={nwTeams} sport={reTeam.sport} onPick={reTeamPickHome} onCreate={reTeamCreateHome} />
              </>
            ) : (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Home team: <b>{reTeam.home.name}</b>. Now pick the away team{reTeam.away ? <> — <b>{reTeam.away.name}</b></> : ", or create one"}.</p>
                <TeamPicker teams={nwTeams} sport={reTeam.sport} exclude={reTeam.home.id} onPick={reTeamPickAway} onCreate={reTeamCreateAway} />
                <div className="mt-row" style={{ marginTop: 10 }}>
                  <button className="mt-add alt" onClick={() => setReTeam({ ...reTeam, home: null, away: null })}>← Back</button>
                  <button className="mt-add" style={{ flex: 1, marginLeft: 8 }} disabled={!reTeam.away} onClick={reTeamApply}>Apply {SPORTS[reTeam.sport]?.label} teams</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      )}

      {!nw && showDetails && colorPick && (() => {
        const map: any = {
          home: [colorHome, setColorHome, `${homeName} — primary`], home2: [colorHome2, setColorHome2, `${homeName} — secondary`],
          away: [colorAway, setColorAway, `${awayName} — primary`], away2: [colorAway2, setColorAway2, `${awayName} — secondary`],
        };
        const [val, setVal, label] = map[colorPick];
        const sw = (c: string) => (
          <button key={c} className={"mt-swatch big" + (c === (val || "").toLowerCase() ? " on" : "")}
            style={{ background: c }} onClick={() => { setVal(c); setColorPick(null); }} title={c} />
        );
        return (
          <div className="mt-live" style={{ marginTop: 0 }}>
            <div className="mt-row">
              <span className="mt-h" style={{ margin: 0 }}>Colour — {label}</span>
              <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={() => setColorPick(null)}>Done</button>
            </div>
            {usedColors.length > 0 && <>
              <p className="mt-note" style={{ marginTop: 10, marginBottom: 4 }}>Used before</p>
              <div className="mt-row">{usedColors.map(sw)}</div>
            </>}
            <p className="mt-note" style={{ marginTop: 10, marginBottom: 4 }}>Palette</p>
            <div className="mt-row">{PALETTE.filter((c) => !usedColors.includes(c)).map(sw)}</div>
            <p className="mt-note" style={{ marginTop: 10, marginBottom: 4 }}>Advanced — exact colour
              <input type="color" value={val} onChange={(e) => setVal(e.target.value)} style={{ marginLeft: 8, verticalAlign: "middle" }} /></p>
          </div>
        );
      })()}

      {/* tabs */}
      {!nw && (
      <div className="mt-tabs">
        {tabs.map(([id, lbl]) => (
          <button key={id} className={"mt-tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>
      )}
      </div>{/* /mt-frozen */}
      {savedMsg && <div className="mt-toast">{savedMsg}</div>}
    </>
  );
}
