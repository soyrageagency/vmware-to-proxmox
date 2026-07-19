/**
 * Cost & time estimation.
 *
 * Estimates the migration effort (per-VM conversion time, wall-clock with
 * parallel streams, number of maintenance windows) and the licensing savings
 * of leaving vSphere for Proxmox. All assumptions come from config so they can
 * be tuned per engagement.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import type { AppConfig } from "../config.js";
import type { Estimate, Inventory } from "./types.js";

/** Hours per maintenance window (used to count windows). */
const WINDOW_HOURS = 6;
/** Fixed per-VM overhead (config, boot test, driver install), minutes. */
const PER_VM_OVERHEAD_MIN = 15;

export function estimate(inv: Inventory, config: AppConfig): Estimate {
  const perVmMinutes = inv.vms.map((vm) => {
    const diskGb = vm.disks.filter((d) => !d.rdm).reduce((s, d) => s + d.sizeGb, 0);
    // time = data / throughput. MB / (MB/s) = s → /60 = minutes.
    const transferMin = (diskGb * 1024) / config.throughputMbps / 60;
    return { vm: vm.name, minutes: Math.round(transferMin + PER_VM_OVERHEAD_MIN), diskGb };
  });

  const totalDiskGb = perVmMinutes.reduce((s, v) => s + v.diskGb, 0);
  const totalMinutes = perVmMinutes.reduce((s, v) => s + v.minutes, 0);
  const totalHours = round(totalMinutes / 60);
  const wallClockHours = round(totalHours / Math.max(1, config.parallelStreams));
  const windows = Math.max(1, Math.ceil(wallClockHours / WINDOW_HOURS));

  const totalCores = inv.hosts.reduce((s, h) => s + h.cores, 0);
  const totalSockets = inv.hosts.reduce((s, h) => s + h.sockets, 0);
  const vsphereAnnual = totalCores * config.vspherePerCore;
  const proxmoxAnnual = totalSockets * config.proxmoxPerSocket;
  const annualSavings = vsphereAnnual - proxmoxAnnual;

  return {
    totalVms: inv.vms.length,
    totalDiskGb,
    perVmMinutes,
    totalHours,
    wallClockHours,
    windows,
    savings: {
      vsphereAnnual,
      proxmoxAnnual,
      annualSavings,
      threeYearSavings: annualSavings * 3,
    },
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
