// @ts-nocheck
"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import MinuteStep from "@/components/MinuteStep";
import ScoreChart from "@/components/ScoreChart";
import { store, cache, loadAll } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { parseMatch, isPlaceholderLabel } from "@/lib/parser";
import {
  deleteEventLine, insertEventLine, replaceEventLine, placeEventLineByMinute,
  eventLineMinute, rosterEnd,
} from "@/lib/raw-edit";
import { swapPositions, renumberPlayer, renamePlayer, addPlayer } from "@/lib/team-roster";
import RosterPitch from "@/components/RosterPitch";
import Jersey from "@/components/Jersey";
const EMPTY_ROSTER = { formation: [], players: [] };
import { SAMPLE_RECORD } from "@/lib/sample";
import {
  gpTotal, fmtScore, squash, titleCase, contrastOn, mkId, remapImport,
  fmtDate, fmtDateShort, fmtDateDow, toLocalInput, dateKey, MONTHS, pad2,
} from "@/lib/util";
import { PALETTE, LIVE_EVENTS, LIVE_PLAYER_EVENTS, SPORTS, scoringModeForSport } from "@/lib/constants";
import ShareSheet from "@/components/ShareSheet";
import ShareImageModal from "@/components/ShareImageModal";
import { swapHomeAway, teamLinkPatch } from "@/lib/team-link";
import { teamStore } from "@/lib/team-store";
import { pairingError } from "@/lib/match-sport";
import { whoToken, onPitchNums } from "@/lib/event-line";
import TeamPicker from "@/components/TeamPicker";
import { lineupBadges } from "@/lib/lineup-badges";
import SportIcon from "@/components/SportIcon";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import ScoreHeader from "@/components/ScoreHeader";
import StatGrid from "@/components/StatGrid";
import Scorers from "@/components/Scorers";
import Timeline from "@/components/Timeline";
import { htScore } from "@/lib/half-time";
import { reconcileIncoming } from "@/lib/live-update";
import { fetchIsAdmin } from "@/lib/viewer.client";
import { teamRosterPushes } from "@/lib/team-roster-sync";
import { useRouter } from "next/navigation";

const sb = createClient();

// --- editor-local helpers (not extracted to lib; copied verbatim from index.html) ---


// ChartTip (index.html 1084-1095)
function ChartTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="mt-tip">
      <div className="sc">{d.usScore ?? 0} – {d.themScore ?? 0}</div>
      <div>{d.label}{d.minute != null ? ` · ${d.minute}'` : ""}{d.half ? ` · H${d.half}` : ""}</div>
    </div>
  );
}

// sportEmoji (index.html 1107-1113)
const sportEmoji = (sport, headerSport, mode) => {
  if (SPORTS[sport]) return SPORTS[sport].emoji;
  const byLabel = Object.values(SPORTS).find((s) => s.label === headerSport);
  if (byLabel) return byLabel.emoji;
  return mode === "goals" ? SPORTS.soccer.emoji : "";
};

// downloadBlob (index.html 354-359)
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// little flag on a pole — the GAA goal (green) / point (white) motif, matching the chart
function Flag({ fill }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
      <line x1="3.5" y1="1.5" x2="3.5" y2="14.5" stroke="#3a3a3a" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 2 L13 4.4 L3.5 7.6 Z" fill={fill} stroke="#3a3a3a" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}
// icon for a live-entry event button; goal/point are mode-aware (GAA flags vs a soccer ball)
function evIcon(key, mode) {
  switch (key) {
    case "goal": case "goalfree": case "og": return mode === "goals" ? <span aria-hidden="true">⚽</span> : <Flag fill="#1f9d3f" />;
    case "point": case "pointfree": case "point65": case "point45": return <Flag fill="#fbfbf5" />;
    case "yellow": return <span aria-hidden="true">🟨</span>;
    case "red": return <span aria-hidden="true">🟥</span>;
    case "corner": return <span aria-hidden="true">🚩</span>;
    case "sub": return <span aria-hidden="true">🔁</span>;
    case "half": return <span aria-hidden="true">▶️</span>;
    case "ht": return <span aria-hidden="true">⏸️</span>;
    case "ft": return <span aria-hidden="true">🏁</span>;
    default: return null;
  }
}

export default function MatchTracker({ initialId = null, wizard = false }: { initialId?: string | null; wizard?: boolean }) {
  const router = useRouter();
  const [raw, setRaw] = useState(SAMPLE_RECORD.raw);
  const [myTeam, setMyTeam] = useState(SAMPLE_RECORD.myTeam || "Racoons");
  const [sport, setSport] = useState(SAMPLE_RECORD.sport || ""); // "" = unset (legacy/edge records → "goals"); a SPORTS key locks the scoring mode
  const [colorUs, setColorUs] = useState(SAMPLE_RECORD.colorUs || "#f5c518");
  const [colorUs2, setColorUs2] = useState(SAMPLE_RECORD.colorUs2 || "#1f7a4d");
  const [colorThem, setColorThem] = useState(SAMPLE_RECORD.colorThem || "#c0392b");
  const [colorThem2, setColorThem2] = useState(SAMPLE_RECORD.colorThem2 || "#2c5fa8");
  const [nameDisplay, setNameDisplay] = useState(SAMPLE_RECORD.nameDisplay || "full");
  // header now lives on the record, not the notation
  const [label, setLabel] = useState(SAMPLE_RECORD.label || "");
  const [homeAway, setHomeAway] = useState(SAMPLE_RECORD.homeAway || "away");
  const [opponent, setOpponent] = useState(SAMPLE_RECORD.opponent || "");
  const [usRoster, setUsRoster] = useState(SAMPLE_RECORD.usRoster || null);
  const [legacyRaw, setLegacyRaw] = useState(undefined);
  const [tab, setTab] = useState("details");
  const [matchDate, setMatchDate] = useState(SAMPLE_RECORD.matchDate || "2026-06-02T18:21");
  const [curId, setCurId] = useState(null);
  const [saved, setSaved] = useState([]);
  const [savedMsg, setSavedMsg] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [colorPick, setColorPick] = useState(null); // which swatch is open: "us"|"us2"|"them"|"them2"
  const [modal, setModal] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false); // "⋯" overflow menu in the top bar
  const [confirmDel, setConfirmDel] = useState(false); // Delete armed, waiting for the confirming second tap
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [notaView, setNotaView] = useState("blocks"); // blocks | text
  const [blkEdit, setBlkEdit] = useState(null);       // { idx, minute, rest, confirmDel } (Task 6)
  const [blkIns, setBlkIns] = useState(null);         // insert flow state (Task 7)
  const [lineupEdit, setLineupEdit] = useState(null); // preamble text while editing (Task 8)
  const [remoteConflict, setRemoteConflict] = useState(false);
  useEffect(() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setReTeam(null); }, [curId]);
  // undo stack of recent notation (raw) states — covers adds/edits/deletes/inserts
  const rawHist = useRef([]);
  const prevRawRef = useRef(raw);
  const skipHist = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  useEffect(() => {
    if (skipHist.current) { skipHist.current = false; prevRawRef.current = raw; return; }
    if (raw !== prevRawRef.current) {
      rawHist.current.push(prevRawRef.current);
      if (rawHist.current.length > 25) rawHist.current.shift();
      prevRawRef.current = raw;
      setCanUndo(true);
    }
  }, [raw]);
  useEffect(() => { rawHist.current = []; prevRawRef.current = raw; setCanUndo(false); /* eslint-disable-next-line */ }, [curId]);
  const undoRaw = () => {
    if (!rawHist.current.length) return;
    setBlkEdit(null); setBlkIns(null); setLineupEdit(null);
    skipHist.current = true;
    setRaw(rawHist.current.pop());
    setCanUndo(rawHist.current.length > 0);
    setSavedMsg("Undone"); setTimeout(() => setSavedMsg(""), 1500);
  };
  // default tab when a match opens: Game mode while unfinished, Details once it's full time.
  // Keyed on curId so it only fires on open, never mid-session (won't yank the user off a tab).
  useEffect(() => { if (curId) setTab(phase === "over" ? "details" : "game"); /* eslint-disable-next-line */ }, [curId]);
  // switching tabs closes any open Advanced editor and resets the game-mode stage
  useEffect(() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setEditLineup(false); setGmStage({ stage: "event" }); }, [tab]);
  const [userUid, setUserUid] = useState("");
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  useEffect(() => { sb.auth.getUser().then(({ data }) => { setUserEmail((data && data.user && data.user.email) || ""); setUserUid((data && data.user && data.user.id) || ""); fetchIsAdmin(sb, (data && data.user && data.user.id) || null).then(setUserIsAdmin); }); }, []);

  // substitution (lineup tab): tap a pitch player and a sub, either order
  const [subPick, setSubPick] = useState(null); // {role:"off"|"on", num, name}
  const [editLineup, setEditLineup] = useState(false); // structural lineup editing via RosterPitch
  // lineup tools: "swap" (reshuffle two players) or "renum" (change a shirt number)
  const [lineupMode, setLineupMode] = useState(null);
  const [swapFirst, setSwapFirst] = useState(null); // {num, name}
  const [renumTarget, setRenumTarget] = useState(null); // {num, name}
  const [newNum, setNewNum] = useState("");
  const [newName, setNewName] = useState("");

  // live entry: team -> event -> (player); each tap that completes an event adds it straight away
  const [lvTeam, setLvTeam] = useState("us");
  const [lvEvent, setLvEvent] = useState(null); // pending player event awaiting a "Who?" tap
  // game mode is a tab (tab === "game"); gmStage holds the staged-entry position.
  // stages: "team" → "event" → "who"; "subOff" → "subOn" for substitutions.
  const [gmStage, setGmStage] = useState({ stage: "event" });

  // new-match wizard: null when off, else {stage:"date"|"us"|"opp", date, team, label,
  // sport (null = none supplied yet), homeAway, colors:[c,c2]|null, oppName}
  const [nw, setNw] = useState(null);
  const [showDetails, setShowDetails] = useState(false); // the date/teams/sport panel is collapsed behind "Edit details"
  const [nwTeams, setNwTeams] = useState([]); // TeamRecord[] loaded when the wizard opens
  const [reTeam, setReTeam] = useState(null); // null | { sport, prevSport, home: TeamRecord|null, away: TeamRecord|null }
  // /m/new mounts the wizard before getUser resolves; once userUid arrives, load teams if the wizard is open
  useEffect(() => {
    if (userUid && nw && nwTeams.length === 0) teamStore.list(userUid).then(setNwTeams).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userUid]);
  const [share, setShare] = useState(false);
  const [shareModel, setShareModel] = useState(null);
  const [homeTeamId, setHomeTeamId] = useState(null);
  const [awayTeamId, setAwayTeamId] = useState(null);
  const [oppRoster, setOppRoster] = useState(SAMPLE_RECORD.oppRoster || null);
  const [usSquad, setUsSquad] = useState(SAMPLE_RECORD.usSquad || "");
  const [oppSquad, setOppSquad] = useState(SAMPLE_RECORD.oppSquad || "");
  const creatingRef = useRef(false); // guards finishNew against a double-tap minting two matches

  const parsed = useMemo(() => parseMatch(raw, { myTeam, scoringMode: scoringModeForSport(sport), label, homeAway, opponent, usRoster, oppRoster }), [raw, myTeam, sport, label, homeAway, opponent, usRoster, oppRoster]);
  const { header, roster, totals, result, series, goalDots, chartMarkers, scorers, scoring, notes, halfMarks, htLine } = parsed;
  const effMode = parsed.mode;
  const sportLabel = SPORTS[sport] ? SPORTS[sport].label : header.sport; // chosen sport beats one named in the notation

  const usName = myTeam || "My Team";
  const themName = header.opposition || "Opposition";

  // colours used across saved matches, most common first (suggestions in the picker)
  const usedColors = useMemo(() => {
    const count = {};
    for (const id of Object.keys(cache)) {
      const d = cache[id] || {};
      ["colorUs", "colorUs2", "colorThem", "colorThem2"].forEach((k) => {
        const c = (d[k] || "").toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(c)) count[c] = (count[c] || 0) + 1;
      });
    }
    return Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 12);
  }, [saved]);

  // auto-switch handled in parser via score format; effMode = parsed.mode

  // load saved list on mount
  const refreshList = async () => {
    const keys = await store.list();
    const items = [];
    for (const k of keys) {
      const id = k.replace(/^match:/, "");
      const d = await store.get(id);
      if (!d) continue;
      let opp = (d.opponent || "").trim() || "Opponent";
      let ha = d.homeAway || "away";
      let grade = (d.label || "").trim();
      let emoji = "";
      try { emoji = sportEmoji(d.sport, "", scoringModeForSport(d.sport)); } catch (e) {}
      if (isPlaceholderLabel(grade) || !grade) grade = (d.myTeam || "").trim(); // pre-fix saves still show the team, not "New Match"
      const label = `${emoji ? emoji + " " : ""}${grade ? grade + " · " : ""}${opp} (${ha === "home" ? "H" : "A"})${d.date ? " — " + fmtDate(d.date) : ""}`;
      items.push({ id, label, date: d.date || null, savedAt: d.savedAt || 0 });
    }
    items.sort((a, b) => dateKey(b.date, b.savedAt) - dateKey(a.date, a.savedAt));
    setSaved(items);
    return items;
  };
  useEffect(() => {
    (async () => {
      await refreshList();
      if (wizard) { enterNew(); return; }      // /m/new — open the new-match wizard
      if (initialId) doLoad(initialId);         // /m/<uuid> — open this match
    })(); /* eslint-disable-next-line */
  }, []);
  // sport is undefined (not "") when unset so opening a pre-sport record doesn't read as dirty
  const recordPayload = () => ({ raw, matchDate, date: matchDate, myTeam, sport: sport || undefined, colorUs, colorUs2, colorThem, colorThem2, nameDisplay, label, homeAway, opponent, usRoster, homeTeamId, awayTeamId, oppRoster, usSquad, oppSquad, notationV: 2, ...(legacyRaw ? { legacyRaw } : {}) });
  // unsaved changes? compare editor state against the cached server record
  const dirty = useMemo(() => {
    if (!curId) return true; // new match, never saved
    const d = cache[curId];
    if (!d) return true;
    const p = recordPayload();
    return Object.keys(p).some((k) => k !== "date" && d[k] !== p[k]);
    // eslint-disable-next-line
  }, [curId, raw, matchDate, myTeam, sport, colorUs, colorUs2, colorThem, colorThem2, nameDisplay, label, homeAway, opponent, usRoster, legacyRaw, homeTeamId, awayTeamId, oppRoster, usSquad, oppSquad, saved]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const doSave = async () => {
    const id = curId || mkId();
    const ok = await store.set(id, { ...recordPayload(), savedAt: Date.now() });
    setCurId(id);
    await refreshList();
    setSavedMsg(ok ? "Saved ✓" : "NOT saved — check connection");
    setTimeout(() => setSavedMsg(""), ok ? 2000 : 6000);
  };
  // Auto-save matches that already live on the server, a beat after the last change.
  // A brand-new match still needs its first explicit Save.
  useEffect(() => {
    if (!curId || !dirty) return;
    const t = setTimeout(async () => {
      const prev = cache[curId]; // pre-save copy, to detect which roster changed
      const usChanged = JSON.stringify(prev?.usRoster) !== JSON.stringify(usRoster);
      const oppChanged = JSON.stringify(prev?.oppRoster) !== JSON.stringify(oppRoster);
      const payload = recordPayload();
      const ok = await store.set(curId, { ...payload, savedAt: Date.now() });
      // our save is now the latest copy — any pending cross-device conflict notice is moot.
      if (ok) { setRemoteConflict(false); setSavedMsg("Auto-saved ✓"); setTimeout(() => setSavedMsg(""), 1200); }
      else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
      // Push the lineup to the linked team(s) when a roster changed and this is that team's latest match.
      if (ok && (usChanged || oppChanged)) {
        try {
          const matchList = Object.entries(cache).map(([id, d]) => ({
            id, homeTeamId: d.homeTeamId, awayTeamId: d.awayTeamId,
            matchDate: d.matchDate, date: d.date, savedAt: d.savedAt,
          }));
          const pushes = teamRosterPushes({ ...payload, id: curId }, matchList);
          for (const p of pushes) {
            if (p.side === "us" ? usChanged : oppChanged) await teamStore.setRoster(p.teamId, p.roster);
          }
        } catch (e) { console.warn("team lineup sync failed", e); }
      }
      await refreshList();
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [curId, dirty, raw, matchDate, myTeam, sport, colorUs, colorUs2, colorThem, colorThem2, nameDisplay, label, homeAway, opponent, usRoster, homeTeamId, awayTeamId, oppRoster, usSquad, oppSquad]);
  const applyRecord = (d) => {
    setRaw(d.raw); setMyTeam(d.myTeam || "My Team");
    setSport(d.sport || "");
    setColorUs(d.colorUs || "#f5c518"); setColorUs2(d.colorUs2 || "#1f7a4d");
    setColorThem(d.colorThem || "#c0392b"); setColorThem2(d.colorThem2 || "#2c5fa8");
    setNameDisplay(d.nameDisplay || "full");
    setLabel(d.label || ""); setHomeAway(d.homeAway || "away"); setOpponent(d.opponent || "");
    setUsRoster(d.usRoster || null); setLegacyRaw(d.legacyRaw);
    setHomeTeamId(d.homeTeamId || null); setAwayTeamId(d.awayTeamId || null); setOppRoster(d.oppRoster || null);
    setUsSquad(d.usSquad || ""); setOppSquad(d.oppSquad || "");
    setMatchDate(d.date || d.matchDate || toLocalInput(new Date()));
  };
  const doLoad = async (key) => {
    const id = key.replace(/^match:/, "");
    const d = await store.get(id);
    if (!d) return;
    applyRecord(d); setCurId(id);
  };
  // Live-sync the open match across devices. Replaces the old manual Resync.
  useEffect(() => {
    if (!curId) return;
    const apply = (rowData, event) => {
      const incoming = rowData?.data;
      const verdict = reconcileIncoming({
        event,
        dirty: dirtyRef.current,
        localSavedAt: (cache[curId]?.savedAt) || 0,
        incomingSavedAt: (incoming?.savedAt) || 0,
      });
      if (verdict === "deleted") { router.push("/"); return; }
      if (verdict === "ignore") return;
      if (verdict === "conflict") { setRemoteConflict(true); return; }
      if (incoming) { cache[curId] = incoming; setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setReTeam(null); applyRecord(incoming); }
    };
    const ch = sb
      .channel(`editor:${curId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${curId}` },
          (payload) => apply(payload.new, "UPDATE"))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "matches", filter: `id=eq.${curId}` },
          () => apply(null, "DELETE"))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [curId]);
  const doResyncLatest = async () => {
    const { data } = await sb.from("matches").select("data").eq("id", curId).maybeSingle();
    if (data?.data) { cache[curId] = data.data; setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setReTeam(null); applyRecord(data.data); }
    setRemoteConflict(false);
  };
  const doNew = async () => {
    // blank match: create + save immediately so it has a real /m/<uuid> home, then go there
    const team = myTeam.trim() || "My Team";
    const newRaw = "";
    const date = toLocalInput(new Date());
    const id = mkId();
    const ok = await store.set(id, { raw: newRaw, matchDate: date, date, myTeam: team, sport: "soccer", colorUs, colorUs2, colorThem, colorThem2, label: "", homeAway: "away", opponent: "", notationV: 2, savedAt: Date.now() });
    if (ok) {
      // route transition is in-place (same /m/[id] route → no remount), so reflect the new match locally
      setRaw(newRaw); setMatchDate(date); setMyTeam(team);
      setLabel(""); setHomeAway("away"); setOpponent(""); setUsRoster(null); setLegacyRaw(undefined);
      setSport("soccer"); setCurId(id); setNw(null); setReTeam(null); setTab("game");
      router.replace(`/m/${id}`);
    } else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
  };
  const doDuplicate = () => {
    setCurId(null);
    setSavedMsg("Editing a new copy — change the date/opponent, then Save");
    setTimeout(() => setSavedMsg(""), 3500);
  };
  const doDelete = async () => {
    if (!curId) return;
    const ok = await store.del(curId);
    if (ok) { router.push("/"); }
    else { setSavedMsg("NOT deleted — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
  };

  // edit header (opponent / home-away / label) — now record fields, not the notation
  const setHeaderField = (field, value) => {
    if (field === "label") setLabel(value);
    else if (field === "opposition") setOpponent(value);
    else if (field === "homeAway") setHomeAway(value);
  };
  // My team edits follow through to the header label, unless the user typed their own label (e.g. a grade).
  const onMyTeamChange = (v) => {
    const cur = (header.label || "").trim();
    if (isPlaceholderLabel(cur) || cur === myTeam.trim()) setHeaderField("label", v.trim() || "My Team");
    setMyTeam(v);
  };

  // ---- live append helpers ----
  const append = (text) => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setRaw((r) => r.replace(/\s*$/, "") + "\n" + text); };
  // substitution: tap the player going off (pitch) and the one coming on (subs), either order
  // on/off are player objects (or "unknown"); team picks which roster to qualify against
  const completeSub = (on, off, team = "us") => {
    const onTok = whoToken(on, team, whoCtx()), offTok = whoToken(off, team, whoCtx());
    append(`${new Date().getMinutes()} ${onTok} for ${offTok}`);
    setSubPick(null);
    setSavedMsg(`Sub added — ${onTok} for ${offTok}`); setTimeout(() => setSavedMsg(""), 2500);
  };
  // game-mode flow helpers (event → team → player, all events on page 1)
  const evLabel = (key) => (key === "sub" ? "Sub" : (LIVE_EVENTS.find((e) => e.key === key) || {}).label || key);
  const pickGmTeam = (team) => {
    const ev = gmStage.ev;
    if (ev === "sub") return setGmStage({ stage: "subOff", team });
    if (LIVE_PLAYER_EVENTS.includes(ev) && (team === "us" || (oppRoster && oppRoster.players && oppRoster.players.length))) return setGmStage({ stage: "who", ev, team });
    addLive(ev, null, team); setGmStage({ stage: "event" });
  };
  // who's currently on the pitch for a side (starters ± committed subs) and who's benched
  const onPitchSet = (team) => onPitchNums(team === "them" ? oppRoster : usRoster, parsed.notes.filter((n) => n.type === "sub" && n.side === team));
  const benchSet = (team) => {
    const roster = team === "them" ? oppRoster : usRoster;
    const on = onPitchSet(team);
    return new Set((roster?.players || []).map((p) => p.num).filter((n) => !on.has(n)));
  };
  // pick a player on `team`: jersey pitch when the roster has a formation, else the flat
  // who-grid. allowUnknown adds a team-level "Unknown" choice (scores/cards, not subs);
  // eligible (a Set of shirt numbers) restricts the pickable players (used by the sub flow).
  const gmPicker = (team, onPick, opts = {}) => {
    const { selected = null, allowUnknown = false, eligible = null } = opts;
    const roster = team === "them" ? oppRoster : usRoster;
    const c = team === "them" ? [colorThem, colorThem2] : [colorUs, colorUs2];
    if (roster && roster.formation && roster.formation.length)
      return (
        <>
          <RosterPitch roster={roster} color1={c[0]} color2={c[1]} onPick={(p) => p && onPick(p)} selected={selected} eligible={eligible} />
          {allowUnknown && <div className="mt-frow" style={{ marginTop: 8 }}><button className="mt-big sm" onClick={() => onPick("unknown")}>Unknown</button></div>}
        </>
      );
    return whoGrid((p) => {
      if (p === "unknown") return allowUnknown && onPick(p);
      if (eligible && !eligible.has(p.num)) return;
      onPick(p);
    }, team);
  };
  const tapPitch = (p) => {
    if (subPick && subPick.role === "on") return completeSub(subPick, p, "us");
    setSubPick(subPick && subPick.role === "off" && subPick.num === p.num ? null : { role: "off", ...p });
  };
  const tapBench = (p) => {
    if (subPick && subPick.role === "off") return completeSub(p, subPick, "us");
    setSubPick(subPick && subPick.role === "on" && subPick.num === p.num ? null : { role: "on", ...p });
  };
  // lineup tools route every tap through here; default falls through to the sub flow
  const resetLineupModes = () => { setLineupMode(null); setSwapFirst(null); setRenumTarget(null); setNewNum(""); setNewName(""); setSubPick(null); };
  const tapPlayer = (p, where) => {
    if (lineupMode === "swap") {
      if (!swapFirst) return setSwapFirst(p);
      if (swapFirst.num === p.num) return setSwapFirst(null);
      setUsRoster((r) => r ? swapPositions(r, swapFirst.num, p.num) : r);
      setSavedMsg(`Swapped ${swapFirst.name || swapFirst.num} & ${p.name || p.num}`); setTimeout(() => setSavedMsg(""), 2500);
      return resetLineupModes();
    }
    if (lineupMode === "renum") { setRenumTarget(p); setNewNum(String(p.num)); setNewName(p.name || ""); return; }
    return where === "pitch" ? tapPitch(p) : tapBench(p);
  };
  const renumValid = (() => {
    const n = parseInt(newNum, 10);
    return renumTarget && n >= 1 && n <= 99 && !roster.some((p) => p.num === n && p.num !== renumTarget.num);
  })();
  const applyRenum = () => {
    if (!renumValid) return;
    const nn = parseInt(newNum, 10), name = newName.trim();
    setUsRoster((r) => {
      if (!r) return r;
      let next = renumberPlayer(r, renumTarget.num, nn);
      next = renamePlayer(next, nn, name); // rename targets the new number (renumber ran first)
      return next;
    });
    setSavedMsg(`${name || nn} now wears ${nn}`); setTimeout(() => setSavedMsg(""), 2500);
    resetLineupModes();
  };
  // live entry: build the notation line; the minute is always the wall clock now
  // (wrong by a beat? fix it in the notation after — same as everything else)
  // build a notation line for an event; live entry passes the wall clock,
  // the insert forms pass their stepper minute and their own team toggle
  const whoCtx = () => ({ usName: myTeam, themName, usRoster, oppRoster });
  const buildEventLine = (ev, team, player, min) => {
    const themTok = themName || "Opposition";
    const usTok = (myTeam || "").trim() || "My Team";
    const who = whoToken(player, team, whoCtx());
    switch (ev) {
      case "goal": return `${min} ${who} goal`;
      case "point": return `${min} ${who}`;
      case "goalfree": return `${min} ${who} goal free`;
      case "pointfree": return `${min} ${who} free`;
      case "point65": return `${min} ${who} '65`;
      case "point45": return `${min} ${who} '45`;
      case "og": return `${min} ${who} own goal`;
      case "yellow": return `${min} ${who} yellow card`;
      case "red": return `${min} ${who} red card`;
      case "corner": return team === "them" ? `${min} ${themTok} corner` : `${min} ${usTok} corner`;
      case "ht": return `${min} HT`;
      case "ft": return `${min} FT`;
      case "half": return `${new Date().getHours()}:${pad2(parseInt(min, 10) % 60)}`;
      default: return "";
    }
  };
  const liveLine = (ev, player, team = lvTeam) => buildEventLine(ev, team, player, String(new Date().getMinutes()));
  const whoGrid = (onPick, team = "us") => {
    // them: build rows/bench from the opponent roster (when populated); us: our roster
    const rows = team === "them"
      ? ((oppRoster && oppRoster.formation && oppRoster.formation.length ? oppRoster.formation : chunk((oppRoster?.players || []).filter((p) => p.role !== "sub").map((p) => p.num), 3)).map((row) => row.map((n) => (oppRoster?.players || []).find((p) => p.num === n)).filter(Boolean)).filter((r) => r.length))
      : liveRows;
    const bench = team === "them" ? (oppRoster?.players || []).filter((p) => p.role === "sub") : subs;
    return (
      <>
        {rows.map((row, ri) => (
          <div key={ri} className="mt-frow">
            {row.map((p) => <button key={p.num + p.name} className="mt-big sm" onClick={() => onPick(p)}>{p.num ? `${p.num}. ` : ""}{p.name}</button>)}
          </div>
        ))}
        {bench.length > 0 && (
          <div className="mt-frow" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            {bench.map((p) => <button key={p.num + p.name} className="mt-big sm" onClick={() => onPick(p)}>{p.num ? `${p.num}. ` : ""}{p.name}</button>)}
          </div>
        )}
        <div className="mt-frow"><button className="mt-big sm" onClick={() => onPick("unknown")}>Unknown</button></div>
      </>
    );
  };
  const addLive = (ev, player, team = lvTeam) => {
    if (!evEnabled(ev)) return; // e.g. FT tapped while a "Who?" pick was pending
    const l = liveLine(ev, player, team);
    if (!l) return;
    append(l);
    setLvEvent(null);
    setSavedMsg(`Added "${l}"`); setTimeout(() => setSavedMsg(""), 1800);
  };
  // undo: the last non-empty event line — never the header/roster, so only
  // lines after the first half-start clock line are up for removal
  const undoTarget = useMemo(() => {
    const lines = raw.split("\n");
    const start = lines.findIndex((l) => /^\s*\d{1,2}:\d{2}\s*$/.test(l));
    if (start < 0) return null;
    for (let i = lines.length - 1; i > start; i--) if (lines[i].trim()) return { idx: i, text: lines[i].trim() };
    return null;
  }, [raw]);
  const doUndo = () => {
    if (!undoTarget) return;
    setBlkEdit(null); setBlkIns(null); setLineupEdit(null);
    const lines = raw.split("\n");
    lines.splice(undoTarget.idx, 1);
    setRaw(lines.join("\n").replace(/\s+$/, "") + "\n");
    setSavedMsg(`Removed "${undoTarget.text}"`); setTimeout(() => setSavedMsg(""), 1800);
  };

  // the wizard touches nothing until its final step, so Cancel is just setNw(null)
  const enterNew = () => {
    setMenuOpen(false); setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null);
    setNw({ stage: "date", date: toLocalInput(new Date()), sport: "", home: null, away: null });
    if (userUid) teamStore.list(userUid).then(setNwTeams).catch(() => setNwTeams([]));
  };
  const enterShare = () => {
    setMenuOpen(false);
    if (!curId) { setSavedMsg("Save the match first, then share"); setTimeout(() => setSavedMsg(""), 2500); return; }
    setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setNw(null); setReTeam(null);
    setShare(true);
  };
  // Wizard now picks a Home team then an Away team (sport is chosen on stage 1).
  // Internally Home → us, Away → them (homeAway:"home") so the engine is unchanged.
  const nwPickHome = (t) => setNw({ ...nw, home: t, stage: "away" });
  const nwCreateHome = async (name, squad) => {
    if (!userUid || !nw.sport) return;
    const t = await teamStore.findOrCreate(userUid, { name, sport: nw.sport, squad, color1: "#f5c518", color2: "#1f7a4d" });
    if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setNw({ ...nw, home: t, stage: "away" }); }
  };
  const nwPickAway = (t) => setNw({ ...nw, away: t });
  const nwCreateAway = async (name, squad) => {
    if (!userUid || !nw.sport) return;
    const t = await teamStore.findOrCreate(userUid, { name, sport: nw.sport, squad, color1: "#c0392b", color2: "#2c5fa8" });
    if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setNw({ ...nw, away: t }); }
  };
  const reTeamPickHome = (t) => setReTeam({ ...reTeam, home: t });
  const reTeamCreateHome = async (name, squad) => {
    if (!userUid) return;
    const t = await teamStore.findOrCreate(userUid, { name, sport: reTeam.sport, squad, color1: "#f5c518", color2: "#1f7a4d" });
    if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setReTeam({ ...reTeam, home: t }); }
  };
  const reTeamPickAway = (t) => setReTeam({ ...reTeam, away: t });
  const reTeamCreateAway = async (name, squad) => {
    if (!userUid) return;
    const t = await teamStore.findOrCreate(userUid, { name, sport: reTeam.sport, squad, color1: "#c0392b", color2: "#2c5fa8" });
    if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setReTeam({ ...reTeam, away: t }); }
  };
  const reTeamApply = () => {
    if (!reTeam.home || !reTeam.away || pairingError(reTeam.home.sport, reTeam.away.sport)) return;
    const patch = teamLinkPatch(recordPayload(), { usTeam: reTeam.home, oppTeam: reTeam.away, homeAway: homeAway || "home" });
    setSport(reTeam.sport);
    setMyTeam(patch.myTeam); setOpponent(patch.opponent);
    setHomeTeamId(patch.homeTeamId); setAwayTeamId(patch.awayTeamId);
    setUsRoster(patch.usRoster); setOppRoster(patch.oppRoster);
    setUsSquad(patch.usSquad || ""); setOppSquad(patch.oppSquad || "");
    setColorUs(patch.colorUs); setColorUs2(patch.colorUs2); setColorThem(patch.colorThem); setColorThem2(patch.colorThem2);
    setReTeam(null);
  };
  const finishNew = async () => {
    if (creatingRef.current || !nw.home || !nw.away) return;
    if (pairingError(nw.home.sport, nw.away.sport)) return;
    creatingRef.current = true;
    try {
      const sportKey = nw.sport || nw.home.sport || nw.away.sport || "soccer";
      const patch = teamLinkPatch({ label: "" }, { usTeam: nw.home, oppTeam: nw.away, homeAway: "home" });
      const label = nw.home.name;
      const rec = {
        raw: "", matchDate: nw.date, date: nw.date,
        sport: sportKey, notationV: 2, nameDisplay: "full", savedAt: Date.now(),
        ...patch, label,
      };
      setRaw(""); setMyTeam(patch.myTeam); setOpponent(patch.opponent); setLabel(label);
      setHomeAway(patch.homeAway); setHomeTeamId(patch.homeTeamId); setAwayTeamId(patch.awayTeamId);
      setUsRoster(patch.usRoster); setOppRoster(patch.oppRoster); setLegacyRaw(undefined);
      setUsSquad(patch.usSquad || ""); setOppSquad(patch.oppSquad || "");
      setColorUs(patch.colorUs); setColorUs2(patch.colorUs2); setColorThem(patch.colorThem); setColorThem2(patch.colorThem2);
      setSport(sportKey);
      setMatchDate(nw.date); setNw(null); setReTeam(null); setTab("game");
      const id = mkId();
      const ok = await store.set(id, rec);
      if (ok) { setCurId(id); router.replace(`/m/${id}`); }
      else { setCurId(null); setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
    } finally {
      creatingRef.current = false;
    }
  };

  // merged timeline for display
  const timeline = useMemo(() => {
    const items = [];
    parsed.scoring.forEach((s) => items.push({ kind: "score", ...s }));
    parsed.notes.forEach((n) => items.push({ kind: n.type, ...n }));
    // Preserve the order they were written. A missing timestamp (e.g. a sub)
    // just slots between the events either side of it.
    return items.sort((a, b) => (a.half - b.half) || (a.seq - b.seq));
  }, [parsed]);

  const usScorers = scorers.filter((s) => s.side === "us").sort((a, b) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const themScorers = scorers.filter((s) => s.side === "them").sort((a, b) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const starters = roster.filter((p) => p.role === "starting");
  const subs = roster.filter((p) => p.role === "sub");
  const missing = roster.filter((p) => p.role === "missing");

  // the block list: one entry per non-empty event line, classified via srcLine
  const blocks = useMemo(() => {
    const lines = raw.split("\n");
    const end = rosterEnd(lines);
    const byLine = new Map();
    parsed.scoring.forEach((s) => byLine.set(s.srcLine, { kind: "score", e: s }));
    parsed.notes.forEach((n) => byLine.set(n.srcLine, { kind: n.type, e: n }));
    parsed.halfMarks.forEach((m) => byLine.set(m.srcLine, { kind: m.marker ? "marker" : "half", e: m }));
    const list = [];
    for (let i = end; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      list.push({ idx: i, text: lines[i].trim(), ...(byLine.get(i) || { kind: /^\s*\+\d{1,2}/.test(lines[i]) ? "added" : "note", e: null }) });
    }
    return { end, list };
  }, [raw, parsed]);
  const blkPill = (b) => {
    if (b.kind === "score") {
      const us = b.e.side === "us";
      return <span className="mt-bpill" style={{ background: us ? colorUs : colorThem, color: contrastOn(us ? colorUs : colorThem) }}>{us ? b.e.usScore : b.e.themScore}</span>;
    }
    if (b.kind === "half") return <span className="mt-bpill half">H{b.e.half}</span>;
    if (b.kind === "marker") return <span className="mt-bpill half">{b.e.marker}</span>;
    if (b.kind === "sub") return <span className="mt-bpill sub">sub</span>;
    if (b.kind === "card") return <span className={"mt-bpill card-" + b.e.card}>{b.e.card}</span>;
    if (b.kind === "corner") return <span className="mt-bpill">corner</span>;
    if (b.kind === "added") return <span className="mt-bpill">+time</span>;
    return <span className="mt-bpill">note</span>;
  };
  const openBlk = (b) => {
    setBlkIns(null); setLineupEdit(null);
    const min = eventLineMinute(b.text);
    setBlkEdit({ idx: b.idx, kind: b.kind, minute: min, rest: min == null ? b.text : b.text.replace(/^\s*\d{1,2}\b\s*/, ""), confirmDel: false });
  };
  const blkLineOf = (be) => (be.minute == null ? be.rest.trim() : `${be.minute} ${be.rest.trim()}`);
  const blkOk = () => {
    const line = blkLineOf(blkEdit);
    if (!line) return;
    setRaw((r) => replaceEventLine(r, blkEdit.idx, line));
    setBlkEdit(null);
  };
  const blkDelete = () => {
    if (blkEdit.kind === "half") { setSavedMsg("Can't delete the half start"); setTimeout(() => setSavedMsg(""), 2000); return; }
    if (!blkEdit.confirmDel) {
      const idxAtArm = blkEdit.idx;
      setBlkEdit({ ...blkEdit, confirmDel: true });
      setTimeout(() => setBlkEdit((be) => be && be.idx === idxAtArm ? { ...be, confirmDel: false } : be), 3500);
      return;
    }
    setRaw((r) => deleteEventLine(r, blkEdit.idx));
    setBlkEdit(null);
  };

  // "+ Insert after": anchor block decides the half and the default minute
  const anchorMinute = (text) => {
    const m = (text || "").match(/^(\d{1,2})[:.]?(\d{2})?/);
    return m ? (m[2] != null ? parseInt(m[2], 10) : parseInt(m[1], 10)) % 60 : 0;
  };
  const openInsert = (b) => { setBlkEdit(null); setLineupEdit(null); setBlkIns({ afterIdx: b.idx, minute: anchorMinute(b.text), stage: "event", team: null, ev: null, on: null, off: null, noteText: "", noteMin: false }); };
  const openLineup = () => {
    setBlkEdit(null); setBlkIns(null);
    const lines = raw.split("\n");
    setLineupEdit(lines.slice(0, rosterEnd(lines)).join("\n"));
  };
  const lineupOk = () => {
    setRaw((r) => {
      const lines = r.split("\n");
      return [...lineupEdit.replace(/\n+$/, "").split("\n"), ...lines.slice(rosterEnd(lines))].join("\n");
    });
    setLineupEdit(null);
  };
  // commit an insert: place the built line after the anchor (re-ordered by minute), toast, close
  const insCommit = (line) => {
    if (!line) return;
    setRaw((r) => insertEventLine(r, blkIns.afterIdx, line));
    setBlkIns(null);
    setSavedMsg(`Inserted "${line}"`); setTimeout(() => setSavedMsg(""), 1800);
  };
  // team picked in the insert flow (event → team → player, mirrors game mode): player
  // events open the Who? picker when we have a roster; everything else commits straight away
  const insPickTeam = (team) => {
    const ev = blkIns.ev;
    if (ev === "sub") return setBlkIns({ ...blkIns, stage: "subOff", team, off: null, on: null });
    if (LIVE_PLAYER_EVENTS.includes(ev) && (team === "us" || (oppRoster && oppRoster.players && oppRoster.players.length))) return setBlkIns({ ...blkIns, stage: "who", team });
    insCommit(buildEventLine(ev, team, null, blkIns.minute));
  };
  const subWho = (p) => (p && p !== "unknown" ? (p.name || String(p.num)) : "");
  const noteLine = () => (blkIns && blkIns.noteText.trim() ? (blkIns.noteMin ? `${blkIns.minute} ${blkIns.noteText.trim()}` : blkIns.noteText.trim()) : "");
  // a minuted free-text note with none of the parser's note keywords would read as a score
  const notePhantom = blkIns && blkIns.stage === "note" && blkIns.noteMin && blkIns.noteText.trim()
    && !/\b(miss(ed|es)?|wide|saved|blocked|short|water|corner|yellow|red|for)\b/i.test(blkIns.noteText);

  // side-aware lineup badge helpers (sub arrows, card/og marks, score tally)
  const mdl = { timeline, usScorers, themScorers };
  const subArrows = (num, side) => {
    const b = lineupBadges(mdl, side, num);
    return (b.subOn || b.subOff) ? (
      <span style={{ fontSize: 10, letterSpacing: 1 }}>
        {b.subOn && <span style={{ color: "#2ecc71" }}>▲</span>}
        {b.subOff && <span style={{ color: "#ff6e63" }}>▼</span>}
      </span>
    ) : null;
  };
  const playerMarks = (num, side) => {
    const b = lineupBadges(mdl, side, num);
    if (!b.cards.length && !b.og) return null;
    return (
      <span style={{ marginLeft: 2, whiteSpace: "nowrap" }}>
        {b.cards.map((c, i) => <span key={i} style={{ display: "inline-block", width: 7, height: 10, borderRadius: 1.5, background: c === "red" ? "#e74c3c" : "#f1c40f", border: "1px solid rgba(0,0,0,.25)", marginLeft: 2, verticalAlign: "-1px" }} />)}
        {b.og && <span style={{ color: "#ff6e63", fontSize: 9, fontWeight: 600, marginLeft: 2 }}>OG</span>}
      </span>
    );
  };
  // what a player scored, for the lineup: "1-2" in GAA, a ball per goal in soccer
  const scoreFor = (num, side) => {
    const sc = lineupBadges(mdl, side, num).score;
    if (!sc) return null;
    return <span className="pts">{effMode === "goals" ? "⚽".repeat(sc.g) : fmtScore(sc.g, sc.p, effMode)}</span>;
  };
  const chunk = (arr, n) => arr.reduce((a, _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);
  const formationRows = parsed.formationRows && parsed.formationRows.length
    ? parsed.formationRows
    : chunk(starters.map((p) => p.num), 3);
  // live entry: "Who?" buttons laid out like the lineup pitch, plus the sport-relevant events
  const liveRows = formationRows.map((row) => row.map((n) => roster.find((p) => p.num === n)).filter(Boolean)).filter((r) => r.length);
  const liveEvents = LIVE_EVENTS.filter((ev) => (effMode === "goals" ? !ev.gaa : !ev.goalsOnly))
    .filter((ev) => !(ev.key === "point65" && sportLabel === "Gaelic Football") && !(ev.key === "point45" && /hurling|camogie/i.test(sportLabel || "")));
  // match phase gates the buttons: before throw-in or at half time only "Start half"
  // works (anything else would land in the roster block / dead time), after FT nothing.
  // Subs aren't gated — the lineup tab stays live for half-time changes.
  const lastMark = halfMarks[halfMarks.length - 1];
  const phase = halfMarks.some((m) => m.marker === "FT") ? "over"
    : halfMarks.length === 0 ? "pre"
    : lastMark && lastMark.marker === "HT" ? "ht" : "play";
  const evEnabled = (k) => (phase === "play" ? k !== "half" : (phase === "pre" || phase === "ht") && k === "half");

  const doExport = () => {
    if (shareModel) { setShareModel(null); return; }
    const ht = htScore(parsed.series, effMode);
    const model = {
      grade: header.label || "", sport: sportLabel || "", homeAway: header.homeAway,
      usName, themName, dateStr: matchDate ? fmtDate(matchDate) : "",
      totals, result, effMode, ht,
      leadChanges: parsed.leadChanges, timesLevel: parsed.timesLevel, maxLead: parsed.maxLead, maxLeadSide: parsed.maxLeadSide,
      series: parsed.series, goalDots: parsed.goalDots, chartMarkers, htLine: parsed.htLine, halfMarks,
      usSquad, oppSquad,
      usScorers, themScorers, formationRows, starters, subs, missing, timeline, oppRoster,
      colorUs, colorUs2, colorThem, colorThem2,
    };
    const safe = (s) => (s || "match").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    setShareModel({ model, filename: `${safe(header.label || usName)}-${safe(themName)}.png`, title: `${usName} ${totals.us.str} – ${totals.them.str} ${themName}` });
  };
  const openBackup = async () => {
    if (modal && modal.kind === "backup") { setModal(null); return; }
    const keys = await store.list();
    const matches = [];
    for (const k of keys) { const id = k.replace(/^match:/, ""); const d = await store.get(id); if (d) matches.push({ id, ...d }); }
    setExportText(JSON.stringify({ v: 1, matches }));
    setImportText("");
    setModal({ kind: "backup", count: matches.length });
  };
  const copyExport = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(exportText).then(() => { setSavedMsg("Copied ✓"); setTimeout(() => setSavedMsg(""), 1500); }).catch(() => {});
  };
  const doImport = async () => {
    try {
      const obj = JSON.parse(importText.trim());
      const items = remapImport(obj);
      let n = 0;
      for (const { id, rec } of items) { if (await store.set(id, rec)) n++; }
      await refreshList();
      setModal(null); setSavedMsg(`Imported ${n} match${n === 1 ? "" : "es"} ✓`); setTimeout(() => setSavedMsg(""), 2500);
    } catch (e) { setSavedMsg("Import failed — check the text"); setTimeout(() => setSavedMsg(""), 2500); }
  };

  const tabs = [["details", "Details"], ["lineup", "Lineup"], ["game", "Game mode"], ["advanced", "Advanced"]];


  const view = nw ? "new" : tab; // new-match wizard replaces the tab body; game mode is the "game" tab; Share is an inline panel

  return (
    <div className="mt-root">

      {/* frozen top chrome — header + scoreboard + tabs stay pinned while the body scrolls */}
      <div className="mt-frozen">
      {/* persistent header */}
      {!nw && (
        <AppHeader
          email={userEmail}
          onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }}
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
          onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }}
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
              <textarea readOnly value={exportText} onClick={(e) => e.target.select()} />
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
        const usIsHome = header.homeAway === "home";
        const usTotal = gpTotal(totals.us.g, totals.us.p, effMode);
        const themTotal = gpTotal(totals.them.g, totals.them.p, effMode);
        return (
          <ScoreHeader
            homeName={usIsHome ? usName : themName}
            awayName={usIsHome ? themName : usName}
            homeStr={usIsHome ? totals.us.str : totals.them.str}
            awayStr={usIsHome ? totals.them.str : totals.us.str}
            homeColors={usIsHome ? [colorUs, colorUs2] : [colorThem, colorThem2]}
            awayColors={usIsHome ? [colorThem, colorThem2] : [colorUs, colorUs2]}
            grade={header.label || sportLabel || ""}
            dateStr={matchDate ? fmtDateDow(matchDate) : ""}
            homeTotal={usIsHome ? usTotal : themTotal}
            awayTotal={usIsHome ? themTotal : usTotal}
            phase={phase}
            live={phase === "play" || phase === "ht"}
            homeSquad={usIsHome ? usSquad : oppSquad}
            awaySquad={usIsHome ? oppSquad : usSquad}
            action={<button className="sh-edit" onClick={() => { setShowDetails((o) => !o); if (showDetails) setColorPick(null); }}>{showDetails ? "▾ Hide" : "✎ Edit"}</button>}
          />
        );
      })()}

      {/* match details panel — drops below the scoreboard */}
      {!nw && showDetails && (
      <div className="mt-settings">
        <label>Date <input type="date" value={(matchDate || "").slice(0, 10)} onChange={(e) => e.target.value && setMatchDate(`${e.target.value}T${(matchDate || "").slice(11, 16) || "12:00"}`)} />
          <input type="time" value={(matchDate || "").slice(11, 16)} onChange={(e) => e.target.value && setMatchDate(`${(matchDate || "").slice(0, 10)}T${e.target.value}`)} /></label>
        <label>{header.homeAway === "home" ? "Home team" : "Away team"} <input type="text" value={myTeam} onChange={(e) => onMyTeamChange(e.target.value)} /> <button className="mt-swatch" title="Primary" style={{ background: colorUs }} onClick={() => setColorPick(colorPick === "us" ? null : "us")} /><button className="mt-swatch" title="Secondary" style={{ background: colorUs2 }} onClick={() => setColorPick(colorPick === "us2" ? null : "us2")} /></label>
        <label>
          <select className="mt-sel" style={{ color: "#222", background: "#fffdf6", borderColor: "#d8cfb8" }}
            value={header.homeAway === "home" ? "home" : "away"} onChange={(e) => {
              const v = e.target.value;
              const flipped = (header.homeAway === "home" ? "home" : "away") !== v;
              setHeaderField("homeAway", v);
              if (flipped && (homeTeamId || awayTeamId)) { setHomeTeamId(awayTeamId); setAwayTeamId(homeTeamId); }
            }}>
            <option value="away">Away @</option>
            <option value="home">Home v</option>
          </select>
        </label>
        <button className="mt-btn" title="Swap home/away" onClick={() => {
          const p = swapHomeAway(recordPayload());
          setHomeAway(p.homeAway); setHomeTeamId(p.homeTeamId); setAwayTeamId(p.awayTeamId);
        }}>⇄ Swap</button>
        <label>{header.homeAway === "home" ? "Away team" : "Home team"} <input type="text" value={header.opposition || ""} placeholder={header.homeAway === "home" ? "Away team" : "Home team"}
          onChange={(e) => setHeaderField("opposition", e.target.value)} /> <button className="mt-swatch" title="Primary" style={{ background: colorThem }} onClick={() => setColorPick(colorPick === "them" ? null : "them")} /><button className="mt-swatch" title="Secondary" style={{ background: colorThem2 }} onClick={() => setColorPick(colorPick === "them2" ? null : "them2")} /></label>
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
        const map = {
          us: [colorUs, setColorUs, `${usName} — primary`], us2: [colorUs2, setColorUs2, `${usName} — secondary`],
          them: [colorThem, setColorThem, `${themName} — primary`], them2: [colorThem2, setColorThem2, `${themName} — secondary`],
        };
        const [val, setVal, label] = map[colorPick];
        const sw = (c) => (
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

      <div className="mt-body">
        {view === "new" && (
          <div className="mt-game nw">
            <div className="mt-row" style={{ marginBottom: 8 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>{nw.stage === "home" ? "Home team" : nw.stage === "away" ? "Away team" : "New match"}</span>
              <button className="mt-add alt" onClick={() => router.push("/")}>✕ Cancel</button>
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
        )}
        {view === "game" && (
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
                  <button className="mt-big gm-team" style={{ background: colorUs, color: contrastOn(colorUs) }} onClick={() => pickGmTeam("us")}>{usName}</button>
                  <button className="mt-big gm-team" style={{ background: colorThem, color: contrastOn(colorThem) }} onClick={() => pickGmTeam("them")}>{themName}</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "event" })}>← Back</button>
              </>
            )}

            {/* stage 3 — which player? (scores / cards) */}
            {phase !== "over" && gmStage.stage === "who" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{evLabel(gmStage.ev)} · {gmStage.team === "them" ? themName : usName} — who?</p>
                {gmPicker(gmStage.team, (p) => { addLive(gmStage.ev, p, gmStage.team); setGmStage({ stage: "event" }); }, { allowUnknown: true })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team", ev: gmStage.ev })}>← Back</button>
              </>
            )}

            {/* sub flow — off then on, on the team's jersey pitch */}
            {phase !== "over" && gmStage.stage === "subOff" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.team === "them" ? themName : usName} sub — who goes off?</p>
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
            <Timeline timeline={timeline} halfMarks={halfMarks} colorUs={colorUs} colorUs2={colorUs2} colorThem={colorThem} colorThem2={colorThem2} usName={usName} themName={themName} />
          </div>
        )}

        {view === "details" && (
          <>
            {parsed.warnings.length > 0 && (
              <div className="mt-warn">
                <b>Heads up — check {parsed.warnings.length} {parsed.warnings.length === 1 ? "entry" : "entries"}.</b>
                <span> {parsed.warnings.map((w) => `${w.minute}' — ${w.msg}`).join("; ")}.</span>
              </div>
            )}
            <StatGrid stats={[
              { k: "Half-time", v: htScore(parsed.series, effMode) },
              { k: "Lead changes", v: parsed.leadChanges },
              { k: "Times level", v: parsed.timesLevel },
              { k: `Biggest lead${parsed.maxLeadSide ? " · " + (parsed.maxLeadSide === "us" ? usName : themName) : ""}`, v: parsed.maxLead },
            ]} />

            <p className="mt-h">Score progression</p>
            <div style={{ width: "100%" }}>
              <ScoreChart series={series} goalDots={goalDots} chartMarkers={chartMarkers} htLine={htLine} colorUs={colorUs} colorThem={colorThem} nameUs={usName} nameThem={themName} mode={effMode} />
            </div>

            <p className="mt-h" style={{ marginTop: 18 }}>Scorers</p>
            <Scorers us={usScorers} them={themScorers} colorUs={colorUs} colorUs2={colorUs2} colorThem={colorThem} colorThem2={colorThem2} mode={effMode} />

            <p className="mt-h" style={{ marginTop: 18 }}>Timeline</p>
            <Timeline timeline={timeline} halfMarks={halfMarks} colorUs={colorUs} colorUs2={colorUs2} colorThem={colorThem} colorThem2={colorThem2} usName={usName} themName={themName} />
          </>
        )}

        {view === "lineup" && (editLineup ? (() => {
          const us = editLineup === "us";
          const roster = (us ? usRoster : oppRoster) || EMPTY_ROSTER;
          const setRoster = us ? setUsRoster : setOppRoster;
          return (
            <>
              <div className="mt-row" style={{ marginBottom: 8 }}>
                <span className="mt-h" style={{ margin: 0, flex: 1 }}>Edit {us ? usName : themName} — tap to rename/renumber; ⇄ Swap or ↕ Move</span>
                <button className="mt-add" onClick={() => setEditLineup(false)}>✓ Done</button>
              </div>
              <RosterPitch roster={roster} color1={us ? colorUs : colorThem} color2={us ? colorUs2 : colorThem2} editable onChange={setRoster} />
              <div className="mt-row" style={{ marginTop: 8 }}>
                <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "starting"))}>+ Player</button>
                <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "sub"))}>+ Sub</button>
              </div>
            </>
          );
        })() : (
          <>
            <div className="mt-row" style={{ marginBottom: 6 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>{usName}</span>
              <button className="mt-add alt" onClick={() => setEditLineup("us")}>✎ Edit lineup</button>
            </div>
            <div className="mt-pitch" style={{ background: `linear-gradient(${colorUs2}22, #0c3b2a 60%)` }}>
              {formationRows.map((row, ri) => (
                <div className="mt-line" key={ri}>
                  {row.map((n) => {
                    const p = starters.find((x) => x.num === n);
                    const picked = subPick && subPick.role === "off" && subPick.num === n;
                    return (
                      <div className="mt-jersey" key={n} style={{ cursor: "pointer", outline: picked ? "2px solid #f5c518" : "none", outlineOffset: 2, borderRadius: 8 }} onClick={() => tapPlayer({ num: n, name: p ? p.name : String(n) }, "pitch")}>
                        <Jersey c1={colorUs} c2={colorUs2} num={n} size={44} />
                        <div className="nm">{p ? p.name : ""} {subArrows(n, "us")}{playerMarks(n, "us")}</div>
                        {scoreFor(n, "us")}
                      </div>
                    );
                  })}
                </div>
              ))}
              {subs.length > 0 && (
                <>
                  <div className="rp-subhead">Subs</div>
                  <div className="mt-line">
                    {subs.map((p) => {
                      const picked = subPick && subPick.role === "on" && subPick.num === p.num;
                      return (
                        <div className="mt-jersey" key={p.num} style={{ cursor: "pointer", outline: picked ? "2px solid #f5c518" : "none", outlineOffset: 2, borderRadius: 8 }} onClick={() => tapPlayer({ num: p.num, name: p.name }, "bench")}>
                          <Jersey c1={colorUs} c2={colorUs2} num={p.num} size={36} />
                          <div className="nm">{p.name} {subArrows(p.num, "us")}{playerMarks(p.num, "us")}</div>
                          {scoreFor(p.num, "us")}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
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
            {missing.length > 0 && <><p className="mt-h" style={{ marginTop: 14 }}>Missing</p><div className="mt-bench">{missing.map((p) => <span className="b miss" key={p.num}>{p.num}. {p.name}</span>)}</div></>}
            {oppRoster && (
              <>
                <div className="mt-row" style={{ marginTop: 18, marginBottom: 6 }}>
                  <span className="mt-h" style={{ margin: 0, flex: 1 }}>{themName}</span>
                  <button className="mt-add alt" onClick={() => setEditLineup("them")}>✎ Edit lineup</button>
                </div>
                {oppRoster.formation && oppRoster.formation.length > 0 ? (
                  <div className="mt-pitch" style={{ background: `linear-gradient(${colorThem2}22, #0c3b2a 60%)` }}>
                    {oppRoster.formation.map((row, ri) => (
                      <div className="mt-line" key={ri}>
                        {row.map((n) => { const op = oppRoster.players.find((x) => x.num === n); return (
                          <div className="mt-jersey" key={n}>
                            <Jersey c1={colorThem} c2={colorThem2} num={n} size={40} />
                            <div className="nm">{op ? op.name : ""} {subArrows(n, "them")}{playerMarks(n, "them")}</div>
                            {scoreFor(n, "them")}
                          </div>
                        ); })}
                      </div>
                    ))}
                    {(() => { const os = oppRoster.players.filter((p) => p.role === "sub"); return os.length > 0 ? (
                      <>
                        <div className="rp-subhead">Subs</div>
                        <div className="mt-line">{os.map((p) => (
                          <div className="mt-jersey" key={p.num}><Jersey c1={colorThem} c2={colorThem2} num={p.num} size={36} /><div className="nm">{p.name} {subArrows(p.num, "them")}{playerMarks(p.num, "them")}</div>{scoreFor(p.num, "them")}</div>
                        ))}</div>
                      </>
                    ) : null; })()}
                  </div>
                ) : (
                  <p className="mt-note">No away lineup yet — tap Edit lineup to add players.</p>
                )}
              </>
            )}
          </>
        ))}

        {view === "advanced" && (
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
                {blocks.list.map((b) => (
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
                              <button className="mt-big sm" style={{ background: colorUs, color: contrastOn(colorUs) }} onClick={() => insPickTeam("us")}>{usName}</button>
                              <button className="mt-big sm" style={{ background: colorThem, color: contrastOn(colorThem) }} onClick={() => insPickTeam("them")}>{themName}</button>
                            </div>
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "event", ev: null })}>← Back</button></div>
                          </>
                        )}

                        {/* stage 3 — which player? */}
                        {blkIns.stage === "who" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{evLabel(blkIns.ev)} · {blkIns.team === "them" ? themName : usName} — who?</p>
                            {gmPicker(blkIns.team, (p) => insCommit(buildEventLine(blkIns.ev, blkIns.team, p, blkIns.minute)), { allowUnknown: true })}
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "team" })}>← Back</button></div>
                          </>
                        )}

                        {/* sub flow — off then on, on the team's jersey pitch (eligibility tracked) */}
                        {blkIns.stage === "subOff" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{blkIns.team === "them" ? themName : usName} sub — who goes off?</p>
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
        )}
        {view !== "game" && view !== "new" && curId && (
          <section className="mt-danger">
            <h3 className="mt-h">Danger</h3>
            <button
              className={"mt-add" + (confirmDel ? " danger" : "")}
              onClick={() => {
                if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); return; }
                setConfirmDel(false); doDelete();
              }}
            >{confirmDel ? "Tap again to delete this match" : "🗑 Delete match"}</button>
          </section>
        )}
      </div>
      <BrandFooter />
    </div>
  );
}
