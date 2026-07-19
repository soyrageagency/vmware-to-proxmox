/**
 * Smoke test — runs the full assessment in demo mode and checks the outputs
 * (PDF/HTML/plan/JSON) plus the web API. No vCenter required.
 *
 * Crafted by SoyRage Agency — https://soyrage.es/
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync, statSync, readFileSync, rmSync } from "node:fs";

const results = [];
const ok = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });
const env = { ...process.env, V2P_DEMO: "true", V2P_OUT_DIR: "./.smoke-out", V2P_LOG_LEVEL: "error" };

// 1) CLI assess writes all four artefacts.
rmSync("./.smoke-out", { recursive: true, force: true });
const r = spawnSync("node", ["dist/index.js", "assess"], { env, encoding: "utf8" });
ok("assess exits 0", r.status === 0, r.stderr?.slice(0, 200));
ok("PDF written & valid", existsSync("./.smoke-out/assessment.pdf") && readFileSync("./.smoke-out/assessment.pdf").slice(0, 5).toString() === "%PDF-");
ok("HTML written", existsSync("./.smoke-out/assessment.html") && readFileSync("./.smoke-out/assessment.html", "utf8").includes("Migration Assessment"));
ok("runbook written", existsSync("./.smoke-out/migration-plan.sh") && readFileSync("./.smoke-out/migration-plan.sh", "utf8").includes("qm importdisk"));
const json = existsSync("./.smoke-out/assessment.json") ? JSON.parse(readFileSync("./.smoke-out/assessment.json", "utf8")) : null;
ok("JSON has assessment shape", json && typeof json.readiness === "number" && Array.isArray(json.findings) && json.inventory.vms.length > 0);
ok("finds the RDM blocker", json?.findings?.some((f) => f.rule === "rdm" && f.severity === "blocker"));
ok("finds encryption blocker", json?.findings?.some((f) => f.rule === "vm-encryption"));
ok("estimates savings", json?.estimate?.savings?.annualSavings > 0);
ok("PDF non-trivial size", existsSync("./.smoke-out/assessment.pdf") && statSync("./.smoke-out/assessment.pdf").size > 2000);
rmSync("./.smoke-out", { recursive: true, force: true });

// 2) inventory command works.
const inv = spawnSync("node", ["dist/index.js", "inventory"], { env: { ...env, V2P_OUT_DIR: "./.smoke-out2" }, encoding: "utf8" });
ok("inventory prints VMs", inv.status === 0 && /web-prod-01/.test(inv.stdout));
rmSync("./.smoke-out2", { recursive: true, force: true });

// 3) web API responds.
const web = spawn("node", ["dist/index.js", "web"], { env: { ...env, V2P_WEB_PORT: "4788", V2P_OUT_DIR: "./.smoke-web" }, stdio: "ignore" });
await new Promise((res) => setTimeout(res, 300));
let up = false, assessOk = false;
for (let i = 0; i < 40; i++) { try { const m = await fetch("http://127.0.0.1:4788/api/meta"); if (m.ok) { up = true; break; } } catch {} await new Promise((r) => setTimeout(r, 150)); }
ok("web /api/meta responds", up);
if (up) { const a = await (await fetch("http://127.0.0.1:4788/api/assess")).json(); assessOk = typeof a.readiness === "number" && a.findings.length > 0; }
ok("web /api/assess returns results", assessOk);
web.kill();
rmSync("./.smoke-web", { recursive: true, force: true });

let pass = 0, fail = 0;
for (const t of results) { if (t.ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${t.name}`); } else { fail++; console.log(`  \x1b[31m✗ ${t.name}\x1b[0m  ${t.detail}`); } }
console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
