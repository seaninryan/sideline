// @ts-nocheck
"use client";
// useMatchEditor — owns all editor state + actions + derived values for MatchTracker.
// Extracted from MatchTracker (decomposition ②); behaviour-identical. The hook is the
// single unit-testable seam for the editor's logic (see test/use-match-editor.test.ts).
// Typing is a later slice; @ts-nocheck retained for the move.
import React, { useState, useMemo, useEffect, useRef } from "react";
import RosterPitch from "@/components/RosterPitch";
import { store, cache } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { parseMatch, isPlaceholderLabel } from "@/lib/parser";
import {
  deleteEventLine, insertEventLine, replaceEventLine, placeEventLineByMinute,
  eventLineMinute, rosterEnd,
} from "@/lib/raw-edit";
import { swapPositions, renumberPlayer, renamePlayer } from "@/lib/team-roster";
import { SAMPLE_RECORD } from "@/lib/sample";
import {
  gpTotal, fmtScore, squash, titleCase, contrastOn, mkId, remapImport,
  fmtDate, fmtDateShort, fmtDateDow, toLocalInput, dateKey, MONTHS, pad2,
} from "@/lib/util";
import { LIVE_EVENTS, LIVE_PLAYER_EVENTS, SPORTS, scoringModeForSport } from "@/lib/constants";
import { swapHomeAway, teamLinkPatch } from "@/lib/team-link";
import { teamStore } from "@/lib/team-store";
import { pairingError } from "@/lib/match-sport";
import { whoToken, onPitchNums } from "@/lib/event-line";
import { lineupBadges } from "@/lib/lineup-badges";
import { buildModel } from "@/lib/model";
import { reconcileIncoming } from "@/lib/live-update";
import { fetchIsAdmin } from "@/lib/viewer.client";
import { teamRosterPushes } from "@/lib/team-roster-sync";
import { useRouter } from "next/navigation";

const EMPTY_ROSTER = { formation: [], players: [] };

const sb = createClient();

// --- editor-local helpers (not extracted to lib; copied verbatim from index.html) ---

// sportEmoji (index.html 1107-1113)
const sportEmoji = (sport, headerSport, mode) => {
  if (SPORTS[sport]) return SPORTS[sport].emoji;
  const byLabel = Object.values(SPORTS).find((s) => s.label === headerSport);
  if (byLabel) return byLabel.emoji;
  return mode === "goals" ? SPORTS.soccer.emoji : "";
};

export function useMatchEditor({ initialId = null, wizard = false } = {}) {
  const router = useRouter();
  const [raw, setRaw] = useState(SAMPLE_RECORD.raw);
  const [homeTeam, setHomeTeam] = useState(SAMPLE_RECORD.homeTeam || "Home");
  const [sport, setSport] = useState(SAMPLE_RECORD.sport || ""); // "" = unset (legacy/edge records → "goals"); a SPORTS key locks the scoring mode
  const [colorHome, setColorHome] = useState(SAMPLE_RECORD.colorHome || "#f5c518");
  const [colorHome2, setColorHome2] = useState(SAMPLE_RECORD.colorHome2 || "#1f7a4d");
  const [colorAway, setColorAway] = useState(SAMPLE_RECORD.colorAway || "#c0392b");
  const [colorAway2, setColorAway2] = useState(SAMPLE_RECORD.colorAway2 || "#2c5fa8");
  const [nameDisplay, setNameDisplay] = useState(SAMPLE_RECORD.nameDisplay || "full");
  // header now lives on the record, not the notation
  const [label, setLabel] = useState(SAMPLE_RECORD.label || "");
  const [awayTeam, setAwayTeam] = useState(SAMPLE_RECORD.awayTeam || "");
  const [homeRoster, setHomeRoster] = useState(SAMPLE_RECORD.homeRoster || null);
  const [legacyRaw, setLegacyRaw] = useState(undefined);
  const [tab, setTab] = useState("details");
  const [matchDate, setMatchDate] = useState(SAMPLE_RECORD.matchDate || "2026-06-02T18:21");
  const [curId, setCurId] = useState(null);
  const [saved, setSaved] = useState([]);
  const [savedMsg, setSavedMsg] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [colorPick, setColorPick] = useState(null); // which swatch is open: "home"|"home2"|"away"|"away2"
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
  const [lvTeam, setLvTeam] = useState("home");
  const [lvEvent, setLvEvent] = useState(null); // pending player event awaiting a "Who?" tap
  // game mode is a tab (tab === "game"); gmStage holds the staged-entry position.
  // stages: "team" → "event" → "who"; "subOff" → "subOn" for substitutions.
  const [gmStage, setGmStage] = useState({ stage: "event" });

  // new-match wizard: null when off, else {stage:"date"|"home"|"away", date,
  // sport (null = none supplied yet), home: TeamRecord|null, away: TeamRecord|null}
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
  const [awayRoster, setAwayRoster] = useState(SAMPLE_RECORD.awayRoster || null);
  const [homeSquad, setHomeSquad] = useState(SAMPLE_RECORD.homeSquad || "");
  const [awaySquad, setAwaySquad] = useState(SAMPLE_RECORD.awaySquad || "");
  const creatingRef = useRef(false); // guards finishNew against a double-tap minting two matches

  const parsed = useMemo(() => parseMatch(raw, { homeTeam, awayTeam, scoringMode: scoringModeForSport(sport), label, homeRoster, awayRoster }), [raw, homeTeam, awayTeam, sport, label, homeRoster, awayRoster]);
  const { header, roster, totals, result, series, goalDots, chartMarkers, scorers, scoring, notes, halfMarks, htLine } = parsed;
  const effMode = parsed.mode;
  const sportLabel = SPORTS[sport] ? SPORTS[sport].label : header.sport; // chosen sport beats one named in the notation

  const homeName = homeTeam || "Home";
  const awayName = awayTeam || "Away";

  // colours used across saved matches, most common first (suggestions in the picker)
  const usedColors = useMemo(() => {
    const count = {};
    for (const id of Object.keys(cache)) {
      const d = cache[id] || {};
      ["colorHome", "colorHome2", "colorAway", "colorAway2"].forEach((k) => {
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
      let opp = (d.awayTeam || "").trim() || "Opponent";
      let grade = (d.label || "").trim();
      let emoji = "";
      try { emoji = sportEmoji(d.sport, "", scoringModeForSport(d.sport)); } catch (e) {}
      if (isPlaceholderLabel(grade) || !grade) grade = (d.homeTeam || "").trim(); // pre-fix saves still show the team, not "New Match"
      const label = `${emoji ? emoji + " " : ""}${grade ? grade + " · " : ""}${opp}${d.date ? " — " + fmtDate(d.date) : ""}`;
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
  const recordPayload = () => ({ raw, matchDate, date: matchDate, sport: sport || undefined, colorHome, colorHome2, colorAway, colorAway2, nameDisplay, label, homeTeam, awayTeam, homeRoster, homeTeamId, awayTeamId, awayRoster, homeSquad, awaySquad, notationV: 3, ...(legacyRaw ? { legacyRaw } : {}) });
  // unsaved changes? compare editor state against the cached server record
  const dirty = useMemo(() => {
    if (!curId) return true; // new match, never saved
    const d = cache[curId];
    if (!d) return true;
    const p = recordPayload();
    return Object.keys(p).some((k) => k !== "date" && d[k] !== p[k]);
    // eslint-disable-next-line
  }, [curId, raw, matchDate, homeTeam, awayTeam, sport, colorHome, colorHome2, colorAway, colorAway2, nameDisplay, label, homeRoster, awayRoster, legacyRaw, homeTeamId, awayTeamId, homeSquad, awaySquad, saved]);
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
      const homeChanged = JSON.stringify(prev?.homeRoster) !== JSON.stringify(homeRoster);
      const awayChanged = JSON.stringify(prev?.awayRoster) !== JSON.stringify(awayRoster);
      const payload = recordPayload();
      const ok = await store.set(curId, { ...payload, savedAt: Date.now() });
      // our save is now the latest copy — any pending cross-device conflict notice is moot.
      if (ok) { setRemoteConflict(false); setSavedMsg("Auto-saved ✓"); setTimeout(() => setSavedMsg(""), 1200); }
      else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
      // Push the lineup to the linked team(s) when a roster changed and this is that team's latest match.
      if (ok && (homeChanged || awayChanged)) {
        try {
          const matchList = Object.entries(cache).map(([id, d]) => ({
            id, homeTeamId: d.homeTeamId, awayTeamId: d.awayTeamId,
            matchDate: d.matchDate, date: d.date, savedAt: d.savedAt,
          }));
          const pushes = teamRosterPushes({ ...payload, id: curId }, matchList);
          for (const p of pushes) {
            if (p.side === "home" ? homeChanged : awayChanged) await teamStore.setRoster(p.teamId, p.roster);
          }
        } catch (e) { console.warn("team lineup sync failed", e); }
      }
      await refreshList();
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [curId, dirty, raw, matchDate, homeTeam, awayTeam, sport, colorHome, colorHome2, colorAway, colorAway2, nameDisplay, label, homeRoster, homeTeamId, awayTeamId, awayRoster, homeSquad, awaySquad]);
  const applyRecord = (d) => {
    // Records are home/away (v3) — guaranteed by the load-time migration. Read directly.
    setRaw(d.raw); setHomeTeam(d.homeTeam || "Home");
    setSport(d.sport || "");
    setColorHome(d.colorHome || "#f5c518"); setColorHome2(d.colorHome2 || "#1f7a4d");
    setColorAway(d.colorAway || "#c0392b"); setColorAway2(d.colorAway2 || "#2c5fa8");
    setNameDisplay(d.nameDisplay || "full");
    setLabel(d.label || ""); setAwayTeam(d.awayTeam || "");
    setHomeRoster(d.homeRoster || null); setLegacyRaw(d.legacyRaw);
    setHomeTeamId(d.homeTeamId || null); setAwayTeamId(d.awayTeamId || null); setAwayRoster(d.awayRoster || null);
    setHomeSquad(d.homeSquad || ""); setAwaySquad(d.awaySquad || "");
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
    const team = homeTeam.trim() || "Home";
    const newRaw = "";
    const date = toLocalInput(new Date());
    const id = mkId();
    const ok = await store.set(id, { raw: newRaw, matchDate: date, date, homeTeam: team, sport: "soccer", colorHome, colorHome2, colorAway, colorAway2, label: "", awayTeam: "", notationV: 3, savedAt: Date.now() });
    if (ok) {
      // route transition is in-place (same /m/[id] route → no remount), so reflect the new match locally
      setRaw(newRaw); setMatchDate(date); setHomeTeam(team);
      setLabel(""); setAwayTeam(""); setHomeRoster(null); setLegacyRaw(undefined);
      setSport("soccer"); setCurId(id); setNw(null); setReTeam(null); setTab("game");
      router.replace(`/m/${id}`);
    } else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
  };
  const doDuplicate = () => {
    setCurId(null);
    setSavedMsg("Editing a new copy — change the date/away team, then Save");
    setTimeout(() => setSavedMsg(""), 3500);
  };
  const doDelete = async () => {
    if (!curId) return;
    const ok = await store.del(curId);
    if (ok) { router.push("/"); }
    else { setSavedMsg("NOT deleted — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
  };

  // edit header (away team / label) — now record fields, not the notation
  const setHeaderField = (field, value) => {
    if (field === "label") setLabel(value);
    else if (field === "away") setAwayTeam(value);
  };
  // Home team edits follow through to the header label, unless the user typed their own label (e.g. a grade).
  const onHomeTeamChange = (v) => {
    const cur = (header.label || "").trim();
    if (isPlaceholderLabel(cur) || cur === homeTeam.trim()) setHeaderField("label", v.trim() || "Home");
    setHomeTeam(v);
  };

  // ---- live append helpers ----
  const append = (text) => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setRaw((r) => r.replace(/\s*$/, "") + "\n" + text); };
  // substitution: tap the player going off (pitch) and the one coming on (subs), either order
  // on/off are player objects (or "unknown"); team picks which roster to qualify against
  const completeSub = (on, off, team = "home") => {
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
    if (LIVE_PLAYER_EVENTS.includes(ev) && (team === "home" || (awayRoster && awayRoster.players && awayRoster.players.length))) return setGmStage({ stage: "who", ev, team });
    addLive(ev, null, team); setGmStage({ stage: "event" });
  };
  // who's currently on the pitch for a side (starters ± committed subs) and who's benched
  const onPitchSet = (team) => onPitchNums(team === "away" ? awayRoster : homeRoster, parsed.notes.filter((n) => n.type === "sub" && n.side === team));
  const benchSet = (team) => {
    const roster = team === "away" ? awayRoster : homeRoster;
    const on = onPitchSet(team);
    return new Set((roster?.players || []).map((p) => p.num).filter((n) => !on.has(n)));
  };
  // pick a player on `team`: jersey pitch when the roster has a formation, else the flat
  // who-grid. allowUnknown adds a team-level "Unknown" choice (scores/cards, not subs);
  // eligible (a Set of shirt numbers) restricts the pickable players (used by the sub flow).
  const gmPicker = (team, onPick, opts = {}) => {
    const { selected = null, allowUnknown = false, eligible = null } = opts;
    const roster = team === "away" ? awayRoster : homeRoster;
    const c = team === "away" ? [colorAway, colorAway2] : [colorHome, colorHome2];
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
  const tapPitch = (p, team = "home") => {
    if (subPick && subPick.role === "on" && subPick.side === team) return completeSub(subPick, p, team);
    setSubPick(subPick && subPick.role === "off" && subPick.side === team && subPick.num === p.num ? null : { role: "off", side: team, ...p });
  };
  const tapBench = (p, team = "home") => {
    if (subPick && subPick.role === "off" && subPick.side === team) return completeSub(p, subPick, team);
    setSubPick(subPick && subPick.role === "on" && subPick.side === team && subPick.num === p.num ? null : { role: "on", side: team, ...p });
  };
  // lineup tools route every tap through here; default falls through to the sub flow
  const resetLineupModes = () => { setLineupMode(null); setSwapFirst(null); setRenumTarget(null); setNewNum(""); setNewName(""); setSubPick(null); };
  const rosterSetter = (side) => (side === "away" ? setAwayRoster : setHomeRoster);
  const tapPlayer = (p, where, side = "home") => {
    if (lineupMode === "swap") {
      if (!swapFirst) return setSwapFirst(p);
      if (swapFirst.num === p.num) return setSwapFirst(null);
      rosterSetter(side)((r) => r ? swapPositions(r, swapFirst.num, p.num) : r);
      setSavedMsg(`Swapped ${swapFirst.name || swapFirst.num} & ${p.name || p.num}`); setTimeout(() => setSavedMsg(""), 2500);
      return resetLineupModes();
    }
    if (lineupMode === "renum") { setRenumTarget({ ...p, side }); setNewNum(String(p.num)); setNewName(p.name || ""); return; }
    return where === "pitch" ? tapPitch(p, side) : tapBench(p, side);
  };
  const renumValid = (() => {
    const n = parseInt(newNum, 10);
    const tgtRoster = renumTarget && renumTarget.side === "away" ? awayRoster : homeRoster;
    const players = (tgtRoster && tgtRoster.players) || roster;
    return renumTarget && n >= 1 && n <= 99 && !players.some((p) => p.num === n && p.num !== renumTarget.num);
  })();
  const applyRenum = () => {
    if (!renumValid) return;
    const nn = parseInt(newNum, 10), name = newName.trim();
    rosterSetter(renumTarget.side || "home")((r) => {
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
  const whoCtx = () => ({ homeName, awayName, homeRoster, awayRoster });
  const buildEventLine = (ev, team, player, min) => {
    const awayTok = awayName || "Away";
    const homeTok = (homeName || "").trim() || "Home";
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
      case "corner": return team === "away" ? `${min} ${awayTok} corner` : `${min} ${homeTok} corner`;
      case "ht": return `${min} HT`;
      case "ft": return `${min} FT`;
      case "half": return `${new Date().getHours()}:${pad2(parseInt(min, 10) % 60)}`;
      default: return "";
    }
  };
  const liveLine = (ev, player, team = lvTeam) => buildEventLine(ev, team, player, String(new Date().getMinutes()));
  const whoGrid = (onPick, team = "home") => {
    // away: build rows/bench from the away roster (when populated); home: our roster
    const rows = team === "away"
      ? ((awayRoster && awayRoster.formation && awayRoster.formation.length ? awayRoster.formation : chunk((awayRoster?.players || []).filter((p) => p.role !== "sub").map((p) => p.num), 3)).map((row) => row.map((n) => (awayRoster?.players || []).find((p) => p.num === n)).filter(Boolean)).filter((r) => r.length))
      : liveRows;
    const bench = team === "away" ? (awayRoster?.players || []).filter((p) => p.role === "sub") : subs;
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
  // Wizard picks a Home team then an Away team (sport is chosen on stage 1).
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
  // teamLinkPatch is home/away; the wizard picks home (.home) & away (.away) teams directly.
  const reTeamApply = () => {
    if (!reTeam.home || !reTeam.away || pairingError(reTeam.home.sport, reTeam.away.sport)) return;
    const patch = teamLinkPatch(recordPayload(), { homeTeam: reTeam.home, awayTeam: reTeam.away });
    setSport(reTeam.sport);
    setHomeTeam(patch.homeTeam); setAwayTeam(patch.awayTeam);
    setHomeTeamId(patch.homeTeamId); setAwayTeamId(patch.awayTeamId);
    setHomeRoster(patch.homeRoster); setAwayRoster(patch.awayRoster);
    setHomeSquad(patch.homeSquad || ""); setAwaySquad(patch.awaySquad || "");
    setColorHome(patch.colorHome); setColorHome2(patch.colorHome2); setColorAway(patch.colorAway); setColorAway2(patch.colorAway2);
    setReTeam(null);
  };
  const finishNew = async () => {
    if (creatingRef.current || !nw.home || !nw.away) return;
    if (pairingError(nw.home.sport, nw.away.sport)) return;
    creatingRef.current = true;
    try {
      const sportKey = nw.sport || nw.home.sport || nw.away.sport || "soccer";
      const patch = teamLinkPatch({ label: "" } as any, { homeTeam: nw.home, awayTeam: nw.away });
      const label = nw.home.name;
      const rec = {
        raw: "", matchDate: nw.date, date: nw.date,
        sport: sportKey, notationV: 3, nameDisplay: "full", savedAt: Date.now(),
        ...patch, label,
      };
      setRaw(""); setHomeTeam(patch.homeTeam); setAwayTeam(patch.awayTeam); setLabel(label);
      setHomeTeamId(patch.homeTeamId); setAwayTeamId(patch.awayTeamId);
      setHomeRoster(patch.homeRoster); setAwayRoster(patch.awayRoster); setLegacyRaw(undefined);
      setHomeSquad(patch.homeSquad || ""); setAwaySquad(patch.awaySquad || "");
      setColorHome(patch.colorHome); setColorHome2(patch.colorHome2); setColorAway(patch.colorAway); setColorAway2(patch.colorAway2);
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

  // ⇄ Swap home/away (extracted from the inline onClick; unit-tested in decomp ③)
  const doSwap = () => {
    const p = swapHomeAway(recordPayload());
    setHomeTeam(p.homeTeam); setAwayTeam(p.awayTeam);
    setColorHome(p.colorHome); setColorHome2(p.colorHome2); setColorAway(p.colorAway); setColorAway2(p.colorAway2);
    setHomeRoster(p.homeRoster); setAwayRoster(p.awayRoster);
    setHomeSquad(p.homeSquad); setAwaySquad(p.awaySquad);
    setHomeTeamId(p.homeTeamId); setAwayTeamId(p.awayTeamId);
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

  const homeScorers = scorers.filter((s) => s.side === "home").sort((a, b) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const awayScorers = scorers.filter((s) => s.side === "away").sort((a, b) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const homeSeries = series;            // parser already home/away
  const timelineHA = timeline;          // timeline built from parsed scoring/notes — already home/away
  const homeColor = colorHome, awayColor = colorAway;
  const homeColor2 = colorHome2, awayColor2 = colorAway2;
  const homeSquadV = homeSquad, awaySquadV = awaySquad;
  const maxLeadVenue = parsed.maxLeadSide;   // already "home"|"away"|null
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
      const home = b.e.side === "home";
      return <span className="mt-bpill" style={{ background: home ? colorHome : colorAway, color: contrastOn(home ? colorHome : colorAway) }}>{home ? b.e.homeScore : b.e.awayScore}</span>;
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
    if (LIVE_PLAYER_EVENTS.includes(ev) && (team === "home" || (awayRoster && awayRoster.players && awayRoster.players.length))) return setBlkIns({ ...blkIns, stage: "who", team });
    insCommit(buildEventLine(ev, team, null, blkIns.minute));
  };
  const subWho = (p) => (p && p !== "unknown" ? (p.name || String(p.num)) : "");
  const noteLine = () => (blkIns && blkIns.noteText.trim() ? (blkIns.noteMin ? `${blkIns.minute} ${blkIns.noteText.trim()}` : blkIns.noteText.trim()) : "");
  // a minuted free-text note with none of the parser's note keywords would read as a score
  const notePhantom = blkIns && blkIns.stage === "note" && blkIns.noteMin && blkIns.noteText.trim()
    && !/\b(miss(ed|es)?|wide|saved|blocked|short|water|corner|yellow|red|for)\b/i.test(blkIns.noteText);

  // side-aware lineup badge helpers (sub arrows, card/og marks, score tally)
  const mdl = { timelineHA, homeScorers, awayScorers };
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
    const model = buildModel(recordPayload());
    const safe = (s) => (s || "match").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    setShareModel({ model, filename: `${safe(header.label || homeName)}-${safe(awayName)}.png`, title: `${homeName} ${totals.home.str} – ${totals.away.str} ${awayName}` });
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

  return {
    // router + supabase client
    router, sb,
    // raw + record state
    raw, setRaw, recordPayload, curId, setCurId,
    // teams / colours / squads
    homeTeam, setHomeTeam, awayTeam, setAwayTeam,
    colorHome, setColorHome, colorHome2, setColorHome2, colorAway, setColorAway, colorAway2, setColorAway2,
    homeRoster, setHomeRoster, awayRoster, setAwayRoster,
    homeTeamId, setHomeTeamId, awayTeamId, setAwayTeamId,
    homeSquad, setHomeSquad, awaySquad, setAwaySquad,
    nameDisplay, setNameDisplay,
    label, setLabel,
    sport, setSport,
    matchDate, setMatchDate,
    // session
    userEmail, userUid, userIsAdmin,
    // saved list + messaging
    saved, savedMsg, refreshList,
    // ui state
    colorPick, setColorPick,
    modal, setModal,
    menuOpen, setMenuOpen,
    confirmDel, setConfirmDel,
    exportText, importText, setImportText,
    notaView, setNotaView,
    blkEdit, setBlkEdit, blkIns, setBlkIns, lineupEdit, setLineupEdit,
    remoteConflict, setRemoteConflict,
    showDetails, setShowDetails,
    tab, setTab, view, tabs,
    canUndo, undoRaw, doUndo, undoTarget,
    // parsed + derived
    parsed, header, roster, totals, result, series, goalDots, chartMarkers, scorers, scoring, notes, halfMarks, htLine,
    effMode, sportLabel, homeName, awayName, usedColors,
    timeline, timelineHA, homeScorers, awayScorers, homeSeries,
    homeColor, awayColor, homeColor2, awayColor2, homeSquadV, awaySquadV,
    maxLeadVenue, starters, subs, missing, formationRows, liveRows, liveEvents, chunk,
    phase, evEnabled,
    blocks,
    // actions
    doSave, doLoad, doResyncLatest, doNew, doDuplicate, doDelete,
    setHeaderField, onHomeTeamChange,
    append, completeSub, evLabel, pickGmTeam, onPitchSet, benchSet, gmPicker,
    tapPitch, tapBench, resetLineupModes, tapPlayer, renumValid, applyRenum,
    whoCtx, buildEventLine, liveLine, whoGrid, addLive,
    enterNew, enterShare,
    nwPickHome, nwCreateHome, nwPickAway, nwCreateAway,
    reTeamPickHome, reTeamCreateHome, reTeamPickAway, reTeamCreateAway, reTeamApply,
    finishNew, doSwap,
    blkPill, openBlk, blkOk, blkDelete, openInsert, openLineup, lineupOk,
    insCommit, insPickTeam, subWho, noteLine, notePhantom,
    subArrows, playerMarks, scoreFor,
    doExport, openBackup, copyExport, doImport,
    // lineup substitution / editing state
    subPick, setSubPick, editLineup, setEditLineup,
    // game mode / wizard / re-pick state
    gmStage, setGmStage,
    nw, setNw, nwTeams, setNwTeams, reTeam, setReTeam,
    share, setShare, shareModel, setShareModel,
    // module helpers the JSX uses
    EMPTY_ROSTER,
  };
}
