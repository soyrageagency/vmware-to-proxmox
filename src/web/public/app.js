/*
 * V2P web UI — front-end logic (vanilla JS, no build step).
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Attribution must remain intact (see LICENSE).
 */
"use strict";
const $ = (s) => document.querySelector(s);

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function gb(n) { return n >= 1024 ? (n / 1024).toFixed(1) + " TB" : Math.round(n) + " GB"; }
function hrs(h) { return h < 24 ? h + " h" : Math.floor(h / 24) + " d " + Math.round(h % 24) + " h"; }
function verdict(s) { return s >= 85 ? "Low-risk migration" : s >= 65 ? "Moderate — a few items first" : s >= 40 ? "Significant prep needed" : "High-risk — plan carefully"; }
function scoreColor(s) { return s >= 85 ? "var(--green)" : s >= 65 ? "var(--amber)" : "var(--red)"; }

// Custom, hand-drawn line icons (no icon library).
const IP = {
  vm: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  disk: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  host: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
  savings: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.4c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.5-2.5 1.8-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7"/>',
};
const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${IP[n] || ""}</svg>`;

async function init() {
  try {
    const m = await (await fetch("/api/meta")).json();
    $("#src").textContent = m.vcenter || "—";
    if (m.demo) $("#demo").classList.remove("hidden");
  } catch {}
  $("#run").addEventListener("click", run);
}

async function run() {
  const btn = $("#run");
  btn.disabled = true;
  $("#loading").classList.remove("hidden");
  try {
    const r = await fetch("/api/assess");
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    render(await r.json());
    $("#landing").classList.add("hidden");
    $("#results").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    alert("Assessment failed: " + e.message + "\nTip: launch with --demo to try it without a vCenter.");
  } finally {
    btn.disabled = false;
    $("#loading").classList.add("hidden");
  }
}

function render(a) {
  const s = a.estimate.savings;
  $("#score").textContent = a.readiness;
  $("#score").style.color = scoreColor(a.readiness);
  $("#verdict").textContent = verdict(a.readiness);
  const c = a.findings.reduce((o, f) => (o[f.severity]++, o), { blocker: 0, warning: 0, info: 0 });
  $("#summary").textContent = `${a.inventory.vms.length} VMs · ${gb(a.estimate.totalDiskGb)} disk · ${a.inventory.hosts} hosts · ${c.blocker} blockers, ${c.warning} warnings.`;

  const cards = [
    ["Virtual machines", a.estimate.totalVms, "vm"],
    ["Total disk", gb(a.estimate.totalDiskGb), "disk"],
    ["ESXi hosts", a.inventory.hosts, "host"],
    ["Est. wall-clock", hrs(a.estimate.wallClockHours), "clock"],
    ["Maintenance windows", a.estimate.windows, "window"],
    ["Annual savings", usd(s.annualSavings), "savings"],
  ];
  $("#cards").innerHTML = cards.map(([k, v, ic], i) => `<div class="card t${i % 4}">${icon(ic)}<div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  $("#fcount").textContent = `${c.blocker} blockers · ${c.warning} warnings · ${c.info} notes`;
  $("#findings").innerHTML = a.findings.map((f) =>
    `<tr><td><span class="pill ${f.severity}">${f.severity}</span></td><td class="mono">${esc(f.vm)}</td><td>${esc(f.message)}<div class="rem">→ ${esc(f.remediation)}</div></td></tr>`).join("");

  $("#vcount").textContent = `${a.inventory.vms.length} VMs`;
  $("#inventory").innerHTML = a.inventory.vms.map((v) =>
    `<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.os)}</td><td>${v.cpu}</td><td>${v.ramGb} GB</td><td>${v.diskGb} GB</td><td>${esc(v.power)}</td></tr>`).join("");
}

init();
