# Colour Picker — Close on Selection — Implementation Plan

> **For agentic workers:** small single-edit change; execute inline. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tapping a preset colour swatch applies the colour and closes the picker panel.

**Architecture:** One handler change in the `sw(c)` helper inside the `colorPick` panel of `components/MatchTracker.tsx` (`@ts-nocheck`). The Advanced `<input type="color">` and the Done button are untouched.

**Tech Stack:** TypeScript, Next 14. Node 20 — prefix node/npm/npx with `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && <cmd>'`. Branch: `colour-picker-close` (off main).

---

### Task 1: Swatch tap applies + closes

**Files:** Modify `components/MatchTracker.tsx` (the `sw` helper in the `colorPick` panel), `lib/constants.ts` (`APP_VERSION`).

- [ ] **Step 1:** In the `sw = (c) => (...)` helper, change the swatch `onClick` from `() => setVal(c)` to `() => { setVal(c); setColorPick(null); }`. Leave the Advanced `<input type="color">` `onChange` and the Done button unchanged.

```tsx
const sw = (c) => (
  <button key={c} className={"mt-swatch big" + (c === (val || "").toLowerCase() ? " on" : "")}
    style={{ background: c }} onClick={() => { setVal(c); setColorPick(null); }} title={c} />
);
```

- [ ] **Step 2:** Bump `APP_VERSION` in `lib/constants.ts` to `"v52"`.

- [ ] **Step 3:** Verify — `bash -lc '… npx tsc --noEmit'` clean; `bash -lc '… npm run build'` succeeds; `bash -lc '… npx vitest run'` still green (197; no test surface touched).

- [ ] **Step 4:** Update `CLAUDE.md` — bump the `Current: **vNN**` line to v52; in the UI-decisions note about the inline colour picker, add that a preset swatch applies-and-closes (Advanced input keeps Done).

- [ ] **Step 5:** Commit.

```bash
git add components/MatchTracker.tsx lib/constants.ts CLAUDE.md
git commit -m "feat: colour picker closes when a preset swatch is tapped (v52)"
```

---

## Self-review

- **Spec coverage:** swatch applies+closes (Step 1); Advanced input + Done untouched (left as-is); v52 + docs (Steps 2/4). No test surface. ✓
- **Type consistency:** `setVal`/`setColorPick` already in scope in the panel closure. ✓
