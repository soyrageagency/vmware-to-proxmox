/**
 * Domain types shared across the toolkit.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

/** A virtual disk attached to a VM. */
export interface VmDisk {
  label: string;
  sizeGb: number;
  thin: boolean;
  controller: string; // e.g. "SCSI (paravirtual)", "NVMe", "IDE"
  datastore: string;
  rdm: boolean; // raw device mapping (a migration blocker)
}

/** A VMware virtual machine. */
export interface Vm {
  id: string;
  name: string;
  powerState: "poweredOn" | "poweredOff" | "suspended";
  guestOs: string;
  hardwareVersion: number; // e.g. 19 (vmx-19)
  toolsStatus: "toolsOk" | "toolsOld" | "toolsNotInstalled";
  cpu: number;
  memoryMb: number;
  disks: VmDisk[];
  nics: number;
  snapshots: number;
  host: string;
  encrypted: boolean;
  secureBoot: boolean;
  vTpm: boolean;
  faultTolerance: boolean;
  notes: string;
}

/** An ESXi host. */
export interface Host {
  name: string;
  cluster: string;
  cpuModel: string;
  sockets: number;
  cores: number; // total cores
  memGb: number;
  esxiVersion: string;
}

/** A datastore. */
export interface Datastore {
  name: string;
  type: string; // VMFS, NFS, vSAN…
  capacityGb: number;
  freeGb: number;
}

/** A full normalised inventory of a vCenter. */
export interface Inventory {
  vcenter: string;
  vcenterVersion: string;
  gatheredAt: string;
  hosts: Host[];
  datastores: Datastore[];
  vms: Vm[];
}

/** A compatibility finding for a VM (or the environment). */
export interface Finding {
  vm: string; // VM name or "environment"
  severity: "blocker" | "warning" | "info";
  rule: string;
  message: string;
  remediation: string;
}

/** Cost & time estimate. */
export interface Estimate {
  totalVms: number;
  totalDiskGb: number;
  perVmMinutes: Array<{ vm: string; minutes: number; diskGb: number }>;
  totalHours: number;
  wallClockHours: number; // with parallel streams
  windows: number; // number of maintenance windows (assuming a window length)
  savings: {
    vsphereAnnual: number;
    proxmoxAnnual: number;
    annualSavings: number;
    threeYearSavings: number;
  };
}

/** A per-VM migration plan step. */
export interface PlanStep {
  vm: string;
  targetVmid: number;
  commands: string[];
  notes: string[];
}

/** The complete assessment. */
export interface Assessment {
  inventory: Inventory;
  findings: Finding[];
  estimate: Estimate;
  plan: PlanStep[];
  readiness: number; // 0..100 score
}
