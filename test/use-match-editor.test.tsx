// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import "./support/editor-harness"; // registers supabase + next/navigation mocks
import { cache } from "@/lib/store";
import { useMatchEditor } from "@/components/match-tracker/useMatchEditor";
import { SAMPLE_RECORD } from "@/lib/sample";

describe("useMatchEditor", () => {
  it("loads a seeded record into home/away state", async () => {
    cache["hk-1"] = { ...SAMPLE_RECORD };
    const { result } = renderHook(() => useMatchEditor({ initialId: "hk-1" as any }));
    await waitFor(() => expect(result.current.homeTeam).toBe("Wildebeests"));
    expect(result.current.awayTeam).toBe("Racoons");
  });

  it("doSwap reverses home/away", async () => {
    cache["hk-2"] = { ...SAMPLE_RECORD };
    const { result } = renderHook(() => useMatchEditor({ initialId: "hk-2" as any }));
    await waitFor(() => expect(result.current.homeTeam).toBe("Wildebeests"));
    act(() => { result.current.doSwap(); });
    await waitFor(() => expect(result.current.homeTeam).toBe("Racoons"));
    expect(result.current.awayTeam).toBe("Wildebeests");
  });
});
