import { describe, it, expect } from "vitest";
import { buildScoreCardSVG, buildInfographicSVG } from "@/lib/infographic";
import { buildModel } from "@/lib/model";
import { SAMPLE_RECORD } from "@/lib/sample";
import { BRAND_SITE, BRAND_WORDMARK } from "@/lib/constants";

describe("buildScoreCardSVG", () => {
  const model = buildModel(SAMPLE_RECORD);
  const { svg, width, height } = buildScoreCardSVG(model);
  it("is a 1200x630 landscape SVG", () => {
    expect(width).toBe(1200);
    expect(height).toBe(630);
    expect(svg.startsWith("<svg")).toBe(true);
  });
  it("shows both team names and the score", () => {
    // SAMPLE: homeAway=away → Wildebeests=home (left, 2-7), Racoons=away (right, 2-6)
    expect(svg).toContain("Racoons");
    expect(svg).toContain("Wildebeests");
    expect(svg).toContain("2-6");
    expect(svg).toContain("2-7");
  });
  it("shows neutral result (Wildebeests won by 1)", () => {
    expect(svg).toContain("Won by 1");
  });
  it("shows home team (Wildebeests) on the left and away team (Racoons) on the right", () => {
    const homePos = svg.indexOf("Wildebeests");
    const awayPos = svg.indexOf("Racoons");
    expect(homePos).toBeGreaterThan(-1);
    expect(awayPos).toBeGreaterThan(-1);
    expect(homePos).toBeLessThan(awayPos);
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

describe("buildInfographicSVG", () => {
  it("renders from a full model without throwing", () => {
    const { svg } = buildInfographicSVG(buildModel(SAMPLE_RECORD));
    expect(typeof svg).toBe("string");
    expect(svg.length).toBeGreaterThan(100);
    expect(svg).toContain("Wildebeests"); // home (SAMPLE is homeAway:"away")
  });
});
