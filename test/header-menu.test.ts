import { describe, it, expect } from "vitest";
import { buildHeaderMenu } from "@/lib/header-menu";

const signedIn = { email: "a@b.com", isAdmin: false };

describe("buildHeaderMenu", () => {
  it("signed-out → no items", () => {
    expect(buildHeaderMenu({ screen: "landing", email: null, isAdmin: false })).toEqual([]);
  });

  it("landing (signed in) → Teams only (New is the primary there)", () => {
    expect(buildHeaderMenu({ screen: "landing", ...signedIn }).map((i) => i.label))
      .toEqual(["👥 Teams"]);
  });

  it("editor → New + Teams", () => {
    expect(buildHeaderMenu({ screen: "editor", ...signedIn }).map((i) => i.label))
      .toEqual(["＋ New", "👥 Teams"]);
  });

  it("teams screen → New only (Teams suppressed — already there)", () => {
    expect(buildHeaderMenu({ screen: "teams", ...signedIn }).map((i) => i.label))
      .toEqual([]);
  });

  it("admin sees Admin appended when isAdmin", () => {
    expect(buildHeaderMenu({ screen: "editor", email: "a@b.com", isAdmin: true }).map((i) => i.label))
      .toEqual(["＋ New", "👥 Teams", "🛠 Admin"]);
  });

  it("non-admin never sees Admin", () => {
    expect(buildHeaderMenu({ screen: "public", ...signedIn }).some((i) => i.label.includes("Admin")))
      .toBe(false);
  });

  it("admin screens suppress the Admin item (already there) but keep New/Teams", () => {
    expect(buildHeaderMenu({ screen: "admin", email: "a@b.com", isAdmin: true }).map((i) => i.label))
      .toEqual(["＋ New", "👥 Teams"]);
    expect(buildHeaderMenu({ screen: "admin-user", email: "a@b.com", isAdmin: true }).map((i) => i.label))
      .toEqual(["＋ New", "👥 Teams"]);
  });

  it("hrefs are correct", () => {
    const items = buildHeaderMenu({ screen: "editor", email: "a@b.com", isAdmin: true });
    expect(items).toEqual([
      { label: "＋ New", href: "/m/new" },
      { label: "👥 Teams", href: "/teams" },
      { label: "🛠 Admin", href: "/admin" },
    ]);
  });
});
