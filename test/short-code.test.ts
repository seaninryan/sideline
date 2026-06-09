import { describe, it, expect } from "vitest";
import { genShortCode, isShortCode, SHORT_CODE_LEN } from "@/lib/short-code";
import { isUuid } from "@/lib/util";

describe("genShortCode", () => {
  it("produces a code of the expected length from the unambiguous alphabet", () => {
    const c = genShortCode();
    expect(c).toHaveLength(SHORT_CODE_LEN);
    expect(isShortCode(c)).toBe(true);
    expect(c).not.toMatch(/[01oil]/); // no visually ambiguous characters
  });
  it("is overwhelmingly unique across many draws", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => genShortCode()));
    expect(seen.size).toBeGreaterThan(1990); // collisions are vanishingly rare
  });
});

describe("isUuid", () => {
  it("recognises full UUIDs and rejects short codes", () => {
    expect(isUuid("1d980a6d-8454-498c-9350-62a25a44feac")).toBe(true);
    expect(isUuid("k3xm9q")).toBe(false);
    expect(isUuid(genShortCode())).toBe(false);
  });
});
