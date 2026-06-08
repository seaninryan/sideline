import { describe, it, expect } from "vitest";
import { brandPillSVG } from "@/lib/infographic";

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
