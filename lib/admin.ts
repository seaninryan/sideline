import type { Profile } from "@/lib/types";

export type UserStat = {
  profile: Profile;
  total: number;
  public: number;   // is_public
  listed: number;   // is_public && listed
};

type MatchLite = { owner: string; is_public: boolean; listed: boolean };

// Per-user match counts, joined onto each profile. Match rows whose owner has no
// profile are ignored. Result is sorted newest-signup-first (created_at desc).
export function aggregateUserStats(profiles: Profile[], matches: MatchLite[]): UserStat[] {
  const byOwner = new Map<string, { total: number; public: number; listed: number }>();
  for (const p of profiles) byOwner.set(p.id, { total: 0, public: 0, listed: 0 });
  for (const m of matches) {
    const agg = byOwner.get(m.owner);
    if (!agg) continue;
    agg.total += 1;
    if (m.is_public) agg.public += 1;
    if (m.is_public && m.listed) agg.listed += 1;
  }
  return profiles
    .map((profile) => ({ profile, ...byOwner.get(profile.id)! }))
    .sort((a, b) => (a.profile.created_at < b.profile.created_at ? 1 : -1));
}
