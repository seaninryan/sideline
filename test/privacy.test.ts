import { describe, it, expect } from "vitest";
import { privacyLevel, levelToColumns } from "@/lib/privacy";

describe("privacyLevel", () => {
  it("private when not public", () => {
    expect(privacyLevel(false, true)).toBe("private");
    expect(privacyLevel(false, false)).toBe("private");
    expect(privacyLevel(undefined, undefined)).toBe("private");
  });
  it("listed when public and listed (listed defaults true)", () => {
    expect(privacyLevel(true, true)).toBe("listed");
    expect(privacyLevel(true, undefined)).toBe("listed");
  });
  it("unlisted when public but not listed", () => {
    expect(privacyLevel(true, false)).toBe("unlisted");
  });
});

describe("levelToColumns", () => {
  it("round-trips each level", () => {
    expect(levelToColumns("private")).toEqual({ is_public: false, listed: true });
    expect(levelToColumns("unlisted")).toEqual({ is_public: true, listed: false });
    expect(levelToColumns("listed")).toEqual({ is_public: true, listed: true });
    (["private", "unlisted", "listed"] as const).forEach((lv) => {
      const c = levelToColumns(lv);
      expect(privacyLevel(c.is_public, c.listed)).toBe(lv === "private" ? "private" : lv);
    });
  });
});
