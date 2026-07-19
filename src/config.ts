/**
 * Runtime configuration.
 *
 * Driven by environment variables (a local `.env` is loaded automatically) so
 * the same binary runs unattended in CI or interactively on a laptop.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { LogLevel } from "./logger.js";

function loadDotEnv(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

const flag = (n: string, d = false): boolean => {
  const v = process.env[n];
  return v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(v.trim());
};
const str = (n: string, d = ""): string => (process.env[n] ?? d).trim();
const num = (n: string, d: number): number => {
  const v = Number(process.env[n]);
  return Number.isFinite(v) && v > 0 ? v : d;
};

/** Fully-resolved, immutable configuration. */
export interface AppConfig {
  /** vCenter base URL, e.g. https://vcenter.corp.local */
  readonly vcenter: string;
  readonly vcUser: string;
  readonly vcPassword: string;
  /** Verify the vCenter TLS certificate (usually self-signed). */
  readonly verifyTls: boolean;
  /** Serve realistic demo data instead of a live vCenter. */
  readonly demo: boolean;
  /** Where reports and plans are written. */
  readonly outDir: string;
  /** Assumed migration throughput per disk (MB/s) for time estimates. */
  readonly throughputMbps: number;
  /** Parallel migration streams (VMs migrated concurrently). */
  readonly parallelStreams: number;
  /** Annual vSphere cost per CPU core (for savings estimate, USD). */
  readonly vspherePerCore: number;
  /** Annual Proxmox subscription per socket (USD). */
  readonly proxmoxPerSocket: number;
  /** Web UI bind host/port. */
  readonly webHost: string;
  readonly webPort: number;
  readonly logLevel: LogLevel;
}

export function loadConfig(): AppConfig {
  loadDotEnv();
  const level = str("V2P_LOG_LEVEL", "info").toLowerCase();
  const logLevel: LogLevel = ["debug", "info", "warn", "error"].includes(level) ? (level as LogLevel) : "info";
  let vcenter = str("VCENTER_HOST");
  if (vcenter && !/^https?:\/\//i.test(vcenter)) vcenter = `https://${vcenter}`;
  vcenter = vcenter.replace(/\/+$/, "");

  return Object.freeze({
    vcenter,
    vcUser: str("VCENTER_USER"),
    vcPassword: str("VCENTER_PASSWORD"),
    verifyTls: flag("VCENTER_VERIFY_TLS", false),
    demo: flag("V2P_DEMO", false),
    outDir: str("V2P_OUT_DIR", "./assessment"),
    throughputMbps: num("V2P_THROUGHPUT_MBPS", 250),
    parallelStreams: num("V2P_PARALLEL", 2),
    vspherePerCore: num("V2P_VSPHERE_PER_CORE", 350),
    proxmoxPerSocket: num("V2P_PROXMOX_PER_SOCKET", 620),
    webHost: str("V2P_WEB_HOST", "127.0.0.1"),
    webPort: num("V2P_WEB_PORT", 4700),
    logLevel,
  });
}
