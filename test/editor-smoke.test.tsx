// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { mountEditor } from "./support/editor-harness";
import { SAMPLE_RECORD } from "@/lib/sample";

describe("MatchTracker render smoke test", () => {
  it("mounts a home/away match and renders the score + team names without throwing", async () => {
    await mountEditor("smoke-1", { ...SAMPLE_RECORD });
    // SAMPLE_RECORD is home/away v3: Wildebeests (home) 2-7, Racoons (away) 2-6.
    // The team names + scores each render in more than one place (score header,
    // scoreboard, lineups, scorers), so assert at least one match for each.
    expect((await screen.findAllByText("Wildebeests")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Racoons")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("2-7")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("2-6")).length).toBeGreaterThan(0);
  });

  it("does not leave any us/them artifact in the rendered score header", async () => {
    const { container } = await mountEditor("smoke-2", { ...SAMPLE_RECORD });
    await screen.findAllByText("Wildebeests");
    expect(container.textContent || "").not.toMatch(/My Team|Opposition/);
  });
});
