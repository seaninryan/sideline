export function gpTotal(g: number, p: number, mode: string): number { return mode === "goals" ? g : g * 3 + p; }
// crypto.randomUUID() — available in modern browsers and Node 18+ (the test harness).
export function mkId(): string { return crypto.randomUUID(); }
// Normalise a Backup export ({matches:[{id,...rec}]} or a bare array) into [{id, rec}]
// with FRESH uuids, dropping any incoming id so old non-uuid ids never reach Postgres.
// `gen` is injectable for deterministic tests.
export function remapImport(obj: any, gen?: () => string): { id: string; rec: Record<string, any> }[] {
  const g = gen || mkId;
  const arr = (obj && obj.matches) || (Array.isArray(obj) ? obj : []);
  return arr.map((mm: any) => { const { id: _drop, ...rec } = mm; return { id: g(), rec }; });
}
export function fmtScore(g: number, p: number, mode: string): string { return mode === "goals" ? String(g) : `${g}-${p}`; }
// Is this public-match slug a full UUID (legacy/full link) vs a short code?
export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
export function squash(s: string): string { return (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
export const titleCase = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase());
// readable text colour for a jersey/button of the given colour (dark kit => white numbers)
export const contrastOn = (hex: string): string => {
  const h = (hex || "").replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0);
  return 0.299 * r + 0.587 * g + 0.114 * b > 145 ? "#11241b" : "#ffffff";
};
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const pad2 = (n: number): string => String(n).padStart(2, "0");
export const toLocalInput = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtDate = (s: string): string => { if (!s) return ""; const d = new Date(s); if (isNaN(d.getTime())) return ""; return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export const fmtDateShort = (s: string): string => { if (!s) return ""; const d = new Date(s); if (isNaN(d.getTime())) return ""; return `${d.getDate()} ${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`; };
export const dateKey = (s: string | undefined, fb?: number): number => { const d = s ? Date.parse(s) : NaN; return isNaN(d) ? (fb || 0) : d; };
