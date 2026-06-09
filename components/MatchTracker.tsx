// @ts-nocheck
"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import MinuteStep from "@/components/MinuteStep";
import ScoreChart from "@/components/ScoreChart";
import { store, cache, loadAll } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { parseMatch, isPlaceholderLabel } from "@/lib/parser";
import { buildInfographicSVG } from "@/lib/infographic";
import { svgToPng } from "@/lib/svg-to-png.client";
import {
  deleteEventLine, insertEventLine, replaceEventLine, placeEventLineByMinute,
  eventLineMinute, swapRosterNums, renumRoster, rosterEnd,
} from "@/lib/raw-edit";
import { SAMPLE } from "@/lib/sample";
import {
  gpTotal, fmtScore, squash, titleCase, contrastOn, mkId, remapImport,
  fmtDate, fmtDateShort, toLocalInput, dateKey, MONTHS, pad2,
} from "@/lib/util";
import { APP_VERSION, PALETTE, LIVE_EVENTS, LIVE_PLAYER_EVENTS, SPORTS } from "@/lib/constants";
import ShareSheet from "@/components/ShareSheet";
import LinkTeams from "@/components/LinkTeams";
import { swapHomeAway } from "@/lib/team-link";
import AppHeader from "@/components/AppHeader";
import ScoreHeader from "@/components/ScoreHeader";
import { useRouter } from "next/navigation";

const sb = createClient();

// --- editor-local helpers (not extracted to lib; copied verbatim from index.html) ---

// StatCard (index.html 1080-1083)
function StatCard({ k, v }) {
  return <div className="mt-stat"><div className="v">{v}</div><div className="k">{k}</div></div>;
}

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

export default function MatchTracker({ initialId = null, wizard = false }: { initialId?: string | null; wizard?: boolean }) {
  const router = useRouter();
  const [raw, setRaw] = useState(SAMPLE);
  const [myTeam, setMyTeam] = useState("Racoons");
  const [scoringMode, setScoringMode] = useState("gaa");
  const [autoMode, setAutoMode] = useState(true);
  const [sport, setSport] = useState(""); // "" = auto-detect; else a SPORTS key, which fixes the scoring mode
  const [colorUs, setColorUs] = useState("#f5c518");
  const [colorUs2, setColorUs2] = useState("#1f7a4d");
  const [colorThem, setColorThem] = useState("#c0392b");
  const [colorThem2, setColorThem2] = useState("#2c5fa8");
  const [nameDisplay, setNameDisplay] = useState("full");
  const [tab, setTab] = useState("details");
  const [matchDate, setMatchDate] = useState("2026-06-02T18:21");
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
  useEffect(() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); }, [curId]);
  // default tab when a match opens: Game mode while unfinished, Details once it's full time.
  // Keyed on curId so it only fires on open, never mid-session (won't yank the user off a tab).
  useEffect(() => { if (curId) setTab(phase === "over" ? "details" : "game"); /* eslint-disable-next-line */ }, [curId]);
  // switching tabs closes any open Advanced editor and resets the game-mode stage
  useEffect(() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setGmStage({ stage: "team" }); }, [tab]);
  const [userEmailId, setUserEmailId] = useState("");
  useEffect(() => { sb.auth.getUser().then(({ data }) => { setUserEmail((data && data.user && data.user.email) || ""); setUserEmailId((data && data.user && data.user.id) || ""); }); }, []);

  // substitution (lineup tab): tap a pitch player and a sub, either order
  const [subPick, setSubPick] = useState(null); // {role:"off"|"on", num, name}
  // lineup tools: "swap" (reshuffle two players) or "renum" (change a shirt number)
  const [lineupMode, setLineupMode] = useState(null);
  const [swapFirst, setSwapFirst] = useState(null); // {num, name}
  const [renumTarget, setRenumTarget] = useState(null); // {num, name}
  const [newNum, setNewNum] = useState("");

  // live entry: team -> event -> (player); each tap that completes an event adds it straight away
  const [lvTeam, setLvTeam] = useState("us");
  const [lvEvent, setLvEvent] = useState(null); // pending player event awaiting a "Who?" tap
  // game mode is a tab (tab === "game"); gmStage holds the staged-entry position.
  // stages: "team" → "event" → "who"; "subOff" → "subOn" for substitutions.
  const [gmStage, setGmStage] = useState({ stage: "team" });

  // new-match wizard: null when off, else {stage:"date"|"us"|"opp", date, team, label,
  // sport (null = none supplied yet), homeAway, colors:[c,c2]|null, oppName}
  const [nw, setNw] = useState(null);
  const [share, setShare] = useState(false);
  const [link, setLink] = useState(false);
  const [homeTeamId, setHomeTeamId] = useState(null);
  const [awayTeamId, setAwayTeamId] = useState(null);
  const [oppRoster, setOppRoster] = useState(null);
  const creatingRef = useRef(false); // guards finishNew against a double-tap minting two matches

  const parsed = useMemo(() => parseMatch(raw, { myTeam, scoringMode: SPORTS[sport] ? SPORTS[sport].mode : (autoMode ? undefined : scoringMode) }), [raw, myTeam, scoringMode, autoMode, sport]);
  const { header, roster, totals, result, series, goalDots, scorers, scoring, notes, halfMarks, htLine } = parsed;
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

  // previous teams for the new-match wizard, most recent fixture first.
  // Parsing just the header line is cheap and reuses the canonical header logic.
  const prevTeams = useMemo(() => {
    const recs = Object.keys(cache).map((id) => cache[id] || {})
      .sort((a, b) => dateKey(b.date, b.savedAt || 0) - dateKey(a.date, a.savedAt || 0));
    const us = [], opps = [], usSeen = new Set(), oppSeen = new Set();
    for (const d of recs) {
      let h = {};
      try { h = parseMatch((d.raw || "").split("\n")[0], {}).header; } catch (e) {}
      const team = (d.myTeam || "").trim();
      const label = isPlaceholderLabel(h.label) ? "" : (h.label || "").trim();
      const uk = squash(team) + "|" + squash(label);
      if (team && !usSeen.has(uk)) { usSeen.add(uk); us.push({ team, label, colorUs: d.colorUs, colorUs2: d.colorUs2, sport: d.sport || "" }); }
      const opp = (h.opposition || "").trim();
      if (opp && !isPlaceholderLabel(opp) && opp.toLowerCase() !== "opponent" && !oppSeen.has(squash(opp))) {
        oppSeen.add(squash(opp));
        opps.push({ name: opp, colorThem: d.colorThem, colorThem2: d.colorThem2, sport: d.sport || "" });
      }
    }
    return { us, opps };
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
      let opp = "Opponent", ha = "away", grade = "", emoji = "";
      try {
        const pm = parseMatch(d.raw || "", {});
        const h = pm.header; if (h.opposition) opp = h.opposition; if (h.homeAway) ha = h.homeAway; if (h.label) grade = h.label;
        emoji = sportEmoji(d.sport, h.sport, d.scoringMode || pm.mode);
      } catch (e) {}
      if (isPlaceholderLabel(grade)) grade = (d.myTeam || "").trim(); // pre-fix saves still show the team, not "New Match"
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
  const recordPayload = () => ({ raw, matchDate, date: matchDate, myTeam, scoringMode: effMode, autoMode, sport: sport || undefined, colorUs, colorUs2, colorThem, colorThem2, nameDisplay, homeTeamId, awayTeamId, oppRoster });
  // unsaved changes? compare editor state against the cached server record
  const dirty = useMemo(() => {
    if (!curId) return true; // new match, never saved
    const d = cache[curId];
    if (!d) return true;
    const p = recordPayload();
    return Object.keys(p).some((k) => k !== "date" && d[k] !== p[k]);
    // eslint-disable-next-line
  }, [curId, raw, matchDate, myTeam, effMode, autoMode, sport, colorUs, colorUs2, colorThem, colorThem2, nameDisplay, homeTeamId, awayTeamId, oppRoster, saved]);

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
      const ok = await store.set(curId, { ...recordPayload(), savedAt: Date.now() });
      if (ok) { setSavedMsg("Auto-saved ✓"); setTimeout(() => setSavedMsg(""), 1200); }
      else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
      await refreshList();
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [curId, dirty, raw, matchDate, myTeam, effMode, autoMode, sport, colorUs, colorUs2, colorThem, colorThem2, nameDisplay, homeTeamId, awayTeamId, oppRoster]);
  // legacy matches (no team links) get a gentle one-time "Link teams?" nudge on open
  const linkNudged = useRef(false);
  useEffect(() => { linkNudged.current = false; }, [curId]);
  useEffect(() => {
    if (curId && !homeTeamId && !awayTeamId && !linkNudged.current && !nw) {
      linkNudged.current = true;
      setSavedMsg("Tip: link this match to teams (🤝) for fixtures + opponent lineup");
      setTimeout(() => setSavedMsg(""), 4000);
    }
  }, [curId, homeTeamId, awayTeamId, nw]);
  // Re-pull the server copy (e.g. edits made on another device) on demand.
  const doResync = async () => {
    if (dirty && curId && !window.confirm("This match has unsaved changes here — load the server copy over them?")) return;
    setBlkEdit(null); setBlkIns(null); setLineupEdit(null);
    setSavedMsg("Syncing…");
    try {
      await loadAll();
      await refreshList();
      if (curId && cache[curId]) doLoad(curId);
      else if (curId) setCurId(null); // deleted on the other device
      setSavedMsg("Synced ✓"); setTimeout(() => setSavedMsg(""), 2000);
    } catch (e) { setSavedMsg("Sync failed — try again"); setTimeout(() => setSavedMsg(""), 4000); }
  };
  const doLoad = async (key) => {
    const id = key.replace(/^match:/, "");
    const d = await store.get(id);
    if (!d) return;
    setRaw(d.raw); setMyTeam(d.myTeam || "My Team"); setScoringMode(d.scoringMode || "gaa");
    setAutoMode(d.autoMode !== undefined ? d.autoMode : true);
    setSport(d.sport || "");
    setColorUs(d.colorUs || "#f5c518"); setColorUs2(d.colorUs2 || "#1f7a4d");
    setColorThem(d.colorThem || "#c0392b"); setColorThem2(d.colorThem2 || "#2c5fa8");
    setNameDisplay(d.nameDisplay || "full");
    setHomeTeamId(d.homeTeamId || null); setAwayTeamId(d.awayTeamId || null); setOppRoster(d.oppRoster || null);
    setMatchDate(d.date || d.matchDate || toLocalInput(new Date())); setCurId(id);
  };
  const doNew = async () => {
    // blank match: create + save immediately so it has a real /m/<uuid> home, then go there
    const team = myTeam.trim() || "My Team";
    const newRaw = `${team} @ Opponent\n1 \n`;
    const date = toLocalInput(new Date());
    const id = mkId();
    const ok = await store.set(id, { raw: newRaw, matchDate: date, date, myTeam: team, scoringMode: "gaa", autoMode: true, colorUs, colorUs2, colorThem, colorThem2, savedAt: Date.now() });
    if (ok) {
      // route transition is in-place (same /m/[id] route → no remount), so reflect the new match locally
      setRaw(newRaw); setMatchDate(date); setMyTeam(team);
      setScoringMode("gaa"); setAutoMode(true); setCurId(id); setNw(null); setTab("game");
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

  // edit header (opponent / home-away / label) without touching the raw text
  const setHeaderField = (field, value) => {
    const label = field === "label" ? value : (header.label || "Match");
    const opposition = field === "opposition" ? value : (header.opposition || "");
    const homeAway = field === "homeAway" ? value : (header.homeAway || "away");
    const sym = homeAway === "home" ? "v" : "@";
    const newHeader = `${label || "Match"} ${sym} ${opposition}`.replace(/\s+/g, " ").trim();
    setRaw((r) => {
      const lines = r.split("\n");
      let hi = lines.findIndex((l) => l.trim() !== "");
      if (hi === -1) return newHeader + "\n" + r;
      lines[hi] = newHeader;
      return lines.join("\n");
    });
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
  const completeSub = (onName, offName) => {
    append(`${new Date().getMinutes()} ${onName} for ${offName}`);
    setSubPick(null);
    setSavedMsg(`Sub added — ${onName} for ${offName}`); setTimeout(() => setSavedMsg(""), 2500);
  };
  const tapPitch = (p) => {
    if (subPick && subPick.role === "on") return completeSub(subPick.name, p.name);
    setSubPick(subPick && subPick.role === "off" && subPick.num === p.num ? null : { role: "off", ...p });
  };
  const tapBench = (p) => {
    if (subPick && subPick.role === "off") return completeSub(p.name, subPick.name);
    setSubPick(subPick && subPick.role === "on" && subPick.num === p.num ? null : { role: "on", ...p });
  };
  // lineup tools route every tap through here; default falls through to the sub flow
  const resetLineupModes = () => { setLineupMode(null); setSwapFirst(null); setRenumTarget(null); setNewNum(""); setSubPick(null); };
  const tapPlayer = (p, where) => {
    if (lineupMode === "swap") {
      if (!swapFirst) return setSwapFirst(p);
      if (swapFirst.num === p.num) return setSwapFirst(null);
      setRaw((r) => swapRosterNums(r, swapFirst.num, p.num));
      setSavedMsg(`Swapped ${swapFirst.name || swapFirst.num} & ${p.name || p.num}`); setTimeout(() => setSavedMsg(""), 2500);
      return resetLineupModes();
    }
    if (lineupMode === "renum") { setRenumTarget(p); setNewNum(String(p.num)); return; }
    return where === "pitch" ? tapPitch(p) : tapBench(p);
  };
  const renumValid = (() => {
    const n = parseInt(newNum, 10);
    return renumTarget && n >= 1 && n <= 99 && !roster.some((p) => p.num === n && p.num !== renumTarget.num);
  })();
  const applyRenum = () => {
    if (!renumValid) return;
    setRaw((r) => renumRoster(r, renumTarget.num, parseInt(newNum, 10)));
    setSavedMsg(`${renumTarget.name || renumTarget.num} now wears ${newNum}`); setTimeout(() => setSavedMsg(""), 2500);
    resetLineupModes();
  };
  // live entry: build the notation line; the minute is always the wall clock now
  // (wrong by a beat? fix it in the notation after — same as everything else)
  // build a notation line for an event; live entry passes the wall clock,
  // the insert forms pass their stepper minute and their own team toggle
  const buildEventLine = (ev, team, player, min) => {
    const who = team === "them" ? "T" : player && player !== "unknown" ? player.name : (myTeam.trim() || "My Team");
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
      case "corner": return team === "them" ? `${min} T corner` : `${min} corner`;
      case "ht": return `${min} HT`;
      case "ft": return `${min} FT`;
      case "half": return `${new Date().getHours()}:${pad2(parseInt(min, 10) % 60)}`;
      default: return "";
    }
  };
  const liveLine = (ev, player, team = lvTeam) => buildEventLine(ev, team, player, String(new Date().getMinutes()));
  const whoGrid = (onPick) => (
    <>
      {liveRows.map((row, ri) => (
        <div key={ri} className="mt-frow">
          {row.map((p) => <button key={p.num + p.name} className="mt-big sm" onClick={() => onPick(p)}>{p.num ? `${p.num}. ` : ""}{p.name}</button>)}
        </div>
      ))}
      {subs.length > 0 && (
        <div className="mt-frow" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          {subs.map((p) => <button key={p.num + p.name} className="mt-big sm" onClick={() => onPick(p)}>{p.num ? `${p.num}. ` : ""}{p.name}</button>)}
        </div>
      )}
      <div className="mt-frow"><button className="mt-big sm" onClick={() => onPick("unknown")}>Unknown</button></div>
    </>
  );
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
  const enterNew = () => { setMenuOpen(false); setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setNw({ stage: "date", date: toLocalInput(new Date()), team: "", label: "", sport: null, homeAway: "away", colors: null, oppName: "" }); };
  const enterShare = () => {
    setMenuOpen(false);
    if (!curId) { setSavedMsg("Save the match first, then share"); setTimeout(() => setSavedMsg(""), 2500); return; }
    setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setNw(null);
    setShare(true);
  };
  // build + save the wizard's match directly — recordPayload() would read pre-update state.
  // Sport precedence: your team's pick wins; the opponent's only fills a gap; else keep current.
  const finishNew = async (opp, oppColors, oppSport) => {
    if (creatingRef.current) return; // double-tap guard — one tap, one match
    creatingRef.current = true;
    try {
      const team = nw.team.trim() || "My Team";
      const label = nw.label.trim() || team;
      const newRaw = `${label} ${nw.homeAway === "home" ? "v" : "@"} ${opp.trim()}\n1 \n`;
      const newSport = nw.sport || oppSport || sport || "";
      const cu = nw.colors ? nw.colors[0] : colorUs, cu2 = nw.colors ? nw.colors[1] : colorUs2;
      const ct = oppColors ? oppColors[0] : colorThem, ct2 = oppColors ? oppColors[1] : colorThem2;
      const mode = SPORTS[newSport] ? SPORTS[newSport].mode : parseMatch(newRaw, { myTeam: team }).mode;
      setRaw(newRaw); setMyTeam(team); setSport(newSport); setAutoMode(true); setScoringMode(mode);
      setColorUs(cu); setColorUs2(cu2); setColorThem(ct); setColorThem2(ct2);
      setMatchDate(nw.date); setNw(null); setTab("game");
      const id = mkId();
      const ok = await store.set(id, { raw: newRaw, matchDate: nw.date, date: nw.date, myTeam: team, scoringMode: mode, autoMode: true, sport: newSport || undefined, colorUs: cu, colorUs2: cu2, colorThem: ct, colorThem2: ct2, savedAt: Date.now() });
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
    setBlkEdit({ idx: b.idx, minute: min, rest: min == null ? b.text : b.text.replace(/^\s*\d{1,2}\b\s*/, ""), confirmDel: false });
  };
  const blkLineOf = (be) => (be.minute == null ? be.rest.trim() : `${be.minute} ${be.rest.trim()}`);
  const blkOk = () => {
    const line = blkLineOf(blkEdit);
    if (!line) return;
    setRaw((r) => replaceEventLine(r, blkEdit.idx, line));
    setBlkEdit(null);
  };
  const blkDelete = () => {
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
  const openInsert = (b) => { setBlkEdit(null); setLineupEdit(null); setBlkIns({ afterIdx: b.idx, type: null, minute: anchorMinute(b.text), team: "us", ev: null, player: undefined, on: null, off: null, cardKind: "yellow", noteText: "", noteMin: false }); };
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
  const insLine = () => {
    const i = blkIns;
    if (!i || !i.type) return "";
    if (i.type === "score") return i.ev && (i.team === "them" || i.player !== undefined) ? buildEventLine(i.ev, i.team, i.player, i.minute) : "";
    if (i.type === "card") return i.team === "them" || i.player !== undefined ? buildEventLine(i.cardKind, i.team, i.player, i.minute) : "";
    if (i.type === "corner") return buildEventLine("corner", i.team, null, i.minute);
    if (i.type === "sub") return i.on && i.off ? `${i.minute} ${i.on.name} for ${i.off.name}` : "";
    if (i.type === "note") return i.noteText.trim() ? (i.noteMin ? `${i.minute} ${i.noteText.trim()}` : i.noteText.trim()) : "";
    return "";
  };
  const insOk = () => {
    const line = insLine();
    if (!line) return;
    setRaw((r) => insertEventLine(r, blkIns.afterIdx, line));
    setBlkIns(null);
    setSavedMsg(`Added "${line}"`); setTimeout(() => setSavedMsg(""), 1800);
  };
  // a minuted free-text note with none of the parser's note keywords would read as a score
  const notePhantom = blkIns && blkIns.type === "note" && blkIns.noteMin && blkIns.noteText.trim()
    && !/\b(miss(ed|es)?|wide|saved|blocked|short|water|corner|yellow|red|for)\b/i.test(blkIns.noteText);

  // players involved in substitutions (by roster number), for lineup styling
  const subbedOn = new Set(notes.filter((n) => n.type === "sub" && n.onNum != null).map((n) => n.onNum));
  const subbedOff = new Set(notes.filter((n) => n.type === "sub" && n.offNum != null).map((n) => n.offNum));
  const subArrows = (num) => (subbedOn.has(num) || subbedOff.has(num)) && (
    <span style={{ fontSize: 10, letterSpacing: 1 }}>
      {subbedOn.has(num) && <span style={{ color: "#2ecc71" }}>▲</span>}
      {subbedOff.has(num) && <span style={{ color: "#ff6e63" }}>▼</span>}
    </span>
  );
  // card / own-goal markers for the lineup
  const playerMarks = (num) => {
    const cards = notes.filter((n) => n.type === "card" && n.num === num);
    const og = scoring.some((s) => s.og && s.ogNum === num);
    if (!cards.length && !og) return null;
    return (
      <span style={{ marginLeft: 2, whiteSpace: "nowrap" }}>
        {cards.map((c, i) => <span key={i} style={{ display: "inline-block", width: 7, height: 10, borderRadius: 1.5, background: c.card === "red" ? "#e74c3c" : "#f1c40f", border: "1px solid rgba(0,0,0,.25)", marginLeft: 2, verticalAlign: "-1px" }} />)}
        {og && <span style={{ color: "#ff6e63", fontSize: 9, fontWeight: 600, marginLeft: 2 }}>OG</span>}
      </span>
    );
  };
  // what a player scored, for the lineup: "1-2" in GAA, a ball per goal in soccer
  const scoreFor = (num) => {
    const sc = scorers.find((s) => s.side === "us" && s.num === num && (s.g || s.p));
    if (!sc) return null;
    return <span className="pts">{effMode === "goals" ? "⚽".repeat(sc.g) : fmtScore(sc.g, sc.p, effMode)}</span>;
  };
  const chunk = (arr, n) => arr.reduce((a, _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);
  const formationRows = parsed.formationRows && parsed.formationRows.length
    ? parsed.formationRows
    : chunk(starters.map((p) => p.num), 3);
  // live entry: "Who?" buttons laid out like the lineup pitch, plus the sport-relevant events
  const liveRows = formationRows.map((row) => row.map((n) => roster.find((p) => p.num === n)).filter(Boolean)).filter((r) => r.length);
  const liveEvents = LIVE_EVENTS.filter((ev) => effMode !== "goals" || !ev.gaa)
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
    if (modal && modal.kind === "share") { setModal(null); return; }
    const h1 = parsed.series.filter((p) => p.half === 1 && p.usScore);
    const ht = h1.length ? `${h1[h1.length - 1].usScore} – ${h1[h1.length - 1].themScore}` : `${fmtScore(0, 0, effMode)} – ${fmtScore(0, 0, effMode)}`;
    const model = {
      grade: header.label || "", sport: sportLabel || "", homeAway: header.homeAway,
      usName, themName, dateStr: matchDate ? fmtDate(matchDate) : "",
      totals, result, effMode, ht,
      leadChanges: parsed.leadChanges, timesLevel: parsed.timesLevel, maxLead: parsed.maxLead, maxLeadSide: parsed.maxLeadSide,
      series: parsed.series, goalDots: parsed.goalDots, htLine: parsed.htLine, halfMarks,
      usScorers, formationRows, starters, subs, missing, timeline,
      colorUs, colorUs2, colorThem, colorThem2,
    };
    const safe = (s) => (s || "match").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const filename = `${safe(header.label)}-${safe(themName)}.png`;
    const title = `${usName} ${totals.us.str} – ${totals.them.str} ${themName}`;
    try {
      const { svg, width, height } = buildInfographicSVG(model);
      const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      setModal({ kind: "share", img: svgUrl, svg, filename, title, blob: null, png: false });
      svgToPng(svg, width, height)
        .then(({ blob, dataUrl }) => setModal((mm) => (mm && mm.kind === "share") ? { ...mm, blob, img: dataUrl, png: true } : mm))
        .catch(() => setModal((mm) => (mm && mm.kind === "share") ? { ...mm, png: false, pngFailed: true } : mm));
    } catch (e) {
      setModal({ kind: "share", error: true });
    }
  };
  const nativeShare = () => {
    if (!modal || !modal.blob) return;
    const file = new File([modal.blob], modal.filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: modal.title }).catch(() => {});
    else downloadBlob(modal.blob, modal.filename);
  };
  const downloadSvg = () => {
    if (!modal || !modal.svg) return;
    downloadBlob(new Blob([modal.svg], { type: "image/svg+xml" }), (modal.filename || "match.png").replace(/\.png$/, ".svg"));
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

  const renderTimeline = () => (
    <div className="mt-tl">
      {[1, 2].map((h) => {
        const items = timeline.filter((t) => t.half === h);
        if (!items.length) return null;
        const mk = halfMarks.find((m) => m.half === h && m.clock);
        const addedMk = halfMarks.find((m) => m.half === h && m.marker && m.added > 0);
        return (
          <div key={h}>
            <div className="mt-half">{h === 1 ? "First half" : "Second half"}{mk ? ` · ${mk.clock}` : ""}</div>
            {items.map((it, i) => {
              if (it.kind === "score") {
                const descriptive = !it.sure && it.scorer && it.scorer !== "Opposition" && it.scorer !== "Unknown";
                const evName = it.scorer === "Opposition" ? themName : it.scorer;
                return (
                  <div key={i} className={`mt-ev ${it.side} ${it.type}`} style={{ "--dot": it.side === "us" ? colorUs : colorThem, "--ring": it.side === "us" ? colorUs2 : colorThem2 }}>
                    <span className="m">{it.mmin || it.minute}'</span>
                    <span>
                      {descriptive
                        ? <>{it.type === "goal" && <span className="mt-pill goal" style={{ marginLeft: 0, marginRight: 6 }}>goal</span>}<span style={{ color: "#6f7d72" }}>{it.desc || it.scorer}</span></>
                        : <>{evName}{it.type === "goal" ? <span className="mt-pill goal">goal</span> : it.fromFree ? <span className="mt-pill free">free</span> : it.setPiece ? <span className="mt-pill free">'{it.setPiece}</span> : ""}</>}
                    </span>
                    <span className="sc">{it.usScore} – {it.themScore}</span>
                  </div>
                );
              }
              if (it.kind === "card") {
                const whoTxt = it.side === "them" && (!it.who || /^t\d*$/i.test(it.who)) ? themName : (it.who || usName);
                return <div key={i} className={"mt-ev note" + (it.side === "them" ? " them" : "")}>
                  <span className="m">{it.minute != null ? `${it.mmin || it.minute}'` : "✎"}</span>
                  <span><span style={{ display: "inline-block", width: 9, height: 12, borderRadius: 2, background: it.card === "red" ? "#e74c3c" : "#f1c40f", border: "1px solid rgba(0,0,0,.25)", verticalAlign: "-2px", marginRight: 6 }} />{whoTxt}</span>
                </div>;
              }
              if (it.kind === "corner") {
                const nth = timeline.filter((x) => x.kind === "corner" && x.side === it.side && x.seq <= it.seq).length;
                const ord = nth === 1 ? "1st" : nth === 2 ? "2nd" : nth === 3 ? "3rd" : `${nth}th`;
                return <div key={i} className={"mt-ev note" + (it.side === "them" ? " them" : "")}>
                  <span className="m">{it.minute != null ? `${it.mmin || it.minute}'` : "✎"}</span>
                  <span style={{ color: "#6f7d72" }}>⚑ {ord} corner — {it.side === "them" ? themName : usName}</span>
                </div>;
              }
              if (it.kind === "sub") return <div key={i} className="mt-ev subev"><span className="m">{it.minute != null ? `${it.mmin || it.minute}'` : ""}</span><span><span style={{ color: "#1f7a4d", fontWeight: 600 }}>▲ {it.on}</span>&ensp;<span style={{ color: "#c0392b", fontWeight: 600 }}>▼ {it.off}</span></span></div>;
              return <div key={i} className="mt-ev note"><span className="m">{it.minute != null ? `${it.mmin || it.minute}'` : "✎"}</span><span style={{ color: "#6f7d72" }}>{it.text}</span></div>;
            })}
            {addedMk && <div className="mt-ev mid"><span className="chip">⏱ +{addedMk.added} added</span></div>}
          </div>
        );
      })}
      {timeline.length === 0 && <p style={{ color: "#6f7d72" }}>No events parsed.</p>}
    </div>
  );

  const view = nw ? "new" : tab; // new-match wizard replaces the tab body; game mode is the "game" tab; Share is an inline panel

  return (
    <div className="mt-root">

      {/* persistent header */}
      {!nw && (
        <AppHeader
          email={userEmail}
          showNew
          showTeams
          backHref="/"
          onNew={() => router.push("/m/new")}
          onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }}
        >
          <button className="mt-btn ah-icn" aria-label="Share" title="Share" onClick={enterShare}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            </svg>
          </button>
          <button className="mt-btn" aria-label="Link teams" title="Link teams" onClick={() => { setShare(false); setLink((o) => !o); }}>🤝</button>
          <button className="mt-btn" aria-label="Resync" title="Resync from server" onClick={doResync}>⟳</button>
          <button className={"mt-btn" + (confirmDel ? " danger" : "")} aria-label="Delete match" title={confirmDel ? "Tap again to delete" : "Delete match"} onClick={() => {
            if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); return; }
            setConfirmDel(false); doDelete();
          }}>🗑</button>
        </AppHeader>
      )}
      {savedMsg && <div className="mt-toast">{savedMsg}</div>}

      {!nw && modal && (
        <div className="mt-panel">
          {modal.kind === "share" && (
            <>
              <div className="mt-panel-head"><h3>Match image</h3><button className="mt-add alt" onClick={() => setModal(null)}>Close</button></div>
              {modal.error && <p className="hint">Couldn't build the image — try again.</p>}
              {modal.img && <img className="shot" src={modal.img} alt="match infographic" />}
              {modal.img && <p className="hint"><b>Press and hold the image</b> to save it to Photos or share it{modal.png ? "." : " (preparing a saveable version…)"}</p>}
              <div className="row">
                {modal.png && <button className="mt-add" onClick={nativeShare}>Save / Share</button>}
                {modal.img && !modal.png && <button className="mt-add alt" onClick={downloadSvg}>Download</button>}
              </div>
              {modal.pngFailed && <p className="hint">A PNG couldn't be made in this browser — long-press the image above to save it, or use Download.</p>}
            </>
          )}
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

      {!nw && link && curId && (
        <LinkTeams
          userId={userEmailId}
          record={recordPayload()}
          currentHomeAway={header.homeAway === "home" ? "home" : "away"}
          onClose={() => setLink(false)}
          onApply={(p) => {
            setRaw(p.raw); setMyTeam(p.myTeam);
            setColorUs(p.colorUs); setColorUs2(p.colorUs2); setColorThem(p.colorThem); setColorThem2(p.colorThem2);
            setHomeTeamId(p.homeTeamId); setAwayTeamId(p.awayTeamId); setOppRoster(p.oppRoster);
            setSavedMsg("Teams linked ✓"); setTimeout(() => setSavedMsg(""), 2000);
          }}
        />
      )}

      {/* settings */}
      {!nw && (
      <div className="mt-settings">
        <label>Date <input type="date" value={(matchDate || "").slice(0, 10)} onChange={(e) => e.target.value && setMatchDate(`${e.target.value}T${(matchDate || "").slice(11, 16) || "12:00"}`)} />
          <input type="time" value={(matchDate || "").slice(11, 16)} onChange={(e) => e.target.value && setMatchDate(`${(matchDate || "").slice(0, 10)}T${e.target.value}`)} /></label>
        <label>My team <input type="text" value={myTeam} onChange={(e) => onMyTeamChange(e.target.value)} /> <button className="mt-swatch" title="Primary" style={{ background: colorUs }} onClick={() => setColorPick(colorPick === "us" ? null : "us")} /><button className="mt-swatch" title="Secondary" style={{ background: colorUs2 }} onClick={() => setColorPick(colorPick === "us2" ? null : "us2")} /></label>
        <label>
          <select className="mt-sel" style={{ color: "#222", background: "#fffdf6", borderColor: "#d8cfb8" }}
            value={header.homeAway === "home" ? "home" : "away"} onChange={(e) => setHeaderField("homeAway", e.target.value)}>
            <option value="away">Away @</option>
            <option value="home">Home v</option>
          </select>
        </label>
        <button className="mt-btn" title="Swap home/away" onClick={() => {
          const p = swapHomeAway(recordPayload());
          setRaw(p.raw); setHomeTeamId(p.homeTeamId); setAwayTeamId(p.awayTeamId);
        }}>⇄ Swap</button>
        <label>Opponent <input type="text" value={header.opposition || ""} placeholder="Opponent"
          onChange={(e) => setHeaderField("opposition", e.target.value)} /> <button className="mt-swatch" title="Primary" style={{ background: colorThem }} onClick={() => setColorPick(colorPick === "them" ? null : "them")} /><button className="mt-swatch" title="Secondary" style={{ background: colorThem2 }} onClick={() => setColorPick(colorPick === "them2" ? null : "them2")} /></label>
        <label>Sport
          <select className="mt-sel" style={{ color: "#222", background: "#fffdf6", borderColor: "#d8cfb8" }}
            value={sport || (autoMode ? "auto" : scoringMode)}
            onChange={(e) => { const v = e.target.value; if (v === "auto") { setSport(""); setAutoMode(true); } else if (SPORTS[v]) { setSport(v); setAutoMode(true); } }}>
            <option value="auto">Auto: {sportLabel || (effMode === "gaa" ? "GAA scoring" : "goals only")}</option>
            {Object.entries(SPORTS).map(([k, s]) => <option key={k} value={k}>{s.emoji} {s.label}</option>)}
            {/* legacy explicit scoring choice, shown until a sport is picked */}
            {!sport && !autoMode && <option value={scoringMode}>{scoringMode === "gaa" ? "GAA (goals & points)" : "Goals only (soccer)"}</option>}
          </select>
        </label>
      </div>
      )}

      {!nw && colorPick && (() => {
        const map = {
          us: [colorUs, setColorUs, `${usName} — primary`], us2: [colorUs2, setColorUs2, `${usName} — secondary`],
          them: [colorThem, setColorThem, `${themName} — primary`], them2: [colorThem2, setColorThem2, `${themName} — secondary`],
        };
        const [val, setVal, label] = map[colorPick];
        const sw = (c) => (
          <button key={c} className={"mt-swatch big" + (c === (val || "").toLowerCase() ? " on" : "")}
            style={{ background: c }} onClick={() => setVal(c)} title={c} />
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

      {/* score header (shared with the public page) */}
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
            dateStr={matchDate ? fmtDate(matchDate) : ""}
            homeTotal={usIsHome ? usTotal : themTotal}
            awayTotal={usIsHome ? themTotal : usTotal}
            phase={phase}
          />
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

      <div className="mt-body">
        {view === "new" && (
          <div className="mt-game">
            <div className="mt-row" style={{ marginBottom: 12 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>New match{nw.stage === "us" ? " — your team" : nw.stage === "opp" ? " — opposition" : ""}</span>
              <button className="mt-add alt" onClick={() => router.push("/")}>✕ Cancel</button>
            </div>

            {/* stage 1 — when? */}
            {nw.stage === "date" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>When? — defaults to now</p>
                <div className="mt-row nw-date">
                  <input type="date" value={nw.date.slice(0, 10)} onChange={(e) => e.target.value && setNw({ ...nw, date: `${e.target.value}T${nw.date.slice(11, 16)}` })} />
                  <input type="time" value={nw.date.slice(11, 16)} onChange={(e) => e.target.value && setNw({ ...nw, date: `${nw.date.slice(0, 10)}T${e.target.value}` })} />
                </div>
                <div className="mt-grid" style={{ marginTop: 12 }}>
                  <button className="mt-big gm-team" onClick={() => setNw({ ...nw, stage: "us" })}>Next →</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 14 }} onClick={doNew}>Skip — blank match</button>
              </>
            )}

            {/* stage 2 — your team? */}
            {nw.stage === "us" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Your team? — picking applies name, colours and sport</p>
                <div className="mt-grid">
                  {prevTeams.us.map((t) => (
                    <button key={t.team + "|" + t.label} className="mt-big nw-team" style={{ background: t.colorUs || "#f5c518", color: contrastOn(t.colorUs || "#f5c518"), borderColor: t.colorUs2 || "var(--line)" }}
                      onClick={() => setNw({ ...nw, stage: "opp", team: t.team, label: t.label || t.team, sport: t.sport || null, colors: [t.colorUs || colorUs, t.colorUs2 || colorUs2] })}>
                      {SPORTS[t.sport] ? SPORTS[t.sport].emoji + " " : ""}{t.team}{t.label && squash(t.label) !== squash(t.team) ? <span className="sub"> · {t.label}</span> : null}
                    </button>
                  ))}
                </div>
                <p className="mt-note" style={{ margin: "12px 0 4px" }}>…or a new team</p>
                <div className="mt-row">
                  <input className="nw-in" placeholder="team name" value={nw.team} onChange={(e) => setNw({ ...nw, team: e.target.value })} />
                  <input className="nw-in" placeholder="grade/label (optional)" value={nw.label} onChange={(e) => setNw({ ...nw, label: e.target.value })} />
                  <button className="mt-add" disabled={!nw.team.trim()} onClick={() => setNw({ ...nw, stage: "opp", sport: null, colors: null })}>Next →</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setNw({ ...nw, stage: "date" })}>← Back</button>
              </>
            )}

            {/* stage 3 — against? (picking an opponent finishes the wizard) */}
            {nw.stage === "opp" && (
              <>
                <div className="mt-grid" style={{ marginBottom: 10 }}>
                  <button className={"mt-big" + (nw.homeAway === "home" ? " on" : " off")} onClick={() => setNw({ ...nw, homeAway: "home" })}>Home v</button>
                  <button className={"mt-big" + (nw.homeAway === "away" ? " on" : " off")} onClick={() => setNw({ ...nw, homeAway: "away" })}>Away @</button>
                </div>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Against? — picking applies their colours</p>
                <div className="mt-grid">
                  {prevTeams.opps.map((o) => (
                    <button key={o.name} className="mt-big nw-team" style={{ background: o.colorThem || "#c0392b", color: contrastOn(o.colorThem || "#c0392b"), borderColor: o.colorThem2 || "var(--line)" }}
                      onClick={() => finishNew(o.name, [o.colorThem || colorThem, o.colorThem2 || colorThem2], o.sport || null)}>
                      {o.name}
                    </button>
                  ))}
                </div>
                <p className="mt-note" style={{ margin: "12px 0 4px" }}>…or a new opponent</p>
                <div className="mt-row">
                  <input className="nw-in" placeholder="opponent" value={nw.oppName} onChange={(e) => setNw({ ...nw, oppName: e.target.value })} />
                  <button className="mt-add" disabled={!nw.oppName.trim()} onClick={() => finishNew(nw.oppName, null, null)}>Create →</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setNw({ ...nw, stage: "us" })}>← Back</button>
              </>
            )}
          </div>
        )}
        {view === "game" && (
          <div className="mt-game">
            <div className="mt-row" style={{ marginBottom: 12 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>
                {phase === "pre" ? "Before throw-in" : phase === "ht" ? "Half time" : phase === "over" ? "Full time" : `Half ${halfMarks.filter((m) => !m.marker).length} — in play`}
              </span>
            </div>

            {/* full time: only Undo + a pointer to Advanced */}
            {phase === "over" && (
              <p className="mt-note" style={{ marginTop: 0 }}>
                <b>Full time — match closed.</b> Need to change something? Edit it in the <b>Advanced</b> tab. (Or undo the FT line below to keep adding.)
              </p>
            )}

            {/* stage 1 — who? (+ phase-gated match controls) */}
            {phase !== "over" && gmStage.stage === "team" && (
              <>
                <div className="mt-grid">
                  <button className="mt-big gm-team" disabled={phase !== "play"} style={{ background: colorUs, color: contrastOn(colorUs) }} onClick={() => setGmStage({ stage: "event", team: "us" })}>{usName}</button>
                  <button className="mt-big gm-team" disabled={phase !== "play"} style={{ background: colorThem, color: contrastOn(colorThem) }} onClick={() => setGmStage({ stage: "event", team: "them" })}>{themName}</button>
                </div>
                {(phase === "pre" || phase === "ht") && (
                  <div className="mt-grid" style={{ marginTop: 10 }}>
                    <button className="mt-big gm-team" onClick={() => addLive("half", null)}>Start half</button>
                  </div>
                )}
                {phase === "play" && (
                  <div className="mt-grid" style={{ marginTop: 10 }}>
                    <button className="mt-big" onClick={() => setGmStage({ stage: "subOff" })}>Sub</button>
                    <button className="mt-big" onClick={() => addLive("ht", null)}>HT</button>
                    <button className="mt-big" onClick={() => addLive("ft", null)}>FT</button>
                  </div>
                )}
                <p className="mt-note" style={{ marginTop: 10, marginBottom: 0 }}>
                  {phase === "pre" ? "Tap Start half at throw-in to open scoring." : phase === "ht" ? "Half time — Start half opens the second half." : phase === "over" ? "Full time — match closed. Undo the FT line to keep adding." : "Tap the team the next event belongs to."}
                </p>
              </>
            )}

            {/* stage 2 — what happened? */}
            {phase !== "over" && gmStage.stage === "event" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.team === "us" ? usName : themName} — what happened?</p>
                <div className="mt-grid">
                  {liveEvents.filter((ev) => !["half", "ht", "ft"].includes(ev.key)).map((ev) => (
                    <button key={ev.key} className="mt-big ev" onClick={() => {
                      // our player events wait for a "Who?" tap; everything else lands straight in the notation
                      if (gmStage.team === "us" && LIVE_PLAYER_EVENTS.includes(ev.key)) setGmStage({ ...gmStage, stage: "who", ev: ev.key });
                      else { addLive(ev.key, null, gmStage.team); setGmStage({ stage: "team" }); }
                    }}>{ev.label}</button>
                  ))}
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team" })}>← Back</button>
              </>
            )}

            {/* stage 3 — which player? */}
            {phase !== "over" && gmStage.stage === "who" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{liveEvents.find((ev) => ev.key === gmStage.ev).label} — who?</p>
                {whoGrid((p) => { addLive(gmStage.ev, p, gmStage.team); setGmStage({ stage: "team" }); })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "event", team: gmStage.team })}>← Back</button>
              </>
            )}

            {/* sub flow — off then on, same line shape as the Lineup tab */}
            {phase !== "over" && gmStage.stage === "subOff" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Substitution — who goes off?</p>
                {whoGrid((p) => p !== "unknown" && setGmStage({ stage: "subOn", off: p }))}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team" })}>← Back</button>
              </>
            )}
            {phase !== "over" && gmStage.stage === "subOn" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.off.name} off — who comes on?</p>
                {whoGrid((p) => { if (p === "unknown") return; completeSub(p.name, gmStage.off.name); setGmStage({ stage: "team" }); })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "subOff" })}>← Back</button>
              </>
            )}

            {/* pinned bottom: last entry + undo */}
            <div className="gm-undo">
              <span className="t">{undoTarget ? `Last: ${undoTarget.text}` : "Nothing added yet"}</span>
              <button className="mt-add alt" disabled={!undoTarget} onClick={doUndo}>↩ Undo</button>
            </div>

            {/* running timeline beneath the controls */}
            <p className="mt-h" style={{ marginTop: 16 }}>Timeline</p>
            {renderTimeline()}
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
            <div className="mt-stats">
              <StatCard k="Half-time" v={(() => {
                let g = 0, p = 0, tg = 0, tp = 0;
                parsed.scoring.filter((s) => s.half === 1).forEach((s) => s.side === "us" ? (s.type === "goal" ? g++ : p++) : (s.type === "goal" ? tg++ : tp++));
                return `${fmtScore(g, p, effMode)} – ${fmtScore(tg, tp, effMode)}`;
              })()} />
              <StatCard k="Lead changes" v={parsed.leadChanges} />
              <StatCard k="Times level" v={parsed.timesLevel} />
              <StatCard k={`Biggest lead${parsed.maxLeadSide ? " · " + (parsed.maxLeadSide === "us" ? usName : themName) : ""}`} v={parsed.maxLead} />
              <StatCard k={usScorers.length > 1 && gpTotal(usScorers[1].g, usScorers[1].p, effMode) === gpTotal(usScorers[0].g, usScorers[0].p, effMode) ? "Top scorers" : "Top scorer"} v={(() => {
                if (!usScorers.length) return "—";
                const top = gpTotal(usScorers[0].g, usScorers[0].p, effMode);
                const ties = usScorers.filter((s) => gpTotal(s.g, s.p, effMode) === top);
                const fmt = (s) => `${s.name.split(" ")[0]} ${effMode === "goals" ? s.g : `${s.g}-${s.p}`}`;
                return ties.slice(0, 3).map(fmt).join(" · ") + (ties.length > 3 ? ` +${ties.length - 3}` : "");
              })()} />
            </div>

            <p className="mt-h">Score progression</p>
            <div style={{ width: "100%" }}>
              <ScoreChart series={series} goalDots={goalDots} htLine={htLine} colorUs={colorUs === "#f5c518" ? "#d9af00" : colorUs} colorThem={colorThem} />
            </div>
            <p className="mt-note">● large dots mark goals. Step lines show the running total ({effMode === "gaa" ? "goals ×3 + points" : "goals"}).</p>

            <p className="mt-h" style={{ marginTop: 18 }}>Top scorers — {usName}</p>
            <table className="mt-tbl">
              <thead><tr><th>Player</th><th>Goals</th><th>Points</th><th>Frees</th><th>Total</th></tr></thead>
              <tbody>
                {usScorers.map((s, i) => (
                  <tr key={i}>
                    <td>{s.num ? <span className="mt-num">{s.num}</span> : null}{s.name}</td>
                    <td className="n">{s.g}</td><td className="n">{s.p}</td>
                    <td>{s.frees || "–"}</td>
                    <td className="n">{effMode === "goals" ? s.g : `${s.g}-${s.p}`}</td>
                  </tr>
                ))}
                {usScorers.length === 0 && <tr><td colSpan={5} style={{ color: "#6f7d72" }}>No scores parsed yet.</td></tr>}
              </tbody>
            </table>

            {themScorers.length > 0 && (
              <>
                <p className="mt-h" style={{ marginTop: 18 }}>{themName} scorers</p>
                <table className="mt-tbl">
                  <thead><tr><th>Player</th><th>Goals</th><th>Points</th><th>Frees</th><th>Total</th></tr></thead>
                  <tbody>
                    {themScorers.map((s, i) => (
                      <tr className="them" key={i}><td>{s.name === "Opposition" ? themName : s.name}</td><td className="n">{s.g}</td><td className="n">{s.p}</td><td>{s.frees || "–"}</td><td className="n">{effMode === "goals" ? s.g : `${s.g}-${s.p}`}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="mt-h" style={{ marginTop: 18 }}>Timeline</p>
            {renderTimeline()}
          </>
        )}

        {view === "lineup" && (
          <>
            <div className="mt-pitch" style={{ background: `linear-gradient(${colorUs2}22, #0c3b2a 60%)` }}>
              {formationRows.map((row, ri) => (
                <div className="mt-line" key={ri}>
                  {row.map((n) => {
                    const p = starters.find((x) => x.num === n);
                    return (
                      <div className="mt-jersey" key={n} style={{ cursor: "pointer" }} onClick={() => tapPlayer({ num: n, name: p ? p.name : String(n) }, "pitch")}>
                        <div className="j" style={{ background: colorUs, color: contrastOn(colorUs), borderBottom: `4px solid ${colorUs2}`, outline: (subPick && subPick.role === "off" && subPick.num === n) || (swapFirst && swapFirst.num === n) || (renumTarget && renumTarget.num === n) ? "2px solid #f5c518" : "none", outlineOffset: 2 }}>{n}</div>
                        <div className="nm">{p ? p.name : ""} {subArrows(n)}{playerMarks(n)}</div>
                        {scoreFor(n)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {renumTarget ? (
              <div className="mt-live" style={{ marginTop: 10, marginBottom: 0 }}>
                <div className="mt-row">
                  <span className="mt-h" style={{ margin: 0 }}>New number for {renumTarget.num}. {renumTarget.name}</span>
                  <input style={{ width: 56 }} value={newNum} onChange={(e) => setNewNum(e.target.value.replace(/\D/g, ""))} />
                  {!renumValid && newNum && <span className="mt-note" style={{ margin: 0 }}>taken</span>}
                  <button className="mt-add" disabled={!renumValid} onClick={applyRenum}>OK</button>
                  <button className="mt-add alt" onClick={resetLineupModes}>Cancel</button>
                </div>
              </div>
            ) : lineupMode === "swap" ? (
              <div className="mt-live" style={{ marginTop: 10, marginBottom: 0 }}>
                <div className="mt-row">
                  <span className="mt-h" style={{ margin: 0 }}>
                    {swapFirst ? <>Swapping {swapFirst.num}. {swapFirst.name} — tap the second player</> : <>Reshuffle — tap two players to swap their spots (subs too)</>}
                  </span>
                  <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={resetLineupModes}>Cancel</button>
                </div>
              </div>
            ) : lineupMode === "renum" ? (
              <div className="mt-live" style={{ marginTop: 10, marginBottom: 0 }}>
                <div className="mt-row">
                  <span className="mt-h" style={{ margin: 0 }}>Change number — tap the player wearing a different number</span>
                  <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={resetLineupModes}>Cancel</button>
                </div>
              </div>
            ) : subPick ? (
              <div className="mt-live" style={{ marginTop: 10, marginBottom: 0 }}>
                <div className="mt-row">
                  <span className="mt-h" style={{ margin: 0 }}>
                    {subPick.role === "off" ? <>{subPick.num}. {subPick.name} off — now tap who comes on</> : <>{subPick.num}. {subPick.name} on — now tap who comes off</>}
                  </span>
                  <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={() => setSubPick(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-row" style={{ marginTop: 8 }}>
                <p className="mt-note" style={{ margin: 0, flex: 1, minWidth: 180 }}>Substitution: tap the player going off and the sub coming on (either order). The minute is filled in for you — edit it in Notation any time.</p>
                <button className="mt-add alt" onClick={() => { resetLineupModes(); setLineupMode("swap"); }}>Reshuffle</button>
                <button className="mt-add alt" onClick={() => { resetLineupModes(); setLineupMode("renum"); }}>Change number</button>
              </div>
            )}
            {subs.length > 0 && <><p className="mt-h" style={{ marginTop: 16 }}>Subs</p><div className="mt-bench">{subs.map((p) => {
              const picked = (subPick && subPick.role === "on" && subPick.num === p.num) || (swapFirst && swapFirst.num === p.num) || (renumTarget && renumTarget.num === p.num);
              const used = subbedOn.has(p.num) || subbedOff.has(p.num); // used subs wear the team colours
              const st = picked ? { background: "#f5c518", borderColor: "#f5c518" }
                : used ? { background: colorUs, color: contrastOn(colorUs), borderColor: colorUs2 } : {};
              return <span className="b" key={p.num} style={{ cursor: "pointer", ...st }} onClick={() => tapPlayer({ num: p.num, name: p.name }, "bench")}>{p.num}. {p.name} {subArrows(p.num)}{playerMarks(p.num)} {scoreFor(p.num)}</span>;
            })}</div></>}
            {missing.length > 0 && <><p className="mt-h" style={{ marginTop: 14 }}>Missing</p><div className="mt-bench">{missing.map((p) => <span className="b miss" key={p.num}>{p.num}. {p.name}</span>)}</div></>}
          </>
        )}

        {view === "advanced" && (
          <>
            <div className="mt-row" style={{ marginTop: 0, marginBottom: 6 }}>
              <p className="mt-h" style={{ margin: 0, flex: 1 }}>{notaView === "blocks" ? "Notation — tap a line to edit" : "Raw notation (edit freely — re-parses instantly)"}</p>
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
                {lineupEdit == null ? (
                  <button className="mt-blk lineup" onClick={openLineup}>
                    <span className="mt-bpill">Lineup</span>
                    <span className="t">{starters.length} starting · {subs.length} subs{missing.length ? ` · ${missing.length} missing` : ""}</span>
                    <span className="chev">tap to edit ▸</span>
                  </button>
                ) : (
                  <div className="mt-blk editing">
                    <p className="mt-h" style={{ margin: "0 0 6px" }}>Header & lineup</p>
                    <textarea className="mt-blkta" style={{ minHeight: 140, resize: "vertical" }} value={lineupEdit} onChange={(e) => setLineupEdit(e.target.value)} spellCheck={false} />
                    <div className="mt-blkrow">
                      <button className="mt-add" onClick={lineupOk}>OK</button>
                      <button className="mt-add alt" onClick={() => setLineupEdit(null)}>Cancel</button>
                    </div>
                  </div>
                )}
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
                          <button className="mt-add alt" onClick={() => openInsert(b)}>+ Insert after</button>
                          <button className={"mt-add danger" + (blkEdit.confirmDel ? " armed" : "")} onClick={blkDelete}>
                            {blkEdit.confirmDel ? "Tap again to delete" : "Delete"}
                          </button>
                        </div>
                        {blkEdit.minute != null && <p className="mt-note" style={{ margin: "6px 0 0" }}>OK re-parses — changing the minute moves the line to its spot in the half.</p>}
                      </div>
                    ) : (
                      <button className="mt-blk" onClick={() => openBlk(b)}>
                        {blkPill(b)}
                        <span className="t">{b.text}</span>
                      </button>
                    )}
                    {blkIns && blkIns.afterIdx === b.idx && (
                      <div className="mt-blk editing">
                        {!blkIns.type ? (
                          <>
                            <p className="mt-h" style={{ margin: "0 0 6px" }}>Insert after "{b.text.slice(0, 24)}…" — what kind?</p>
                            <div className="mt-grid">
                              {["score", "sub", "card", "corner", "note"].map((k) => (
                                <button key={k} className="mt-big sm" onClick={() => setBlkIns({ ...blkIns, type: k })}>{k[0].toUpperCase() + k.slice(1)}</button>
                              ))}
                            </div>
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns(null)}>Cancel</button></div>
                          </>
                        ) : (
                          <>
                            {(blkIns.type !== "note" || blkIns.noteMin) && <MinuteStep val={blkIns.minute} onChange={(m) => setBlkIns({ ...blkIns, minute: m })} />}
                            {(blkIns.type === "score" || blkIns.type === "card" || blkIns.type === "corner") && (
                              <div className="mt-grid" style={{ marginTop: 7 }}>
                                <button className={"mt-big sm" + (blkIns.team === "us" ? " on" : "")} style={{ background: colorUs, color: contrastOn(colorUs) }} onClick={() => setBlkIns({ ...blkIns, team: "us" })}>{usName}</button>
                                <button className={"mt-big sm" + (blkIns.team === "them" ? " on" : "")} style={{ background: colorThem, color: contrastOn(colorThem) }} onClick={() => setBlkIns({ ...blkIns, team: "them", player: undefined })}>{themName}</button>
                              </div>
                            )}
                            {blkIns.type === "score" && (
                              <div className="mt-grid" style={{ marginTop: 7 }}>
                                {liveEvents.filter((ev) => LIVE_PLAYER_EVENTS.includes(ev.key) && !["yellow", "red"].includes(ev.key)).map((ev) => (
                                  <button key={ev.key} className={"mt-big sm" + (blkIns.ev === ev.key ? " on" : "")} onClick={() => setBlkIns({ ...blkIns, ev: ev.key })}>{ev.label}</button>
                                ))}
                              </div>
                            )}
                            {blkIns.type === "card" && (
                              <div className="mt-grid" style={{ marginTop: 7 }}>
                                {["yellow", "red"].map((c) => <button key={c} className={"mt-big sm" + (blkIns.cardKind === c ? " on" : "")} onClick={() => setBlkIns({ ...blkIns, cardKind: c })}>{c}</button>)}
                              </div>
                            )}
                            {((blkIns.type === "score" && blkIns.ev) || blkIns.type === "card") && blkIns.team === "us" && (
                              <div style={{ marginTop: 7 }}>{whoGrid((p) => setBlkIns({ ...blkIns, player: p }))}</div>
                            )}
                            {blkIns.type === "sub" && (
                              <>
                                <p className="mt-note" style={{ margin: "7px 0 4px" }}>Who came on?{blkIns.on ? ` — ${blkIns.on.name}` : ""}</p>
                                {whoGrid((p) => p !== "unknown" && setBlkIns({ ...blkIns, on: p }))}
                                <p className="mt-note" style={{ margin: "7px 0 4px" }}>Who went off?{blkIns.off ? ` — ${blkIns.off.name}` : ""}</p>
                                {whoGrid((p) => p !== "unknown" && setBlkIns({ ...blkIns, off: p }))}
                              </>
                            )}
                            {blkIns.type === "note" && (
                              <>
                                <input className="mt-blkta" style={{ marginTop: 7 }} placeholder="note text" value={blkIns.noteText} onChange={(e) => setBlkIns({ ...blkIns, noteText: e.target.value })} />
                                <label className="mt-note" style={{ display: "block", marginTop: 6 }}>
                                  <input type="checkbox" checked={blkIns.noteMin} onChange={(e) => setBlkIns({ ...blkIns, noteMin: e.target.checked })} /> attach a minute
                                </label>
                                {notePhantom && <p className="mt-note" style={{ color: "#c0392b", margin: "4px 0 0" }}>Careful — a minuted line with no note keyword reads as a score. Leave the minute off for a plain note.</p>}
                              </>
                            )}
                            {insLine() && <p className="mt-note" style={{ margin: "8px 0 0", fontFamily: "ui-monospace,Menlo,monospace", border: "1px dashed var(--line)", borderRadius: 6, padding: "5px 8px" }}>{insLine()}</p>}
                            {insLine() && <p className="mt-note" style={{ margin: "4px 0 0" }}>OK places it by minute within the half — it may land further down than where you tapped.</p>}
                            <div className="mt-blkrow">
                              <button className="mt-add" disabled={!insLine()} onClick={insOk}>OK</button>
                              <button className="mt-add alt" onClick={() => setBlkIns(null)}>Cancel</button>
                            </div>
                          </>
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
      </div>
      {!nw && (
        <div className="mt-foot">Here We Go · {APP_VERSION}</div>
      )}
    </div>
  );
}
