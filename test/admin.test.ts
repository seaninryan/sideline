import { describe, it, expect } from "vitest";
import { aggregateUserStats } from "@/lib/admin";
import type { Profile } from "@/lib/types";

const p = (id: string, created_at: string): Profile =>
  ({ id, email: `${id}@x.com`, full_name: id, avatar_url: null, is_admin: false, created_at });

describe("aggregateUserStats", () => {
  const profiles = [p("alice", "2026-01-01"), p("bob", "2026-02-01")];
  const matches = [
    { owner: "alice", is_public: true, listed: true },
    { owner: "alice", is_public: true, listed: false },
    { owner: "alice", is_public: false, listed: true },
    { owner: "bob", is_public: false, listed: true },
  ];

  it("groups counts by owner", () => {
    const stats = aggregateUserStats(profiles, matches);
    const alice = stats.find((s) => s.profile.id === "alice")!;
    expect(alice.total).toBe(3);
    expect(alice.public).toBe(2);          // is_public
    expect(alice.listed).toBe(1);          // is_public && listed
  });

  it("profiles with no matches get zeros", () => {
    const stats = aggregateUserStats([p("carol", "2026-03-01")], []);
    expect(stats[0]).toMatchObject({ total: 0, public: 0, listed: 0 });
  });

  it("sorts newest signup first", () => {
    expect(aggregateUserStats(profiles, matches).map((s) => s.profile.id))
      .toEqual(["bob", "alice"]);
  });

  it("ignores match rows whose owner has no profile", () => {
    const stats = aggregateUserStats([p("alice", "2026-01-01")],
      [{ owner: "ghost", is_public: true, listed: true }]);
    expect(stats).toHaveLength(1);
    expect(stats[0].total).toBe(0);
  });
});
