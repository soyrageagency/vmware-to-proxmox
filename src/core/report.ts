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
  const card = (k: string, v: string) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>VMware → Proxmox Assessment · ${esc(a.inventory.vcenter)}</title>
<style>
:root{--accent:${ACCENT};--ink:${INK};--mute:${MUTE}}
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--ink);background:#f4f7fb}
.band{background:var(--accent);color:#fff;padding:28px 40px}
.band h1{margin:0;font-size:24px}.band p{margin:4px 0 0;opacity:.9}
.wrap{max-width:1040px;margin:-28px auto 40px;padding:0 20px}
.panel{background:#fff;border:1px solid #e4eaf1;border-radius:14px;padding:22px 24px;margin-top:22px;box-shadow:0 6px 24px rgba(20,30,50,.05)}
h2{font-size:16px;color:var(--accent);border-bottom:1px solid #e6ecf3;padding-bottom:8px}
.score{display:flex;align-items:center;gap:20px}
.badge{width:96px;height:96px;border-radius:16px;background:#f3f6fa;display:grid;place-items:center;flex:none}
.badge .n{font-size:34px;font-weight:800;color:${scoreColor}}.badge .l{font-size:9px;color:var(--mute);letter-spacing:1px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.card{background:#f7f9fc;border-radius:10px;padding:14px 16px}.card .k{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.5px}.card .v{font-size:22px;font-weight:700;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #eef2f7;vertical-align:top}th{color:var(--mute);font-size:11px;text-transform:uppercase}
.pill{font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:999px;color:#fff}
.pill.blocker{background:#e0483f}.pill.warning{background:#d99a20}.pill.info{background:#2f97ee}
.rem{color:var(--mute);font-size:12px;margin-top:2px}
.savings{display:grid;grid-template-columns:1fr auto;gap:6px 20px;font-size:14px;max-width:460px}
.savings .big{font-weight:800;color:${scoreColor};font-size:18px}
.foot{color:var(--mute);font-size:12px;text-align:center;margin:26px 0}
.foot a{color:var(--accent);text-decoration:none}
</style></head><body>
<div class="band"><h1>VMware → Proxmox — Migration Assessment</h1>
<p>${esc(a.inventory.vcenter)} · ${esc(a.inventory.vcenterVersion)} · ${new Date().toLocaleString()}</p></div>
<div class="wrap">
  <div class="panel"><div class="score">
    <div class="badge"><div><div class="n">${a.readiness}</div><div class="l">READINESS / 100</div></div></div>
    <div><h2 style="border:0;margin:0 0 6px">${verdict(a.readiness)}</h2><p style="margin:0;color:var(--mute)">${esc(summaryText(a))}</p></div>
  </div></div>

  <div class="panel"><h2>At a glance</h2><div class="cards">
    ${card("Virtual machines", String(a.estimate.totalVms))}
    ${card("Total disk", gb(a.estimate.totalDiskGb))}
    ${card("ESXi hosts", String(a.inventory.hosts.length))}
    ${card("Est. wall-clock", hours(a.estimate.wallClockHours))}
    ${card("Maintenance windows", String(a.estimate.windows))}
    ${card("Annual savings", usd(s.annualSavings))}
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
