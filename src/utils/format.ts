/**
 * Small formatting helpers.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

/** USD with thousands separators, no cents. */
export function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Human GB/TB. */
export function gb(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} TB` : `${Math.round(n)} GB`;
}

/** Hours → "6.5 h" or "2 d 3 h". */
export function hours(h: number): string {
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  const r = Math.round(h % 24);
  return `${d} d ${r} h`;
}

/** Fixed-width ASCII table for the terminal. */
export function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "(none)";
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => (c ?? "").padEnd(w[i])).join("  ").trimEnd();
  return [line(headers), w.map((x) => "-".repeat(x)).join("  "), ...rows.map(line)].join("\n");
}
