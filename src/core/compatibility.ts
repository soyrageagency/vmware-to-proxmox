/**
 * Compatibility analysis.
 *
 * A rules engine that inspects every VM and flags things that need attention
 * before a VMware → Proxmox migration: RDMs, VM encryption, Fault Tolerance,
 * snapshots, missing tools, vTPM/Secure Boot, Windows driver needs, etc. Each
 * finding carries a severity and a concrete remediation.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import type { Finding, Inventory, Vm } from "./types.js";

const SEVERITY_COST = { blocker: 15, warning: 5, info: 1 } as const;

/** Run the rules over an inventory and return all findings. */
export function analyze(inv: Inventory): Finding[] {
  const findings: Finding[] = [];
  for (const vm of inv.vms) findings.push(...analyzeVm(vm));
  findings.push(...analyzeEnvironment(inv));
  // Blockers first, then warnings, then info.
  const order = { blocker: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

function analyzeVm(vm: Vm): Finding[] {
  const f: Finding[] = [];
  const add = (severity: Finding["severity"], rule: string, message: string, remediation: string) =>
    f.push({ vm: vm.name, severity, rule, message, remediation });

  if (vm.disks.some((d) => d.rdm)) {
    add("blocker", "rdm", "Uses a Raw Device Mapping (RDM) disk.",
      "RDMs can't be converted like a VMDK. Present the LUN directly to Proxmox (passthrough), or migrate the data to a new virtio disk.");
  }
  if (vm.encrypted) {
    add("blocker", "vm-encryption", "VM encryption is enabled.",
      "Decrypt the VM in vSphere (remove the encryption storage policy) before exporting — encrypted VMDKs cannot be converted.");
  }
  if (vm.faultTolerance) {
    add("blocker", "fault-tolerance", "VMware Fault Tolerance is enabled.",
      "Proxmox has no FT equivalent. Turn FT off, then rely on Proxmox HA + storage replication for availability.");
  }
  if (vm.powerState === "suspended") {
    add("warning", "suspended", "VM is suspended.",
      "Suspended memory state can't be migrated. Resume and shut the guest down cleanly before converting.");
  }
  if (vm.snapshots > 0) {
    add("warning", "snapshots", `${vm.snapshots} snapshot(s) present.`,
      "Consolidate/delete snapshots before migration so you convert a single flat disk.");
  }
  if (vm.toolsStatus === "toolsNotInstalled") {
    add("warning", "guest-agent", "VMware Tools not installed.",
      "After migration install the QEMU guest agent for graceful shutdown, IP reporting and fsfreeze backups.");
  } else if (vm.toolsStatus === "toolsOld") {
    add("info", "guest-agent", "VMware Tools is out of date.",
      "Fine to migrate; install the QEMU guest agent afterwards.");
  }
  if (vm.hardwareVersion > 0 && vm.hardwareVersion < 9) {
    add("warning", "old-hardware", `Very old virtual hardware (vmx-${vm.hardwareVersion}).`,
      "Old VMs often run legacy controllers/BIOS. Convert with an IDE/SATA bus first, then switch to VirtIO once booted.");
  }
  if (vm.vTpm) {
    add("warning", "vtpm", "Virtual TPM (vTPM) is attached.",
      "Proxmox supports a TPM via swtpm — re-add a TPM State device. For BitLocker Windows guests, have the recovery key ready.");
  }
  if (vm.secureBoot) {
    add("info", "secure-boot", "Secure Boot is enabled.",
      "Supported on Proxmox with an OVMF (UEFI) BIOS and a matching EFI disk.");
  }
  if (/windows/i.test(vm.guestOs)) {
    add("info", "windows-virtio", "Windows guest — needs VirtIO drivers.",
      "Attach the virtio-win ISO and install storage/network drivers (or start on IDE/E1000, then switch to VirtIO).");
  }
  const bigDisk = vm.disks.find((d) => d.sizeGb >= 2000 && !d.rdm);
  if (bigDisk) {
    add("info", "large-disk", `Large disk (${bigDisk.sizeGb} GB) — longer conversion window.`,
      "Plan a longer maintenance window, or pre-seed the data and do a final delta.");
  }
  if (vm.disks.some((d) => d.controller === "IDE")) {
    add("info", "ide-controller", "Uses an IDE controller.",
      "Import as SATA/IDE for first boot, then move to VirtIO SCSI for best performance.");
  }
  return f;
}

function analyzeEnvironment(inv: Inventory): Finding[] {
  const f: Finding[] = [];
  const rdmDs = inv.datastores.filter((d) => /rdm/i.test(d.type));
  if (rdmDs.length) {
    f.push({
      vm: "environment", severity: "info", rule: "rdm-storage",
      message: `${rdmDs.length} raw-LUN datastore(s) detected.`,
      remediation: "Decide per LUN: passthrough to Proxmox, or migrate data onto Proxmox-native storage (ZFS/Ceph/LVM-Thin).",
    });
  }
  const totalVmMem = inv.vms.reduce((s, v) => s + v.memoryMb, 0) / 1024;
  f.push({
    vm: "environment", severity: "info", rule: "sizing",
    message: `Workload needs ~${Math.round(totalVmMem)} GB RAM across ${inv.vms.length} VMs.`,
    remediation: "Size the Proxmox cluster with headroom (N+1) and matching CPU cores; plan networking and shared storage first.",
  });
  return f;
}

/** A 0–100 readiness score derived from the findings. */
export function readinessScore(findings: Finding[]): number {
  const penalty = findings.reduce((s, f) => s + SEVERITY_COST[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}
