import { describe, it, expect } from "vitest";
import { gpTotal, fmtScore, squash, contrastOn, remapImport } from "@/lib/util";

describe("util", () => {
  it("gpTotal gaa vs goals", () => {
    expect(gpTotal(2, 6, "gaa")).toBe(12);
    expect(gpTotal(2, 6, "goals")).toBe(2);
  });
  it("fmtScore", () => {
    expect(fmtScore(2, 6, "gaa")).toBe("2-6");
    expect(fmtScore(2, 6, "goals")).toBe("2");
  });
  it("squash strips punctuation/case", () => { expect(squash("Cathal N.")).toBe("cathaln"); });
  it("contrastOn picks readable ink", () => {
    expect(contrastOn("#ffffff")).toBe("#11241b");
    expect(contrastOn("#111111")).toBe("#ffffff");
  });
  it("remapImport assigns fresh ids and drops incoming id", () => {
    let n = 0;
    const out = remapImport({ matches: [{ id: "old", raw: "x" }] }, () => `id${++n}`);
    expect(out).toEqual([{ id: "id1", rec: { raw: "x" } }]);
  });
});
