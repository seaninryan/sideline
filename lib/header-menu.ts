export type HeaderScreen =
  | "landing" | "editor" | "public" | "teams" | "team" | "admin" | "admin-user";

export type HeaderNavItem = { label: string; href: string };

// The common ⋯-menu navigation items, decided from the current screen + viewer.
// Screen-specific primary buttons (New on landing/teams, editor Share, etc.) are
// NOT here — they stay as the `primary` prop. Signed-out viewers get nothing.
export function buildHeaderMenu(args: {
  screen: HeaderScreen;
  email: string | null;
  isAdmin: boolean;
}): HeaderNavItem[] {
  const { screen, email, isAdmin } = args;
  if (!email) return [];
  const items: HeaderNavItem[] = [];

  // New — everywhere except where it's already the primary button.
  if (screen !== "landing" && screen !== "teams") items.push({ label: "＋ New", href: "/m/new" });

  // Teams — everywhere except the teams list itself.
  if (screen !== "teams") items.push({ label: "👥 Teams", href: "/teams" });

  // Admin — admins only, and not while already on an admin screen.
  if (isAdmin && screen !== "admin" && screen !== "admin-user") {
    items.push({ label: "🛠 Admin", href: "/admin" });
  }
  return items;
}
