"use client";

import { createClient } from "@/lib/supabase/client";
import { backfillNotation } from "@/lib/migrate-notation";
import type { MatchRecord, TeamRecord } from "@/lib/types";
import { teamStore } from "@/lib/team-store";
import { linkExistingMatchPatch, reconcileHomeAwayFromTeams, stripUsThem, migrateRecordToV3 } from "@/lib/team-link";
import { recordHomeAway } from "@/lib/home-away";

export { migrateRecordToV3 } from "@/lib/team-link"; // re-export for existing importers

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
  const ids = Object.keys(cache).filter((id) => cache[id] && cache[id].notationV !== 2 && cache[id].notationV !== 3);
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
    const d: any = cache[id];
    if (!d || d.homeTeamId || d.awayTeamId) return false;
    // home/away record (v3) — derive directly; legacy us/them — derive via recordHomeAway.
    const ha = d.homeTeam !== undefined ? d : recordHomeAway(d);
    return (ha.homeTeam || "").trim() && (ha.awayTeam || "").trim();
  });
  for (const id of ids) {
    try {
      const d: any = cache[id];
      const sport = d.sport || "";
      const ha = d.homeTeam !== undefined ? d : { ...d, ...recordHomeAway(d) };
      const homeTeam = await teamStore.findOrCreate(userId, { name: ha.homeTeam, sport });
      const awayTeam = await teamStore.findOrCreate(userId, { name: ha.awayTeam, sport });
      if (!homeTeam || !awayTeam) continue;
      const patch = linkExistingMatchPatch(ha, { homeTeam, awayTeam });
      await store.set(id, { ...ha, ...patch });
    } catch (e) {
      console.warn("link migration failed for", id, e);
    }
  }
}

// ④a one-time: bring every notationV:2 record to v3 home/away (rosters derived,
// identity reconciled from teams). Idempotent (only touches notationV === 2);
// resilient per-record.
export async function migrateHomeAway(userId: string | null) {
  const teams: TeamRecord[] = userId ? await teamStore.list(userId) : [];
  const byId: Record<string, TeamRecord> = {};
  teams.forEach((t) => { if (t.id) byId[t.id] = t; });
  const ids = Object.keys(cache).filter((id) => cache[id] && cache[id].notationV === 2);
  for (const id of ids) {
    try {
      const clean = migrateRecordToV3(cache[id], byId);
      cache[id] = clean;
      await store.set(id, clean);
    } catch (e) { console.warn("home/away migration failed for", id, e); }
  }
}

// Derive the promoted columns from a record. `data` (jsonb) stays the source of truth.
// The vestigial my_team/opponent columns were dropped in ③.1 (nothing SELECTed them);
// team identity lives in the home_team_id/away_team_id links + data jsonb.
function matchCols(data: MatchRecord) {
  return {
    match_date: data.matchDate || data.date || null,
    sport: data.sport || "soccer",
    name_display: data.nameDisplay || "full",
    home_team_id: data.homeTeamId || null,
    away_team_id: data.awayTeamId || null,
  };
}

export const store = {
  ok: true,
  async list(): Promise<string[]> { return Object.keys(cache).map((id) => "match:" + id); },
  async get(id: string): Promise<MatchRecord | null> { return cache[id] || null; },
  async set(id: string, data: any): Promise<boolean> {
    // Defensive: the editor + migration + Landing all pass home/away now and fall to
    // the else branch unchanged. Any stray legacy us/them payload (has myTeam) is still
    // converted via recordHomeAway → clean v3, so the column derivation can't break.
    const rec: MatchRecord = data && data.myTeam !== undefined
      ? { ...stripUsThem({ ...data, ...recordHomeAway(data) }), notationV: 3 }
      : data;
    cache[id] = rec;
    const { error } = await sb.from("matches").upsert(Object.assign(
      { id, data: rec, updated_at: new Date().toISOString() }, matchCols(rec),
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
