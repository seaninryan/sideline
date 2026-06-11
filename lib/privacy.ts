// One privacy model shared by matches and teams. Three levels map onto the
// (is_public, listed) columns: Private = not public; Unlisted = public, link-only;
// Listed = public and shown in the public feed.
export type PrivacyLevel = "private" | "unlisted" | "listed";

export function privacyLevel(isPublic?: boolean, listed?: boolean): PrivacyLevel {
  if (!isPublic) return "private";
  return listed === false ? "unlisted" : "listed"; // listed defaults true
}

export function levelToColumns(level: PrivacyLevel): { is_public: boolean; listed: boolean } {
  if (level === "private") return { is_public: false, listed: true };
  if (level === "unlisted") return { is_public: true, listed: false };
  return { is_public: true, listed: true };
}

export const PRIVACY_LEVELS: { v: PrivacyLevel; label: string; hint: string }[] = [
  { v: "private", label: "Private", hint: "Only you" },
  { v: "unlisted", label: "Unlisted", hint: "Anyone with the link" },
  { v: "listed", label: "Listed", hint: "In the public feed" },
];
