import { describe, it, expect } from "vitest";
import { brandPillSVG, buildInfographicSVG } from "@/lib/infographic";
import { buildModel } from "@/lib/model";
import { SAMPLE_RECORD } from "@/lib/sample";
import { BRAND_SITE, BRAND_WORDMARK, BRAND_CHANT } from "@/lib/constants";

describe("brandPillSVG", () => {
  it("returns an SVG group with the HWG pill geometry", () => {
    const s = brandPillSVG(10, 20, 0.5);
    expect(s).toContain('transform="translate(10,20) scale(0.5)"');
    expect(s).toContain('rx="27"');          // the pill
    expect(s).toContain('stroke="#f5c518"'); // yellow outline
  });
  it("renders HW in cream and G in yellow", () => {
    const s = brandPillSVG(0, 0, 1);
    expect(s).toContain('<tspan fill="#f4efe1">HW</tspan>');
    expect(s).toContain('<tspan fill="#f5c518">G</tspan>');
  });
});

describe("buildInfographicSVG branding", () => {
  const model = buildModel(SAMPLE_RECORD);
  const { svg } = buildInfographicSVG(model);
  it("carries the brand lockup in the footer", () => {
    expect(svg).toContain(BRAND_WORDMARK);
    expect(svg).toContain(BRAND_SITE);
    expect(svg).toContain(BRAND_CHANT.toUpperCase()); // chant rendered uppercase
    expect(svg).toContain('<tspan fill="#f4efe1">HW</tspan>');      // the pill
  });
});
