#!/usr/bin/env node
/**
 * V2P — VMware to Proxmox Migration Toolkit — entry point / CLI router.
 *
 * Commands:
 *   assess      run the full assessment and write the PDF/HTML/plan (default)
 *   inventory   print the discovered inventory
 *   menu        interactive, arrow-key menu (for non-CLI folks)
 *   web         launch the click-through web UI
 *   help        show this help
 *
 * Add --demo to run against a fabricated vCenter (no credentials needed).
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import { ASCII_BANNER, BRAND } from "./branding.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { runAssessment } from "./core/assess.js";
import { consoleSummary, writeReports } from "./core/report.js";
import { table } from "./utils/format.js";

const argv = process.argv.slice(2);
if (argv.includes("--demo")) process.env.V2P_DEMO = "true";
const command = (argv.find((a) => !a.startsWith("-")) || "assess").toLowerCase();

const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  blue: "\x1b[38;5;39m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
};
const say = (s = "") => process.stdout.write(s + "\n");

async function main(): Promise<void> {
  const config = loadConfig();
  const log = new Logger(config.logLevel);

  if (command === "help" || argv.includes("-h") || argv.includes("--help")) return printHelp();

  if (command === "menu") { const { runMenu } = await import("./menu/menu.js"); return runMenu(config, log); }
  if (command === "web") { const { startWeb } = await import("./web/server.js"); await startWeb(config, log); return; }

  // assess / inventory / report
  say(`${c.blue}${c.bold}  ${BRAND.short}${c.reset} ${c.dim}— VMware → Proxmox assessment · by ${BRAND.author}${c.reset}`);
  say();
  say(`${c.dim}Gathering inventory from ${config.demo ? "DEMO vCenter" : config.vcenter || "(vCenter not set)"}…${c.reset}`);
  const assessment = await runAssessment(config, log);

  if (command === "inventory") {
    say();
    say(table(
      ["VMID", "NAME", "GUEST OS", "vCPU", "RAM(GB)", "DISK(GB)", "POWER"],
      assessment.inventory.vms.map((v) => [
        v.id, v.name, v.guestOs, String(v.cpu), String(Math.round(v.memoryMb / 1024)),
        String(v.disks.reduce((s, d) => s + d.sizeGb, 0)), v.powerState,
      ]),
    ));
    return;
  }

  // assess (default) + report
  say();
  say(consoleSummary(assessment));
  say();
  say(`${c.dim}Writing reports…${c.reset}`);
  const paths = await writeReports(assessment, config);
  say();
  say(`${c.green}✓ Assessment complete.${c.reset}  Files written to ${c.bold}${paths.dir}${c.reset}:`);
  say(`   • ${c.bold}assessment.pdf${c.reset}   ${c.dim}— the client-ready PDF report${c.reset}`);
  say(`   • assessment.html  ${c.dim}— rich interactive report (open in a browser)${c.reset}`);
  say(`   • migration-plan.sh ${c.dim}— per-VM Proxmox runbook (review before running)${c.reset}`);
  say(`   • assessment.json  ${c.dim}— raw data${c.reset}`);
  say();
  say(`  ${c.yellow}Need help migrating?${c.reset} ${c.blue}${BRAND.url}${c.reset}  ·  ${c.yellow}Support:${c.reset} ${c.blue}${BRAND.donate}${c.reset}`);
}

function printHelp(): void {
  process.stderr.write(ASCII_BANNER + "\n");
  say(`${c.bold}${BRAND.product}${c.reset}  v${BRAND.version}`);
  say(`${c.dim}${BRAND.tagline}${c.reset}`);
  say();
  say(`${c.bold}Usage:${c.reset} v2p <command> [--demo]`);
  say();
  say("  assess      run the full assessment → PDF + HTML + migration plan  (default)");
  say("  inventory   print the discovered vCenter inventory");
  say("  menu        interactive, arrow-key menu (great for first-timers)");
  say("  web         launch the click-through web UI");
  say("  help        show this help");
  say();
  say(`${c.dim}Try it with no vCenter:${c.reset}  ${c.bold}v2p assess --demo${c.reset}   or   ${c.bold}v2p web --demo${c.reset}`);
  say();
  say(`  ${BRAND.author} · ${BRAND.url} · ${BRAND.donate}`);
}

main().catch((err) => {
  process.stderr.write(`\n\x1b[31m✗ ${err instanceof Error ? err.message : err}\x1b[0m\n`);
  process.stderr.write(`\x1b[2mTip: try 'v2p assess --demo' to explore without a vCenter.\x1b[0m\n`);
  process.exit(1);
});
