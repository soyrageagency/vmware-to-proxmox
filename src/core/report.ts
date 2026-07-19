/**
 * Report generation — a professional PDF assessment plus an HTML version, the
 * migration runbook (.sh) and the raw data (.json).
 *
 * The PDF is built with pdfkit (pure JS, no headless browser) so it renders
 * identically anywhere. Every page carries the SoyRage Agency attribution.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { once } from "node:events";
import PDFDocument from "pdfkit";
import type { AppConfig } from "../config.js";
import { BRAND } from "../branding.js";
import { renderScript } from "./plan.js";
import { gb, hours, table, usd } from "../utils/format.js";
import type { Assessment, Finding } from "./types.js";

const ACCENT = "#2f97ee";
const INK = "#1b2430";
const MUTE = "#6b7683";

/** Severity → colour. */
const SEV_COLOR = { blocker: "#e0483f", warning: "#d99a20", info: "#2f97ee" } as const;

export interface ReportPaths {
  dir: string;
  pdf: string;
  html: string;
  script: string;
  json: string;
}

function verdict(score: number): string {
  if (score >= 85) return "Low-risk migration";
  if (score >= 65) return "Moderate — a few items to handle first";
  if (score >= 40) return "Significant preparation needed";
  return "High-risk — plan carefully";
}

function counts(findings: Finding[]) {
  return {
    blocker: findings.filter((f) => f.severity === "blocker").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
}

/** Auto-written executive summary paragraph. */
function summaryText(a: Assessment): string {
  const c = counts(a.findings);
  const s = a.estimate.savings;
  return (
    `This assessment covers ${a.inventory.vms.length} virtual machines (${gb(a.estimate.totalDiskGb)} of disk) ` +
    `across ${a.inventory.hosts.length} ESXi host(s) on ${a.inventory.vcenterVersion}. ` +
    `Overall migration readiness is ${a.readiness}/100 — ${verdict(a.readiness).toLowerCase()}. ` +
    `We found ${c.blocker} blocker(s), ${c.warning} item(s) to address and ${c.info} note(s). ` +
    `The estimated conversion effort is about ${hours(a.estimate.wallClockHours)} of wall-clock time across ${a.estimate.windows} maintenance window(s). ` +
    `Leaving vSphere is projected to save ${usd(s.annualSavings)}/year (${usd(s.threeYearSavings)} over three years) in licensing.`
  );
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

async function writePdf(a: Assessment, path: string): Promise<void> {
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const stream = createWriteStream(path);
  doc.pipe(stream);
  const W = doc.page.width;
  const L = 48;
  const R = W - 48;

  // ---- Cover band ----
  doc.rect(0, 0, W, 128).fill(ACCENT);
  doc.fill("#ffffff").fontSize(22).font("Helvetica-Bold").text("VMware  →  Proxmox", L, 34);
  doc.fontSize(13).font("Helvetica").text("Migration Assessment", L, 66);
  doc.fontSize(9).fillColor("#e8f2fd").text(`${BRAND.author} · ${BRAND.url}`, L, 92);
  doc.fontSize(9).fillColor("#e8f2fd").text(new Date().toLocaleString(), L, 92, { width: R - L, align: "right" });

  doc.fill(INK);
  let y = 152;
  doc.fontSize(10).fillColor(MUTE).text("Source environment", L, y);
  doc.fontSize(12).fillColor(INK).font("Helvetica-Bold").text(`${a.inventory.vcenter}`, L, y + 14);
  doc.fontSize(10).fillColor(MUTE).font("Helvetica").text(a.inventory.vcenterVersion, L, y + 32);

  // Readiness score badge.
  const score = a.readiness;
  const scoreColor = score >= 85 ? "#2fb673" : score >= 65 ? "#d99a20" : "#e0483f";
  doc.roundedRect(R - 150, y, 150, 60, 8).fill("#f3f6fa");
  doc.fill(scoreColor).fontSize(26).font("Helvetica-Bold").text(`${score}`, R - 150, y + 10, { width: 150, align: "center" });
  doc.fill(MUTE).fontSize(8).font("Helvetica").text("READINESS / 100", R - 150, y + 42, { width: 150, align: "center" });

  y += 82;
  doc.fillColor(scoreColor).fontSize(12).font("Helvetica-Bold").text(verdict(score), L, y);
  y += 24;

  // Executive summary.
  sectionTitle(doc, "Executive summary", L, y); y += 22;
  doc.fillColor(INK).fontSize(10).font("Helvetica").text(summaryText(a), L, y, { width: R - L, lineGap: 3 });
  y = doc.y + 16;

  // At a glance cards.
  const cards = [
    ["Virtual machines", String(a.estimate.totalVms)],
    ["Total disk", gb(a.estimate.totalDiskGb)],
    ["ESXi hosts", String(a.inventory.hosts.length)],
    ["Est. wall-clock", hours(a.estimate.wallClockHours)],
    ["Maint. windows", String(a.estimate.windows)],
    ["Annual savings", usd(a.estimate.savings.annualSavings)],
  ];
  const cw = (R - L - 20) / 3;
  cards.forEach((c, i) => {
    const cx = L + (i % 3) * (cw + 10);
    const cy = y + Math.floor(i / 3) * 56;
    doc.roundedRect(cx, cy, cw, 48, 6).fill("#f7f9fc");
    doc.fill(MUTE).fontSize(8).font("Helvetica").text(c[0].toUpperCase(), cx + 10, cy + 8);
    doc.fill(INK).fontSize(15).font("Helvetica-Bold").text(c[1], cx + 10, cy + 20);
  });
  y += 56 * 2 + 12;

  // Findings.
  const c = counts(a.findings);
  sectionTitle(doc, `Compatibility findings  (${c.blocker} blockers · ${c.warning} warnings · ${c.info} notes)`, L, y);
  y += 24;
  const top = a.findings.slice(0, 14);
  for (const f of top) {
    if (y > doc.page.height - 90) { doc.addPage(); y = 60; }
    doc.circle(L + 3, y + 5, 3).fill(SEV_COLOR[f.severity]);
    doc.fill(INK).fontSize(9).font("Helvetica-Bold").text(`${f.vm}`, L + 12, y, { continued: true });
    doc.font("Helvetica").fillColor(INK).text(`  ${f.message}`);
    doc.fillColor(MUTE).fontSize(8).text(`   → ${f.remediation}`, L + 12, doc.y, { width: R - L - 12, lineGap: 1 });
    y = doc.y + 6;
  }
  if (a.findings.length > top.length) {
    doc.fillColor(MUTE).fontSize(8).text(`…and ${a.findings.length - top.length} more (see the HTML report).`, L + 12, y);
    y = doc.y + 6;
  }

  // Cost & savings.
  if (y > doc.page.height - 160) { doc.addPage(); y = 60; }
  y += 10;
  sectionTitle(doc, "Licensing cost comparison", L, y); y += 22;
  const s = a.estimate.savings;
  const rows: Array<[string, string]> = [
    ["vSphere (annual, per-core)", usd(s.vsphereAnnual)],
    ["Proxmox VE subscription (annual)", usd(s.proxmoxAnnual)],
    ["Annual savings", usd(s.annualSavings)],
    ["3-year savings", usd(s.threeYearSavings)],
  ];
  rows.forEach(([k, v], i) => {
    const ry = y + i * 20;
    doc.fill(i >= 2 ? scoreColor : INK).fontSize(i >= 2 ? 11 : 10).font(i >= 2 ? "Helvetica-Bold" : "Helvetica");
    doc.text(k, L, ry, { width: 300 });
    doc.text(v, L, ry, { width: R - L, align: "right" });
  });
  y += rows.length * 20 + 10;
  doc.fill(MUTE).fontSize(7).font("Helvetica").text("Estimates use configurable assumptions; adjust per your contracts. Not a formal quote.", L, y, { width: R - L });

  // Footer on every page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fill(MUTE).fontSize(8).font("Helvetica")
      .text(`${BRAND.author} · ${BRAND.url} · Prepared with V2P`, L, doc.page.height - 34, { width: R - L });
    doc.text(`Page ${i + 1} of ${range.count}`, L, doc.page.height - 34, { width: R - L, align: "right" });
  }

  doc.end();
  await once(stream, "finish");
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string, x: number, y: number): void {
  doc.fill(ACCENT).fontSize(12).font("Helvetica-Bold").text(text, x, y);
  doc.moveTo(x, y + 17).lineTo(doc.page.width - 48, y + 17).lineWidth(0.5).strokeColor("#dde4ec").stroke();
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

export function generateHtml(a: Assessment): string {
  const c = counts(a.findings);
  const s = a.estimate.savings;
  const scoreColor = a.readiness >= 85 ? "#2fb673" : a.readiness >= 65 ? "#d99a20" : "#e0483f";
  const findingRows = a.findings
    .map((f) => `<tr class="sev-${f.severity}"><td><span class="pill ${f.severity}">${f.severity}</span></td><td>${esc(f.vm)}</td><td>${esc(f.message)}<div class="rem">→ ${esc(f.remediation)}</div></td></tr>`)
    .join("");
  const vmRows = a.inventory.vms
    .map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.guestOs)}</td><td>${v.cpu}</td><td>${(v.memoryMb / 1024).toFixed(0)} GB</td><td>${v.disks.reduce((x, d) => x + d.sizeGb, 0)} GB</td><td>${v.powerState}</td><td>vmx-${v.hardwareVersion}</td></tr>`)
    .join("");
  const IP: Record<string, string> = {
    vm: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    disk: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    host: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
    savings: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.4c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.5-2.5 1.8-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7"/>',
  };
  const svg = (n: string) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${IP[n] ?? ""}</svg>`;
  let ci = 0;
  const card = (k: string, v: string, ic: string) => `<div class="card t${ci++ % 4}">${svg(ic)}<div class="k">${k}</div><div class="v">${v}</div></div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>VMware → Proxmox Assessment · ${esc(a.inventory.vcenter)}</title>
<style>
:root{--accent:#3b9ee8;--ink:#111;--mute:#8b8b86;--line:#e7e3da;--bg:#f3f1ea;--grid:rgba(17,17,17,.035)}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--ink);
  background-color:var(--bg);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:46px 46px}
.ic{width:20px;height:20px;color:rgba(17,17,17,.5)}
.band{padding:30px 40px 22px;border-bottom:1px solid var(--line)}
.band .brand{font-weight:800;letter-spacing:.12em;color:var(--accent);font-size:11.5px}
.band h1{margin:.4em 0 .25em;font-size:27px;font-weight:800;letter-spacing:-.03em}.band p{margin:0;color:var(--mute);font-size:13px}
.wrap{max-width:1040px;margin:0 auto 40px;padding:0 20px}
.panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px 24px;margin-top:16px}
h2{font-size:13px;color:var(--mute);text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--line);padding-bottom:8px;font-weight:700}
.score{display:flex;align-items:center;gap:20px}
.badge{width:96px;height:96px;border-radius:16px;background:#dbe8f2;display:grid;place-items:center;flex:none}
.badge .n{font-size:36px;font-weight:800;letter-spacing:-.03em;color:${scoreColor}}.badge .l{font-size:9px;color:rgba(17,17,17,.55);letter-spacing:1px;font-weight:700}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.card{border:1px solid var(--line);border-radius:16px;padding:16px;position:relative;min-height:96px}
.card .ic{position:absolute;top:15px;right:15px}
.card .k{font-size:10px;color:rgba(17,17,17,.55);text-transform:uppercase;letter-spacing:.09em;font-weight:700}.card .v{font-size:26px;font-weight:800;letter-spacing:-.03em;margin-top:8px}
.card.t0{background:#dbe8f2}.card.t1{background:#dcebdf}.card.t2{background:#f0ebcf}.card.t3{background:#f1ddd9}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #f0ede5;vertical-align:top}th{color:var(--mute);font-size:10.5px;text-transform:uppercase;font-weight:700;letter-spacing:.4px}
.pill{font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:999px;color:#fff}
.pill.blocker{background:#c8524a}.pill.warning{background:#b8892a}.pill.info{background:var(--accent)}
.rem{color:var(--mute);font-size:12px;margin-top:2px}
.savings{display:grid;grid-template-columns:1fr auto;gap:6px 20px;font-size:14px;max-width:460px}
.savings .big{font-weight:800;color:var(--ink);font-size:18px}
.foot{color:var(--mute);font-size:12px;text-align:center;margin:26px 0}
.foot a{color:var(--mute);text-decoration:underline}
@media print{body{background:#fff}}
</style></head><body>
<div class="band"><div class="brand">SOYRAGE AGENCY · MIGRATION ASSESSMENT</div><h1>VMware → Proxmox — Migration Assessment</h1>
<p>${esc(a.inventory.vcenter)} · ${esc(a.inventory.vcenterVersion)} · ${new Date().toLocaleString()}</p></div>
<div class="wrap">
  <div class="panel"><div class="score">
    <div class="badge"><div><div class="n">${a.readiness}</div><div class="l">READINESS / 100</div></div></div>
    <div><h2 style="border:0;margin:0 0 6px">${verdict(a.readiness)}</h2><p style="margin:0;color:var(--mute)">${esc(summaryText(a))}</p></div>
  </div></div>

  <div class="panel"><h2>At a glance</h2><div class="cards">
    ${card("Virtual machines", String(a.estimate.totalVms), "vm")}
    ${card("Total disk", gb(a.estimate.totalDiskGb), "disk")}
    ${card("ESXi hosts", String(a.inventory.hosts.length), "host")}
    ${card("Est. wall-clock", hours(a.estimate.wallClockHours), "clock")}
    ${card("Maintenance windows", String(a.estimate.windows), "window")}
    ${card("Annual savings", usd(s.annualSavings), "savings")}
  </div></div>

  <div class="panel"><h2>Compatibility findings — ${c.blocker} blockers · ${c.warning} warnings · ${c.info} notes</h2>
    <table><thead><tr><th>Severity</th><th>VM</th><th>Finding &amp; remediation</th></tr></thead><tbody>${findingRows}</tbody></table></div>

  <div class="panel"><h2>Licensing cost comparison</h2><div class="savings">
    <div>vSphere (annual, per-core)</div><div>${usd(s.vsphereAnnual)}</div>
    <div>Proxmox VE subscription (annual)</div><div>${usd(s.proxmoxAnnual)}</div>
    <div class="big">Annual savings</div><div class="big">${usd(s.annualSavings)}</div>
    <div>3-year savings</div><div>${usd(s.threeYearSavings)}</div>
  </div><p style="color:var(--mute);font-size:12px">Configurable assumptions — adjust per your contracts. Not a formal quote.</p></div>

  <div class="panel"><h2>Inventory (${a.inventory.vms.length} VMs)</h2>
    <table><thead><tr><th>Name</th><th>Guest OS</th><th>vCPU</th><th>RAM</th><th>Disk</th><th>Power</th><th>HW</th></tr></thead><tbody>${vmRows}</tbody></table></div>

  <div class="foot">Prepared by <a href="${BRAND.url}">${BRAND.author}</a> · ${BRAND.url} · with the open-source <a href="${BRAND.repo}">V2P toolkit</a><br/>
  Need a hand migrating? <a href="${BRAND.url}">Talk to SoyRage Agency</a>.</div>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Write all outputs
// ---------------------------------------------------------------------------

export async function writeReports(a: Assessment, config: AppConfig): Promise<ReportPaths> {
  const dir = isAbsolute(config.outDir) ? config.outDir : resolve(process.cwd(), config.outDir);
  mkdirSync(dir, { recursive: true });
  const paths: ReportPaths = {
    dir,
    pdf: resolve(dir, "assessment.pdf"),
    html: resolve(dir, "assessment.html"),
    script: resolve(dir, "migration-plan.sh"),
    json: resolve(dir, "assessment.json"),
  };
  writeFileSync(paths.html, generateHtml(a));
  writeFileSync(paths.script, renderScript(a.plan, a.inventory));
  writeFileSync(paths.json, JSON.stringify(a, null, 2));
  await writePdf(a, paths.pdf);
  return paths;
}

/** A short console summary of an assessment. */
export function consoleSummary(a: Assessment): string {
  const c = counts(a.findings);
  const lines = [
    `Readiness: ${a.readiness}/100 — ${verdict(a.readiness)}`,
    `VMs: ${a.estimate.totalVms} · Disk: ${gb(a.estimate.totalDiskGb)} · Hosts: ${a.inventory.hosts.length}`,
    `Findings: ${c.blocker} blockers, ${c.warning} warnings, ${c.info} notes`,
    `Effort: ~${hours(a.estimate.wallClockHours)} wall-clock across ${a.estimate.windows} window(s)`,
    `Savings: ${usd(a.estimate.savings.annualSavings)}/yr (${usd(a.estimate.savings.threeYearSavings)} / 3yr)`,
    "",
    "Top findings:",
    table(
      ["SEV", "VM", "FINDING"],
      a.findings.slice(0, 8).map((f) => [f.severity, f.vm, f.message.slice(0, 60)]),
    ),
  ];
  return lines.join("\n");
}
