import { describe, it, expect } from "vitest";
import { buildScoreCardSVG } from "@/lib/infographic";
import { buildModel } from "@/lib/model";
import { SAMPLE } from "@/lib/sample";
import { BRAND_SITE, BRAND_WORDMARK } from "@/lib/constants";

describe("buildScoreCardSVG", () => {
  const model = buildModel({ raw: SAMPLE, myTeam: "Racoons", scoringMode: "gaa" });
  const { svg, width, height } = buildScoreCardSVG(model);
  it("is a 1200x630 landscape SVG", () => {
    expect(width).toBe(1200);
    expect(height).toBe(630);
    expect(svg.startsWith("<svg")).toBe(true);
  });
  it("shows both team names and the score", () => {
    expect(svg).toContain("Racoons");
    expect(svg).toContain("Wildebeests");
    expect(svg).toContain("2-6");
    expect(svg).toContain("2-7");
  });
  it("shows no individual player names", () => {
    expect(svg).not.toContain("Rick");
    expect(svg).not.toContain("Morty");
  });
  it("carries the brand lockup", () => {
    expect(svg).toContain(BRAND_WORDMARK);
    expect(svg).toContain(BRAND_SITE);
    expect(svg).toContain('<tspan fill="#f4efe1">HW</tspan>'); // the pill
  });
});
