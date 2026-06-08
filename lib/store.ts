"use client";

import { createClient } from "@/lib/supabase/client";
import { parseMatch } from "@/lib/parser";
import type { MatchRecord } from "@/lib/types";

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
}

// Derive the promoted columns from a record. `data` (jsonb) stays the source of truth;
// opponent isn't stored in the record, so parse it from the header.
function matchCols(data: MatchRecord) {
  let opp: string | null = null;
  try { opp = (parseMatch(data.raw, { myTeam: data.myTeam }).opp) || null; } catch {}
  return {
    match_date: data.matchDate || data.date || null,
    my_team: data.myTeam || null,
    opponent: opp,
    sport: data.sport || null,
    name_display: data.nameDisplay || "full",
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
