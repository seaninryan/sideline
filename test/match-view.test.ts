import { describe, it, expect } from "vitest";
import { resolveMatchView } from "@/lib/match-view";

describe("resolveMatchView", () => {
  it("missing row → notfound", () => {
    expect(resolveMatchView({ found: false, isOwner: false, isPublic: false, isAdmin: false })).toBe("notfound");
  });
  it("owner → editor (even when private)", () => {
    expect(resolveMatchView({ found: true, isOwner: true, isPublic: false, isAdmin: false })).toBe("editor");
  });
  it("owner of a public match still gets the editor", () => {
    expect(resolveMatchView({ found: true, isOwner: true, isPublic: true, isAdmin: false })).toBe("editor");
  });
  it("non-owner, public → read-only", () => {
    expect(resolveMatchView({ found: true, isOwner: false, isPublic: true, isAdmin: false })).toBe("public");
  });
  it("non-owner, private → notfound (RLS would not return it anyway)", () => {
    expect(resolveMatchView({ found: true, isOwner: false, isPublic: false, isAdmin: false })).toBe("notfound");
  });
  it("admin non-owner of a private match → read-only public view", () => {
    expect(resolveMatchView({ found: true, isOwner: false, isPublic: false, isAdmin: true })).toBe("public");
  });
  it("owner branch still wins over admin", () => {
    expect(resolveMatchView({ found: true, isOwner: true, isPublic: false, isAdmin: true })).toBe("editor");
  });
});
