"use client";
import { createClient } from "@/lib/supabase/client";
import { genShortCode } from "@/lib/short-code";
import type { TeamRecord, TeamRoster, NameDisplay } from "@/lib/types";
import { teamMatchKey } from "@/lib/match-sport";
import { templateForSport } from "@/lib/team-templates";
import { mkId } from "@/lib/util";

const sb = createClient();

interface TeamRow {
  id: string; owner?: string; short_code?: string | null;
  name: string; color1?: string | null; color2?: string | null;
  sport?: string | null; roster: TeamRoster; squad?: string | null;
  is_public?: boolean | null; listed?: boolean | null; name_display?: NameDisplay | null; updated_at?: string;
}

const toRecord = (r: TeamRow): TeamRecord => ({
  id: r.id, owner: r.owner, short_code: r.short_code ?? null,
  name: r.name, color1: r.color1 ?? undefined, color2: r.color2 ?? undefined,
  sport: r.sport ?? undefined, roster: r.roster, squad: r.squad ?? "",
  listed: r.listed ?? true,
  is_public: !!r.is_public, name_display: r.name_display ?? "full", updated_at: r.updated_at,
});

// idempotent short_code mint (mirrors ShareSheet.ensureShortCode)
async function ensureShortCode(id: string): Promise<string | null> {
  try {
    const { data: cur } = await sb.from("teams").select("short_code").eq("id", id).maybeSingle();
    let code: string | null = (cur as any)?.short_code ?? null;
    for (let i = 0; i < 5 && !code; i++) {
      const cand = genShortCode();
      const { error } = await sb.from("teams").update({ short_code: cand }).eq("id", id).is("short_code", null);
      if (error) { if (error.code === "23505") continue; break; }
      const { data: chk } = await sb.from("teams").select("short_code").eq("id", id).maybeSingle();
      code = (chk as any)?.short_code ?? null;
    }
    return code;
  } catch { return null; }
}

export const teamStore = {
  async list(userId: string): Promise<TeamRecord[]> {
    const { data, error } = await sb.from("teams").select("*").eq("owner", userId).order("updated_at", { ascending: false });
    if (error) { console.warn("teams list failed", error.message); return []; }
    return (data as TeamRow[] || []).map(toRecord);
  },
  async get(id: string): Promise<TeamRecord | null> {
    const { data } = await sb.from("teams").select("*").eq("id", id).maybeSingle();
    return data ? toRecord(data as TeamRow) : null;
  },
  // upsert a team; returns the saved id (with a freshly-minted short_code on create) or null on failure
  async set(t: TeamRecord): Promise<string | null> {
    const row = { id: t.id, name: t.name, color1: t.color1 ?? null, color2: t.color2 ?? null, sport: t.sport ?? null, roster: t.roster, squad: t.squad ?? "", updated_at: new Date().toISOString() };
    const { error } = await sb.from("teams").upsert(row);
    if (error) { console.warn("team save failed", error.message); return null; }
    await ensureShortCode(t.id);
    return t.id;
  },
  // Find a team by (sport, name) for this owner, or create one with the sport's
  // template roster. Never mutates an existing team. Returns the TeamRecord (or null on save failure).
  async findOrCreate(
    userId: string,
    { name, sport, color1, color2 }: { name: string; sport: string; color1?: string; color2?: string },
  ): Promise<TeamRecord | null> {
    const want = teamMatchKey(name, sport);
    const existing = (await this.list(userId)).find((t) => teamMatchKey(t.name, t.sport) === want);
    if (existing) return existing;
    const rec: TeamRecord = { id: mkId(), name: name.trim(), sport, color1, color2, roster: templateForSport(sport) };
    const id = await this.set(rec);
    return id ? rec : null;
  },
  async del(id: string): Promise<boolean> {
    const { error } = await sb.from("teams").delete().eq("id", id);
    return !error;
  },
  // Global feed of public teams (own + others), newest first. Offset-paginated.
  async listPublic({ offset = 0, limit = 5 }: { offset?: number; limit?: number } = {}): Promise<TeamRecord[]> {
    const { data, error } = await sb.from("teams").select("*").eq("is_public", true).eq("listed", true)
      .order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) { console.warn("public teams failed", error.message); return []; }
    return (data as TeamRow[] || []).map(toRecord);
  },
  async setPrivacy(id: string, cols: { is_public: boolean; listed: boolean }): Promise<boolean> {
    if (cols.is_public) await ensureShortCode(id);
    const { error } = await sb.from("teams").update(cols).eq("id", id);
    return !error;
  },
  async setNameDisplay(id: string, v: NameDisplay): Promise<boolean> {
    const { error } = await sb.from("teams").update({ name_display: v }).eq("id", id);
    return !error;
  },
};
