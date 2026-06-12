"use client";

import { createClient } from "@/lib/supabase/client";
import { parseMatch } from "@/lib/parser";
import { backfillNotation } from "@/lib/migrate-notation";
import type { MatchRecord } from "@/lib/types";
import { teamStore } from "@/lib/team-store";
import { linkExistingMatchPatch } from "@/lib/team-link";

const sb = createClient();

// { id: record } — in-memory mirror; same shape MatchTracker has always read.
export let cache: Record<string, MatchRecord> = {};

// Pull every match the signed-in user owns into `cache`. RLS scopes the query to auth.uid().
export async function loadAll() {
  const { data, error } = await sb.from("matches").select("id,data");
  if (error) throw error;
  cache = {};
  (data || []).forEach((r: { id: string; data: MatchRecord } | null) => {
    if (r && r.id) cache[r.id] = r.data;
  });
  // One-time durable backfill: legacy records (no notationV) are migrated to
  // event-only and persisted. Event-only-origin records carry notationV:2 and
  // are skipped (so their seeded usRoster is never clobbered). Resilient: one
  // bad record must not abort the load.
  const ids = Object.keys(cache).filter((id) => cache[id] && cache[id].notationV !== 2);
  await Promise.allSettled(ids.map(async (id) => {
    try {
      const migrated = backfillNotation(cache[id]);
      if (migrated !== cache[id]) { cache[id] = migrated; await store.set(id, migrated); }
    } catch (e) { console.warn("backfill failed for", id, e); }
  }));
}

// One-time, idempotent: link every cached match that has no team links yet to
// its (sport, name) teams (find-or-create), seeding only missing rosters. Skips
// already-linked matches and those with no derivable opponent, so it's a no-op
// once complete. Resilient: one failure must not abort the rest.
export async function linkUnlinkedMatches(userId: string | null) {
  if (!userId) return;
  const ids = Object.keys(cache).filter((id) => {
    const d = cache[id];
    return d && !d.homeTeamId && !d.awayTeamId && (d.opponent || "").trim() && (d.myTeam || "").trim();
  });
  await Promise.allSettled(ids.map(async (id) => {
    const d = cache[id];
    const sport = d.sport || "";
    const usTeam = await teamStore.findOrCreate(userId, { name: d.myTeam!, sport });
    const oppTeam = await teamStore.findOrCreate(userId, { name: d.opponent!, sport });
    if (!usTeam || !oppTeam) return;
    const patch = linkExistingMatchPatch(d, { usTeam, oppTeam, homeAway: d.homeAway || "away" });
    await store.set(id, { ...d, ...patch });
  }));
}

// Derive the promoted columns from a record. `data` (jsonb) stays the source of truth.
// `opponent` lives on the record now; fall back to a legacy header parse only if absent.
function matchCols(data: MatchRecord) {
  let opp: string | null = data.opponent || null;
  if (!opp) {
    try { opp = (parseMatch(data.raw, { myTeam: data.myTeam, usRoster: data.usRoster, oppRoster: data.oppRoster }).opp) || null; } catch {}
  }
  return {
    match_date: data.matchDate || data.date || null,
    my_team: data.myTeam || null,
    opponent: opp,
    sport: data.sport || null,
    name_display: data.nameDisplay || "full",
    home_team_id: data.homeTeamId || null,
    away_team_id: data.awayTeamId || null,
  };
}

export const store = {
  ok: true,
  async list(): Promise<string[]> { return Object.keys(cache).map((id) => "match:" + id); },
  async get(id: string): Promise<MatchRecord | null> { return cache[id] || null; },
  async set(id: string, data: MatchRecord): Promise<boolean> { // single-row upsert; owner defaults to auth.uid() on insert (RLS-checked)
    cache[id] = data;
    const { error } = await sb.from("matches").upsert(Object.assign(
      { id, data, updated_at: new Date().toISOString() }, matchCols(data),
    ));
    if (error) console.warn("save failed", error.message);
    return !error;
  },
  async del(id: string): Promise<boolean> {
    delete cache[id];
    const { error } = await sb.from("matches").delete().eq("id", id);
    return !error;
  },
};
