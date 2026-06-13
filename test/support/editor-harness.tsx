import React from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";

// An inert, chainable Supabase stub: every query-builder method returns the
// builder, and the builder is awaitable → resolves { data: null, error: null }.
// auth + realtime are no-ops. Enough for MatchTracker to mount without network.
export function makeSupabaseStub() {
  const qb: any = {};
  for (const m of ["select", "insert", "upsert", "update", "delete", "eq", "neq", "is", "order", "limit", "range", "maybeSingle", "single"]) {
    qb[m] = () => qb;
  }
  qb.then = (resolve: (v: any) => any) => resolve({ data: null, error: null });
  return {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signInWithOAuth: async () => ({}),
      signOut: async () => ({}),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => qb,
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
}

// Mock the supabase client module so createClient() returns the inert stub.
// vi.mock is hoisted; the factory must be self-contained.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => makeSupabaseStub() }));

// MatchTracker calls useRouter() from next/navigation, which throws outside the
// App Router context ("invariant expected app router to be mounted"). Provide an
// inert router (push/replace are no-ops) so the editor can mount under jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Seed the in-memory store cache with a record under `id`, then render the editor
// pointed at it. Returns the Testing Library render result.
export async function mountEditor(id: string, record: any) {
  const { cache } = await import("@/lib/store");
  cache[id] = record;
  const { default: MatchTracker } = await import("@/components/MatchTracker");
  return render(<MatchTracker initialId={id} />);
}
