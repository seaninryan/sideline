# Notation Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-notation textarea in the Notation tab with a tappable block list (one block per event line) supporting edit-with-re-sort, delete, and guided insert-after — per `docs/superpowers/specs/2026-06-06-notation-blocks-design.md`.

**Architecture:** Blocks are a *view* over `raw` — no block model is stored. `parseMatch` gains a `srcLine` (index into `raw.split("\n")`) on every scoring/note/halfMark entry so the UI can classify each raw line. Three pure helpers (`replaceEventLine`, `deleteEventLine`, `insertEventLine`) rewrite `raw`; placement re-uses `parseMatch` itself for half/elapsed semantics rather than reimplementing them.

**Tech Stack:** Single-file app `index.html` (React 18 + Babel standalone, no build). Tests via `node tools/run-tests.js` (pure functions extracted by `tools/parser-harness.js`). JSX syntax check via esbuild. Needs Node 18+ (`nvm use 18`).

**Read first:** `CLAUDE.md` (versioning + parser invariants), the spec, and these regions of `index.html`: `parseMatch` (~line 429–757), roster-edit helpers (~757–790), `MatchTracker` live-entry helpers (~1258–1345), Notation tab JSX (~1824–1878).

**Ground rules for every task:**
- The canonical SAMPLE expectations must never change: Racoons 2-6, Wildebeests 2-7 (Loss), Rick 2-4 (4 frees), Morty 0-1, leadChanges 1, timesLevel 3, maxLead 6 (us), 0 warnings.
- After any `index.html` edit, run the JSX check:
  ```bash
  sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
  npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null
  ```
- No real player/club names in code, tests, or sample data — stick to the Rick & Morty roster.
- `APP_VERSION` is bumped ONCE, in Task 9 (one deploy at the end), not per task.

---

### Task 1: `srcLine` on parser output

**Files:**
- Modify: `index.html` — `parseMatch` event loop (`for (const rawLine of eventLines)`, ~line 529)
- Test: `tools/run-tests.js`

- [ ] **Step 1: Write the failing test** — append to `tools/run-tests.js` before the `// ---- roster edits` section:

```js
// ---- srcLine: every event entry knows its raw line index ----
{
  const RAW = "U13 Hurling @ Tribesmen\n10. Morty | 11. Rick\nSubs\n17. Pencilvester\n18:21\n23 Rick free 0-1 0-0\n\n27 Jack miss pen\n31 Pencilvester for Morty\n35 Rick yellow card\n39 corner\n51 HT\n18:55\n58 T goal 0-1 1-1\nFT\n+2\nlegacy note no minute\n";
  const lines = RAW.split("\n");
  const p = parseMatch(RAW, {});
  const lineOf = (e) => lines[e.srcLine];
  t("srcLine on scoring", p.scoring.map(lineOf), ["23 Rick free 0-1 0-0", "58 T goal 0-1 1-1"]);
  t("srcLine on notes", p.notes.map((n) => [n.type, lineOf(n)]),
    [["note", "27 Jack miss pen"], ["sub", "31 Pencilvester for Morty"], ["card", "35 Rick yellow card"],
     ["corner", "39 corner"], ["note", "legacy note no minute"]]);
  t("srcLine on halfMarks", p.halfMarks.map((m) => [m.marker || "start", lineOf(m)]),
    [["start", "18:21"], ["HT", "51 HT"], ["start", "18:55"], ["FT", "FT"]]);
}
```

Note: the miss note's stored `text` is the line minus the minute, so compare via `lines[srcLine]`, not `n.text`.

- [ ] **Step 2: Run to verify it fails**

Run: `node tools/run-tests.js`
Expected: FAIL on the three new `srcLine` tests with `got [null,...]`/`undefined` (everything else passes).

- [ ] **Step 3: Implement** — in `index.html`, change the event loop head:

```js
  for (const rawLine of eventLines) {
    const line = rawLine.trim();
```
becomes
```js
  for (let evIdx = 0; evIdx < eventLines.length; evIdx++) {
    const rawLine = eventLines[evIdx];
    const srcLine = firstTimeIdx + evIdx; // index into raw.split("\n")
    const line = rawLine.trim();
```

Then add `srcLine,` to every push inside the loop — there are exactly **11** sites:
1. `halfMarks.push({ half, clock: ... })` (clock line)
2. `halfMarks.push({ half, marker: ..., minute, elapsed })` (minuted HT/FT)
3. `notes.push({ ... type: "card" ... })`
4. `notes.push({ ... type: "corner" ... })`
5. `notes.push({ ... type: "note", text: restFull.trim() })` (miss/stoppage)
6. `notes.push({ ... type: "sub" ... minute, elapsed ... })` (minuted sub)
7. `halfMarks.push({ half, startMin: minute })` (bare-minute half start)
8. `scoring.push({ seq: seq++, minute, ... })`
9. `halfMarks.push({ half: half || 1, marker: ..., minute: null, ... })` (bare HT/FT line)
10. `notes.push({ ... type: "sub" ... })` and `notes.push({ ... type: "note", text: line })` (the minute-less sub and the generic-note fallback in the trailing `else if`/`else` branches — 2 sites, 11 total)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tools/run-tests.js`
Expected: `all passed` (including the untouched SAMPLE block).

- [ ] **Step 5: JSX check** (command above) — expected: esbuild `Done`, no errors.

- [ ] **Step 6: Commit**

```bash
git add index.html tools/run-tests.js
git commit -m "parseMatch records srcLine on scoring, notes and halfMarks"
```

---

### Task 2: `eventLineMinute` + `deleteEventLine`

**Files:**
- Modify: `index.html` — add after `renumRoster` (~line 788, still inside the pure region the harness extracts, i.e. before `const CSS`)
- Modify: `tools/parser-harness.js` — export list
- Test: `tools/run-tests.js`

- [ ] **Step 1: Update the harness exports** — in `tools/parser-harness.js` change the return list to:

```js
module.exports = new Function(chunk + "\n; return { parseMatch, SAMPLE, isPlaceholderLabel, buildInfographicSVG, swapRosterNums, renumRoster, eventLineMinute, deleteEventLine, insertEventLine, replaceEventLine };")();
```

(Tasks 3–4 add the last two; until then `require` would throw, so add them all now and define stubs in Step 3.)

- [ ] **Step 2: Write the failing tests** — append to `tools/run-tests.js` (top: add `eventLineMinute, deleteEventLine, insertEventLine, replaceEventLine` to the destructured require):

```js
// ---- notation-block helpers ----
{
  t("eventLineMinute ordinary line", eventLineMinute("23 Rick free 0-1 0-0"), 23);
  t("eventLineMinute clock line", eventLineMinute("18:21"), null);
  t("eventLineMinute bare minute", eventLineMinute("38"), null);
  t("eventLineMinute bare HT", eventLineMinute("HT"), null);
  t("eventLineMinute minuted FT", eventLineMinute("51 FT"), null);
  t("eventLineMinute +N", eventLineMinute("+6"), null);
  t("eventLineMinute minute-less note", eventLineMinute("Rick for Morty"), null);
}
{
  const RAW = "a\nb\nc";
  t("deleteEventLine", deleteEventLine(RAW, 1), "a\nc");
  t("deleteEventLine out of range", deleteEventLine(RAW, 9), RAW);
}
```

- [ ] **Step 3: Implement** — in `index.html` after `renumRoster`:

```js
/* ---- event-line edits on the raw notation (notation blocks) ---- */
// Lines that are structure, not events: half-start clocks, bare minutes,
// HT/FT markers (bare or minuted, mirroring the parser's two regexes) and
// "+N" added-time overrides. They never re-sort.
const isStructureLine = (l) => {
  const s = (l || "").trim();
  return /^\d{1,2}:\d{2}$/.test(s) || /^\d{1,2}$/.test(s) || /^\+\d{1,2}(\s+added)?$/i.test(s)
    || /^(ht|ft|half ?time|full ?time)$/i.test(s) || /^\d{1,2}\b\s*(ht|ft|half ?time|full ?time|end)\b/i.test(s);
};
// the leading minute of an ordinary event line, else null
function eventLineMinute(line) {
  if (isStructureLine(line)) return null;
  const m = (line || "").match(/^\s*(\d{1,2})\b\s*\S/);
  return m ? parseInt(m[1], 10) : null;
}
function deleteEventLine(raw, idx) {
  const lines = raw.split("\n");
  if (idx < 0 || idx >= lines.length) return raw;
  lines.splice(idx, 1);
  return lines.join("\n");
}
function insertEventLine(raw, afterIdx, line) { return raw; } // Task 3
function replaceEventLine(raw, idx, newLine) { return raw; } // Task 4
```

- [ ] **Step 4: Run tests** — `node tools/run-tests.js` — expected: `all passed`.
- [ ] **Step 5: JSX check** — expected: clean.
- [ ] **Step 6: Commit**

```bash
git add index.html tools/parser-harness.js tools/run-tests.js
git commit -m "notation blocks: eventLineMinute + deleteEventLine helpers"
```

---

### Task 3: `insertEventLine` with by-minute placement

**Files:**
- Modify: `index.html` (replace the Task-2 stub)
- Test: `tools/run-tests.js`

Placement contract (from the spec): the **anchor block picks the half**; a line with a minute is placed within that half ordered by elapsed time (minute − half start, +60 wrap), equal minutes landing after the existing ones, never crossing the half's HT/FT marker; a minute-less line goes literally after the anchor.

- [ ] **Step 1: Write the failing tests** — append to `tools/run-tests.js`. Shared fixture (wall-clock-realistic minutes: first half starts 18:21, so elapsed of "23" is 2'; second half 18:55 wraps past the hour):

```js
// ---- insertEventLine: anchor picks the half, minute places the line ----
const BLK = [
  "U13 Hurling @ Tribesmen",            // 0
  "10. Morty | 11. Rick",               // 1
  "Subs",                               // 2
  "17. Pencilvester",                   // 3
  "18:21",                              // 4  half 1 start (startMin 21)
  "23 Rick free 0-1 0-0",               // 5  elapsed 2
  "27 Jack miss pen",                   // 6  elapsed 6 (note)
  "31 T 0-1 0-1",                       // 7  elapsed 10
  "51 HT",                              // 8
  "18:55",                              // 9  half 2 start (startMin 55)
  "58 T goal 0-1 1-1",                  // 10 elapsed 3
  "2 Rick 0-2 1-1",                     // 11 elapsed 7 (wrapped past the hour)
].join("\n");
{
  const at = (r, i) => r.split("\n")[i];
  const a = insertEventLine(BLK, 5, "29 Morty 0-2 0-1");
  t("insert places by minute", at(a, 7), "29 Morty 0-2 0-1"); // between the 27' and 31' lines
  const b = insertEventLine(BLK, 5, "27 Morty 0-2 0-1");
  t("insert tie lands after existing", at(b, 7), "27 Morty 0-2 0-1"); // after the existing 27' line
  const c = insertEventLine(BLK, 5, "49 Morty 0-2 0-1");
  t("insert never crosses HT", [at(c, 8), at(c, 9)], ["49 Morty 0-2 0-1", "51 HT"]);
  const d = insertEventLine(BLK, 10, "5 Morty 1-1 1-1"); // half 2, elapsed 10 — wraps
  t("insert wraps past the hour", at(d, 12), "5 Morty 1-1 1-1"); // after the 2' line
  const e = insertEventLine(BLK, 7, "switched Rick to midfield");
  t("insert minute-less goes right after anchor", at(e, 8), "switched Rick to midfield");
  const f = insertEventLine(BLK, 9, "57 Morty 1-1 1-1"); // anchor = half-2 clock line, elapsed 2
  t("insert after half-start block", at(f, 10), "57 Morty 1-1 1-1");
}
```

- [ ] **Step 2: Run to verify they fail** — `node tools/run-tests.js` — expected: the six new tests FAIL (stub returns `raw` unchanged).

- [ ] **Step 3: Implement** — replace the `insertEventLine` stub:

```js
// shared placement core: put `line` inside half `half`, ordered by elapsed
// minute. Returns null when by-minute placement doesn't apply (no minute on
// the line, or the half has no start mark) — callers fall back to a splice.
function placeEventLineByMinute(raw, half, line) {
  const newMin = eventLineMinute(line);
  if (newMin == null) return null;
  const lines = raw.split("\n");
  const p = parseMatch(raw, {});
  const start = p.halfMarks.find((m) => !m.marker && m.half === half);
  if (!start) return null;
  const startMin = start.startMin != null ? start.startMin : parseInt(start.clock.split(":")[1], 10);
  let newElapsed = newMin - startMin; if (newElapsed < 0) newElapsed += 60; // same wrap as the parser
  const endMark = p.halfMarks.find((m) => m.marker && m.half === half && m.srcLine > start.srcLine);
  const nextStart = p.halfMarks.find((m) => !m.marker && m.half === half + 1);
  let at = endMark ? endMark.srcLine : nextStart ? nextStart.srcLine : lines.length;
  while (at > start.srcLine + 1 && !(lines[at - 1] || "").trim()) at--; // don't strand it past trailing blanks
  const entries = [...p.scoring, ...p.notes]
    .filter((e) => e.half === half && e.srcLine != null && e.srcLine > start.srcLine && e.srcLine < at)
    .sort((x, y) => x.srcLine - y.srcLine);
  for (const e of entries) {
    if (e.elapsed != null && e.elapsed > newElapsed) { at = e.srcLine; break; } // minute-less notes stick to their predecessor
  }
  lines.splice(at, 0, line);
  return lines.join("\n");
}
function insertEventLine(raw, afterIdx, line) {
  const p = parseMatch(raw, {});
  // the anchor decides the half: its own entry, or the nearest entry above it
  let half = null;
  const all = [...p.scoring, ...p.notes, ...p.halfMarks];
  for (let i = afterIdx; i >= 0 && half == null; i--) {
    const hit = all.find((e) => e.srcLine === i);
    if (hit) half = hit.half;
  }
  const placed = half != null ? placeEventLineByMinute(raw, half, line) : null;
  if (placed != null) return placed;
  const lines = raw.split("\n");
  lines.splice(afterIdx + 1, 0, line); // minute-less line (or no parsable anchor): literally after the anchor
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests** — `node tools/run-tests.js` — expected: `all passed`.
- [ ] **Step 5: JSX check** — expected: clean.
- [ ] **Step 6: Commit**

```bash
git add index.html tools/run-tests.js
git commit -m "notation blocks: insertEventLine places lines by minute within the half"
```

---

### Task 4: `replaceEventLine`

**Files:**
- Modify: `index.html` (replace the Task-2 stub)
- Test: `tools/run-tests.js`

Contract: rewrite the line in place; only when **both** old and new lines carry a leading event minute **and they differ** does the line move (same placement core). Structure lines (clock/bare-minute/HT/FT/`+N`) and minute-less lines never move; a minute-less line *gaining* a minute stays put.

- [ ] **Step 1: Write the failing tests** (re-uses the `BLK` fixture from Task 3):

```js
// ---- replaceEventLine ----
{
  const at = (r, i) => r.split("\n")[i];
  const a = replaceEventLine(BLK, 7, "25 T 0-1 0-1"); // 31' -> 25' (elapsed 4): moves before the 27' note
  t("replace re-sorts on minute change", [at(a, 6), at(a, 7)], ["25 T 0-1 0-1", "27 Jack miss pen"]);
  const b = replaceEventLine(BLK, 5, "23 Rick 0-1 0-0"); // text-only edit, same minute
  t("replace same minute stays put", at(b, 5), "23 Rick 0-1 0-0");
  const c = replaceEventLine(BLK, 8, "51 HT +3"); // marker: edited in place, never re-sorted
  t("replace marker stays put", at(c, 8), "51 HT +3");
  const d = replaceEventLine(BLK, 6, "27 Jack miss pen saved"); // still minuted, same minute
  t("replace note same minute stays put", at(d, 6), "27 Jack miss pen saved");
  t("replace out of range is a no-op", replaceEventLine(BLK, 99, "x"), BLK);
}
```

- [ ] **Step 2: Run to verify they fail** — expected: the new tests FAIL (stub).

- [ ] **Step 3: Implement** — replace the stub:

```js
function replaceEventLine(raw, idx, newLine) {
  const lines = raw.split("\n");
  if (idx < 0 || idx >= lines.length) return raw;
  const oldMin = eventLineMinute(lines[idx]);
  const newMin = eventLineMinute(newLine);
  if (oldMin == null || newMin == null || oldMin === newMin) {
    lines[idx] = newLine; // structure/minute-less lines edit in place; so do same-minute edits
    return lines.join("\n");
  }
  const p = parseMatch(raw, {});
  const hit = [...p.scoring, ...p.notes].find((e) => e.srcLine === idx);
  if (!hit) { lines[idx] = newLine; return lines.join("\n"); }
  const without = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n");
  const placed = placeEventLineByMinute(without, hit.half, newLine);
  if (placed != null) return placed;
  lines[idx] = newLine;
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests** — expected: `all passed`.
- [ ] **Step 5: JSX check** — expected: clean.
- [ ] **Step 6: Commit**

```bash
git add index.html tools/run-tests.js
git commit -m "notation blocks: replaceEventLine re-sorts when the minute changes"
```

---

### Task 5: Block list UI (read-only) + "Edit as text" toggle

**Files:**
- Modify: `index.html` — CSS string, `MatchTracker` state + Notation tab JSX (~1824–1878)

No tests for JSX (no harness); the esbuild check + later manual verification cover it. The pill data relies on parser fields that ARE tested: `srcLine`, `scoring[].usScore/themScore/side`, `notes[].type`, `halfMarks[].marker`.

- [ ] **Step 1: Add CSS** — append to the `CSS` template string (near the other `.mt-` rules):

```css
.mt-blks{display:flex; flex-direction:column; gap:5px; margin-bottom:8px;}
.mt-blk{display:flex; align-items:center; gap:8px; background:#fffdf6; border:1px solid var(--line);
  border-radius:8px; padding:7px 9px; cursor:pointer; text-align:left; width:100%; box-sizing:border-box;}
.mt-blk .t{flex:1; font-family:'SFMono-Regular',ui-monospace,Menlo,monospace; font-size:12px; color:#333; word-break:break-word;}
.mt-blk.lineup{background:#f4eedd;}
.mt-blk .chev{color:#bbac8a; font-size:10px; flex:none;}
.mt-bpill{font-size:9.5px; text-transform:uppercase; letter-spacing:.5px; border-radius:99px; padding:2px 7px;
  flex:none; background:#e8e0cc; color:#777; font-weight:600; font-family:'Oswald';}
.mt-bpill.half{background:#333; color:#fff;}
.mt-bpill.sub{background:#2c5fa8; color:#fff;}
.mt-bpill.card-yellow{background:#f1c40f; color:#5a4500;}
.mt-bpill.card-red{background:#e74c3c; color:#fff;}
```

- [ ] **Step 2: Add state + block model** — inside `MatchTracker`, near the other `useState` calls:

```js
const [notaView, setNotaView] = useState("blocks"); // blocks | text
const [blkEdit, setBlkEdit] = useState(null);       // { idx, minute, rest, confirmDel } (Task 6)
const [blkIns, setBlkIns] = useState(null);         // insert flow state (Task 7)
const [lineupEdit, setLineupEdit] = useState(null); // preamble text while editing (Task 8)
useEffect(() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); }, [curId]);
```

and near `timeline` (after `parsed` exists):

```js
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
```

- [ ] **Step 3: Replace the textarea region** — the JSX currently reads:

```jsx
<p className="mt-h">Raw notation (edit freely — re-parses instantly)</p>
<textarea className="mt-ta" value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
<p className="mt-note" style={{ marginTop: 8 }}> ... format reminder ... </p>
```

Replace with (keep the format-reminder `<p>` verbatim inside the text branch):

```jsx
<div className="mt-row" style={{ marginTop: 14, marginBottom: 6 }}>
  <p className="mt-h" style={{ margin: 0, flex: 1 }}>{notaView === "blocks" ? "Notation — tap a line to edit" : "Raw notation (edit freely — re-parses instantly)"}</p>
  <button className="mt-add alt" onClick={() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setNotaView(notaView === "blocks" ? "text" : "blocks"); }}>
    {notaView === "blocks" ? "Edit as text" : "Blocks"}
  </button>
</div>
{notaView === "text" ? (
  <>
    <textarea className="mt-ta" value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
    <p className="mt-note" style={{ marginTop: 8 }}> ... format reminder, unchanged ... </p>
  </>
) : (
  <div className="mt-blks">
    <div className="mt-blk lineup">
      <span className="mt-bpill">Lineup</span>
      <span className="t">{starters.length} starting · {subs.length} subs{missing.length ? ` · ${missing.length} missing` : ""}</span>
      <span className="chev">tap to edit ▸</span>
    </div>
    {blocks.list.map((b) => (
      <div className="mt-blk" key={b.idx}>
        {blkPill(b)}
        <span className="t">{b.text}</span>
      </div>
    ))}
    {blocks.list.length === 0 && <p className="mt-note">Nothing yet — tap Start half above at throw-in, or Edit as text.</p>}
  </div>
)}
```

(Blocks are display-only in this task; taps come in Tasks 6–8.)

- [ ] **Step 4: JSX check** — expected: clean. Also `node tools/run-tests.js` — expected: `all passed` (parser untouched, but the harness extraction region moved — make sure it still extracts).
- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Notation tab: read-only block list with Edit-as-text toggle"
```

---

### Task 6: Block editor — edit, re-sort, delete

**Files:**
- Modify: `index.html` — `MatchTracker` (handlers + JSX from Task 5), CSS string

- [ ] **Step 1: Add CSS**

```css
.mt-blk.editing{display:block; border:2px solid var(--pitch2); cursor:default;}
.mt-blkrow{display:flex; gap:6px; margin-top:7px; flex-wrap:wrap; align-items:center;}
.mt-blkrow .mt-add{padding:6px 12px;}
.mt-blkrow .danger{background:#fff; color:#c0392b; border:1px solid #c0392b; margin-left:auto;}
.mt-blkrow .danger.armed{background:#c0392b; color:#fff;}
.mt-minstep{display:flex; gap:6px; align-items:center;}
.mt-minstep button{width:36px; height:36px; font-size:17px; border-radius:8px; border:1px solid var(--line); background:#fff;}
.mt-minstep input{width:52px; font-size:16px; text-align:center; padding:6px; border:1px solid var(--line); border-radius:6px; font-family:ui-monospace,Menlo,monospace;}
.mt-blkta{width:100%; box-sizing:border-box; font-family:ui-monospace,Menlo,monospace; font-size:13px; padding:7px; border:1px solid var(--line); border-radius:6px; background:#fffdf6;}
```

- [ ] **Step 2: Add `MinuteStep`** — a top-level component (outside `MatchTracker`, beside `ScoreChart` is fine):

```jsx
function MinuteStep({ val, onChange }) {
  return (
    <div className="mt-minstep">
      <button onClick={() => onChange((val + 59) % 60)}>−</button>
      <input inputMode="numeric" value={val}
        onChange={(e) => { const n = parseInt(e.target.value, 10); onChange(isNaN(n) ? 0 : Math.min(59, Math.max(0, n))); }} />
      <button onClick={() => onChange((val + 1) % 60)}>+</button>
      <span style={{ fontSize: 11, color: "#9a8c66" }}>min</span>
    </div>
  );
}
```

- [ ] **Step 3: Handlers** — in `MatchTracker`:

```js
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
  if (!blkEdit.confirmDel) return setBlkEdit({ ...blkEdit, confirmDel: true }); // second tap confirms, same as match Delete
  setRaw((r) => deleteEventLine(r, blkEdit.idx));
  setBlkEdit(null);
};
```

Also close the editors wherever `raw` changes underneath them: add `setBlkEdit(null); setBlkIns(null);` at the top of `append(...)` and inside `doUndo` (the `curId` effect from Task 5 already covers load/resync/new-match).

- [ ] **Step 4: JSX** — in the Task-5 `blocks.list.map`, replace the plain block row with:

```jsx
{blocks.list.map((b) => blkEdit && blkEdit.idx === b.idx ? (
  <div className="mt-blk editing" key={b.idx}>
    {blkEdit.minute != null && <MinuteStep val={blkEdit.minute} onChange={(m) => setBlkEdit({ ...blkEdit, minute: m, confirmDel: false })} />}
    <input className="mt-blkta" style={{ marginTop: blkEdit.minute != null ? 7 : 0 }} value={blkEdit.rest}
      onChange={(e) => setBlkEdit({ ...blkEdit, rest: e.target.value, confirmDel: false })} spellCheck={false} />
    <div className="mt-blkrow">
      <button className="mt-add" onClick={blkOk}>OK</button>
      <button className="mt-add alt" onClick={() => setBlkEdit(null)}>Cancel</button>
      <button className="mt-add alt" onClick={() => { /* Task 7: open insert */ }}>+ Insert after</button>
      <button className={"mt-add danger" + (blkEdit.confirmDel ? " armed" : "")} onClick={blkDelete}>
        {blkEdit.confirmDel ? "Tap again to delete" : "Delete"}
      </button>
    </div>
    {blkEdit.minute != null && <p className="mt-note" style={{ margin: "6px 0 0" }}>OK re-parses — changing the minute moves the line to its spot in the half.</p>}
  </div>
) : (
  <div className="mt-blk" key={b.idx} onClick={() => openBlk(b)}>
    {blkPill(b)}
    <span className="t">{b.text}</span>
  </div>
))}
```

- [ ] **Step 5: JSX check + full tests** — expected: clean / `all passed`.
- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Notation blocks: tap to edit with minute stepper, re-sort on OK, two-tap delete"
```

---

### Task 7: Insert flow — type chooser + guided forms

**Files:**
- Modify: `index.html` — `MatchTracker` (refactor `liveLine`, who-grid; insert panel JSX)

- [ ] **Step 1: Refactor `liveLine` → `buildEventLine`** — `liveLine` currently computes `who` from `lvTeam` and the minute from `new Date()`. Split it so insert forms can pass both explicitly:

```js
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
const liveLine = (ev, player) => buildEventLine(ev, lvTeam, player, String(new Date().getMinutes()));
```

(Delete the old `liveLine` body — the behaviour of live entry must not change.)

- [ ] **Step 2: Factor the who-grid** — extract the existing "Who? — tap to add" rows (the `liveRows.map(...)` + subs row + Unknown button JSX) into a `MatchTracker`-local function so both live entry and the insert forms use one copy:

```jsx
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
```

Replace the live-entry JSX with `{whoGrid((p) => addLive(lvEvent, p))}`.

- [ ] **Step 3: Insert state + handlers**

```js
// "+ Insert after": anchor block decides the half and the default minute
const anchorMinute = (text) => {
  const m = (text || "").match(/^(\d{1,2})[:.]?(\d{2})?/);
  return m ? (m[2] != null ? parseInt(m[2], 10) : parseInt(m[1], 10)) % 60 : 0;
};
const openInsert = (b) => { setBlkEdit(null); setBlkIns({ afterIdx: b.idx, type: null, minute: anchorMinute(b.text), team: "us", ev: null, player: undefined, on: null, off: null, cardKind: "yellow", noteText: "", noteMin: false }); };
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
  setSavedMsg(`Added “${line}”`); setTimeout(() => setSavedMsg(""), 1800);
};
// a minuted free-text note with none of the parser's note keywords would read as a score
const notePhantom = blkIns && blkIns.type === "note" && blkIns.noteMin && blkIns.noteText.trim()
  && !/\b(miss(ed|es)?|wide|saved|blocked|short|water|corner|yellow|red|for)\b/i.test(blkIns.noteText);
```

Wire the Task-6 placeholder: `onClick={() => openInsert(b)}` on "+ Insert after" (pass the block `b` — it's in scope in the map).

- [ ] **Step 4: Insert panel JSX** — render after the anchor block inside the map (when `blkIns && blkIns.afterIdx === b.idx`):

```jsx
{blkIns && blkIns.afterIdx === b.idx && (
  <div className="mt-blk editing">
    {!blkIns.type ? (
      <>
        <p className="mt-h" style={{ margin: "0 0 6px" }}>Insert after “{b.text.slice(0, 24)}…” — what kind?</p>
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
        {(blkIns.type === "score" && blkIns.ev || blkIns.type === "card") && blkIns.team === "us" && (
          <div style={{ marginTop: 7 }}>{whoGrid((p) => setBlkIns({ ...blkIns, player: p }))}</div>
        )}
        {blkIns.type === "sub" && (
          <>
            <p className="mt-note" style={{ margin: "7px 0 4px" }}>Who came on?</p>
            {whoGrid((p) => p !== "unknown" && setBlkIns({ ...blkIns, on: p }))}
            <p className="mt-note" style={{ margin: "7px 0 4px" }}>Who went off?</p>
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
        <div className="mt-blkrow">
          <button className="mt-add" disabled={!insLine()} onClick={insOk}>OK</button>
          <button className="mt-add alt" onClick={() => setBlkIns(null)}>Cancel</button>
        </div>
      </>
    )}
  </div>
)}
```

Note the map must now return a fragment per block (`<React.Fragment key={b.idx}>` wrapping block-or-editor + optional insert panel).

- [ ] **Step 5: JSX check + full tests** — expected: clean / `all passed`. Manually sanity-check in a browser (open `index.html` via a local static server is NOT enough for Drive, but the parse/UI works offline — sign-in only gates the storage; if the sign-in wall blocks local checking, rely on esbuild + deploy-time verification in Task 9).
- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Notation blocks: insert-after with type chooser and guided forms"
```

---

### Task 8: Lineup block editor

**Files:**
- Modify: `index.html` — `MatchTracker` (lineup block JSX from Task 5)

- [ ] **Step 1: Handlers**

```js
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
```

- [ ] **Step 2: JSX** — replace the static lineup block from Task 5:

```jsx
{lineupEdit == null ? (
  <div className="mt-blk lineup" onClick={openLineup}>
    <span className="mt-bpill">Lineup</span>
    <span className="t">{starters.length} starting · {subs.length} subs{missing.length ? ` · ${missing.length} missing` : ""}</span>
    <span className="chev">tap to edit ▸</span>
  </div>
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
```

- [ ] **Step 3: JSX check + full tests** — expected: clean / `all passed`.
- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Notation blocks: lineup block expands to a preamble textarea"
```

---

### Task 9: Version, docs, deploy, verify

**Files:**
- Modify: `index.html` (`APP_VERSION`), `CLAUDE.md`

- [ ] **Step 1: Bump version** — `const APP_VERSION = "v32";` → `"v33"` (check the current value first — bump from whatever is live).

- [ ] **Step 2: Update CLAUDE.md** — in the Architecture section, after the parser subsection, add:

```markdown
- **Notation blocks:** the Notation tab renders the raw text as tappable blocks (one per event line; the preamble is a single Lineup block). Blocks are a view over `raw` — edits go through the pure helpers `replaceEventLine` / `deleteEventLine` / `insertEventLine` (beside the roster-edit helpers), which re-place a line within its half by elapsed minute when its minute changes; structure lines (clock, bare minute, HT/FT, `+N`) never move. `parseMatch` stamps `srcLine` on scoring/notes/halfMarks to classify blocks. The old textarea lives behind the "Edit as text" toggle.
```

- [ ] **Step 3: Full verification**

```bash
node tools/run-tests.js                          # expected: all passed
sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null   # expected: clean
git log --oneline -8                             # expected: one commit per task
```

- [ ] **Step 4: Commit + push**

```bash
git add index.html CLAUDE.md
git commit -m "Notation as blocks: edit, re-sort, delete, insert-after (v33)"
git push
```

- [ ] **Step 5: Tell the user** to hard-refresh https://seaninryan.github.io/sideline/ after ~10 min and look for **v33** beside the logo, then sanity-check on the phone: tap a score block → change minute → OK re-sorts; delete needs two taps; + Insert after → Score/Sub/Card/Corner/Note forms; Lineup block expands; Edit as text round-trips.

---

## Self-review notes

- **Spec coverage:** block list incl. lineup block + pills (T5/T8), editor B with stepper + re-sort + two-tap delete (T4/T6), minute-less handling (T2/T6), structure lines immovable (T2/T4), insert chooser + guided forms + preview + placement (T3/T7), Edit-as-text toggle (T5), `srcLine` (T1), helpers exported + tested via harness (T2–T4), version/CLAUDE.md/deploy (T9). The spec's "optional minute" on the Note form is implemented as an off-by-default checkbox **plus a phantom-score warning** — a minuted keyword-less note parses as a score (pre-existing notation property discovered while planning; the form guards it).
- **One open risk:** the live sign-in wall means in-browser verification happens post-deploy (same limitation as every Sideline change; CLAUDE.md documents it).
