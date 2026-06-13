// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { mountEditor } from "./support/editor-harness";
import { SAMPLE_RECORD } from "@/lib/sample";

describe("MatchTracker swap interaction guard", () => {
  it("clicking ⇄ Swap reverses home/away order in the score header", async () => {
    // SAMPLE_RECORD is home/away v3: Wildebeests (home) 2-7, Racoons (away) 2-6.
    const { container } = await mountEditor("swap-1", { ...SAMPLE_RECORD });

    // Confirm initial order: first .sh-nm is Wildebeests (home), second is Racoons (away).
    const nmsBefore = container.querySelectorAll(".sh-nm");
    expect(nmsBefore[0].textContent).toBe("Wildebeests");
    expect(nmsBefore[1].textContent).toBe("Racoons");

    // Open the Details panel via the "✎ Edit" toggle on the score header.
    fireEvent.click(await screen.findByText("✎ Edit"));

    // Click the Swap button that appears inside the details panel.
    fireEvent.click(await screen.findByText("⇄ Swap"));

    // After the swap the score header must now show Racoons first (was home=Wildebeests).
    const nmsAfter = container.querySelectorAll(".sh-nm");
    expect(nmsAfter[0].textContent).toBe("Racoons");
    expect(nmsAfter[1].textContent).toBe("Wildebeests");

    // Both team names and both scores must still be present (no crash, no data loss).
    expect((await screen.findAllByText("Racoons")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Wildebeests")).length).toBeGreaterThan(0);
    // Scores swap with the teams; 2-6 is now the home score, 2-7 the away score.
    expect((await screen.findAllByText("2-6")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("2-7")).length).toBeGreaterThan(0);
  });
});
