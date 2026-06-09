// Short public-match slugs (herewego.ie/m/<code>). Generated on publish and
// stored in the matches.short_code column (unique index). The alphabet omits
// visually ambiguous characters (0/O, 1/l/I) so codes are easy to read aloud.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // 31 chars
export const SHORT_CODE_LEN = 6; // 31^6 ≈ 887M combinations — ample for personal use

export function genShortCode(len: number = SHORT_CODE_LEN): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function isShortCode(s: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${SHORT_CODE_LEN}}$`).test(s);
}
