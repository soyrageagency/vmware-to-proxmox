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
    ["Virtual machines", a.estimate.totalVms],
    ["Total disk", gb(a.estimate.totalDiskGb)],
    ["ESXi hosts", a.inventory.hosts],
    ["Est. wall-clock", hrs(a.estimate.wallClockHours)],
    ["Maintenance windows", a.estimate.windows],
    ["Annual savings", usd(s.annualSavings)],
  ];
  $("#cards").innerHTML = cards.map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  $("#fcount").textContent = `${c.blocker} blockers · ${c.warning} warnings · ${c.info} notes`;
  $("#findings").innerHTML = a.findings.map((f) =>
    `<tr><td><span class="pill ${f.severity}">${f.severity}</span></td><td class="mono">${esc(f.vm)}</td><td>${esc(f.message)}<div class="rem">→ ${esc(f.remediation)}</div></td></tr>`).join("");

  $("#vcount").textContent = `${a.inventory.vms.length} VMs`;
  $("#inventory").innerHTML = a.inventory.vms.map((v) =>
    `<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.os)}</td><td>${v.cpu}</td><td>${v.ramGb} GB</td><td>${v.diskGb} GB</td><td>${esc(v.power)}</td></tr>`).join("");
}

init();
