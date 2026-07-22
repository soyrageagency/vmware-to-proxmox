/**
 * Interactive arrow-key menu — a friendly front door for people who don't live
 * in a terminal. Run `v2p menu`, use ↑/↓ and Enter.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import { ASCII_BANNER, BRAND } from "../branding.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { runAssessment } from "../core/assess.js";
import { consoleSummary, writeReports } from "../core/report.js";
import { table } from "../utils/format.js";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m", inv: "\x1b[7m",
  blue: "\x1b[38;5;39m", green: "\x1b[32m", yellow: "\x1b[33m", gray: "\x1b[90m",
};
const clear = "\x1b[2J\x1b[H";
const out = (s: string) => process.stdout.write(s);

interface Item { label: string; hint: string; run: () => Promise<boolean>; }

export function runMenu(config: AppConfig, log: Logger): void {
  const items: Item[] = [
    { label: "Run a full assessment", hint: "inventory → compatibility → cost/time → PDF + plan", run: () => doAssess(config, log) },
    { label: "Show the inventory", hint: "list the VMs discovered in vCenter", run: () => doInventory(config, log) },
    { label: "Launch the web UI", hint: "point-and-click in your browser", run: () => doWeb(config, log) },
    { label: "Quit", hint: "", run: async () => true },
  ];
  let sel = 0;

  const render = () => {
    out(clear);
    out(`${C.blue}${ASCII_BANNER}${C.reset}\n`);
    out(`  ${C.bold}What would you like to do?${C.reset}   ${C.dim}(↑/↓ to move, Enter to choose)${C.reset}\n`);
    if (config.demo) out(`  ${C.yellow}DEMO mode — using a fabricated vCenter.${C.reset}\n`);
    out("\n");
    items.forEach((it, i) => {
      const active = i === sel;
      const bullet = active ? `${C.green}❯${C.reset}` : " ";
      const label = active ? `${C.inv} ${it.label} ${C.reset}` : `  ${it.label}`;
      out(`  ${bullet} ${label}   ${C.gray}${it.hint}${C.reset}\n`);
    });
    out(`\n  ${C.gray}${BRAND.author} · ${BRAND.url} · ${BRAND.donate}${C.reset}\n`);
  };

  const stdin = process.stdin;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let busy = false;
  render();

  stdin.on("data", async (key: string) => {
    if (busy) return;
    if (key === "\x03" || key === "q") return quit();
    if (key === "\x1b[A" || key === "k") { sel = (sel - 1 + items.length) % items.length; render(); return; }
    if (key === "\x1b[B" || key === "j") { sel = (sel + 1) % items.length; render(); return; }
    if (key === "\r" || key === "\n") {
      busy = true;
      if (stdin.isTTY) stdin.setRawMode(false);
      out(clear);
      const done = await items[sel].run();
      if (done) return quit();
      out(`\n  ${C.dim}Press any key to return to the menu…${C.reset}`);
      if (stdin.isTTY) stdin.setRawMode(true);
      busy = false;
      const once = () => { stdin.removeListener("data", once); render(); };
      stdin.once("data", once);
    }
  });
}

function quit(): never {
  process.stdout.write(`\n  ${C.green}Thanks for using ${BRAND.short}!${C.reset} A ★ helps: ${C.blue}${BRAND.repo}${C.reset}\n\n`);
  process.exit(0);
}

async function doAssess(config: AppConfig, log: Logger): Promise<boolean> {
  out(`${C.dim}Gathering inventory…${C.reset}\n`);
  const a = await runAssessment(config, log);
  out("\n" + consoleSummary(a) + "\n\n");
  out(`${C.dim}Writing reports…${C.reset}\n`);
  const p = await writeReports(a, config);
  out(`${C.green}✓ Done.${C.reset} Open ${C.bold}${p.pdf}${C.reset}\n`);
  out(`  Also: assessment.html · migration-plan.sh · assessment.json  (in ${p.dir})\n`);
  return false;
}

async function doInventory(config: AppConfig, log: Logger): Promise<boolean> {
  const a = await runAssessment(config, log);
  out(table(
    ["VMID", "NAME", "GUEST OS", "vCPU", "RAM(GB)", "DISK(GB)", "POWER"],
    a.inventory.vms.map((v) => [v.id, v.name, v.guestOs, String(v.cpu), String(Math.round(v.memoryMb / 1024)), String(v.disks.reduce((s, d) => s + d.sizeGb, 0)), v.powerState]),
  ) + "\n");
  return false;
}

async function doWeb(config: AppConfig, log: Logger): Promise<boolean> {
  const { startWeb } = await import("../web/server.js");
  await startWeb(config, log);
  out(`\n  ${C.green}Web UI running${C.reset} at ${C.blue}http://${config.webHost}:${config.webPort}${C.reset}  ${C.dim}— press Ctrl-C to stop.${C.reset}\n`);
  // startWeb resolves as soon as the server is listening; park here so the
  // process stays alive (and the menu doesn't quit) until the user hits Ctrl-C.
  await new Promise<void>(() => {});
  return true; // unreachable
}
