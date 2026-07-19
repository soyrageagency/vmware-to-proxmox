/**
 * Demo vCenter inventory — a believable mid-sized vSphere estate that exercises
 * every compatibility rule, so the toolkit can be run and demoed without a
 * live vCenter (V2P_DEMO=true).
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import type { Inventory, Vm, VmDisk } from "../core/types.js";

function disk(label: string, sizeGb: number, opts: Partial<VmDisk> = {}): VmDisk {
  return { label, sizeGb, thin: true, controller: "SCSI (paravirtual)", datastore: "vmfs-gold", rdm: false, ...opts };
}

function vm(v: Partial<Vm> & Pick<Vm, "id" | "name">): Vm {
  return {
    powerState: "poweredOn",
    guestOs: "Debian Linux",
    hardwareVersion: 19,
    toolsStatus: "toolsOk",
    cpu: 2,
    memoryMb: 4096,
    disks: [disk("Hard disk 1", 40)],
    nics: 1,
    snapshots: 0,
    host: "esxi-01",
    encrypted: false,
    secureBoot: false,
    vTpm: false,
    faultTolerance: false,
    notes: "",
    ...v,
  };
}

export function demoInventory(): Inventory {
  const vms: Vm[] = [
    vm({ id: "vm-101", name: "web-prod-01", cpu: 4, memoryMb: 8192, disks: [disk("Hard disk 1", 60)], host: "esxi-01" }),
    vm({ id: "vm-102", name: "web-prod-02", cpu: 4, memoryMb: 8192, disks: [disk("Hard disk 1", 60)], host: "esxi-02" }),
    vm({
      id: "vm-110", name: "db-postgres-01", cpu: 8, memoryMb: 32768, host: "esxi-01",
      disks: [disk("Hard disk 1", 80), disk("Hard disk 2", 500, { datastore: "vmfs-fast" })],
      snapshots: 2, notes: "2 old snapshots present",
    }),
    vm({
      id: "vm-120", name: "fileserver-win", guestOs: "Windows Server 2019", cpu: 4, memoryMb: 16384, host: "esxi-02",
      disks: [disk("Hard disk 1", 100), disk("Hard disk 2", 2000, { controller: "SCSI (LSI Logic SAS)", datastore: "vmfs-bulk" })],
      toolsStatus: "toolsOld",
    }),
    vm({
      id: "vm-130", name: "win11-vdi-tpl", guestOs: "Windows 11", cpu: 4, memoryMb: 8192, host: "esxi-03",
      disks: [disk("Hard disk 1", 128)], secureBoot: true, vTpm: true, hardwareVersion: 20,
      notes: "vTPM + Secure Boot",
    }),
    vm({
      id: "vm-140", name: "legacy-erp", guestOs: "CentOS", cpu: 2, memoryMb: 6144, host: "esxi-03",
      disks: [disk("Hard disk 1", 120, { controller: "IDE" })], hardwareVersion: 8,
      toolsStatus: "toolsNotInstalled", notes: "Very old VM (hw v8)",
    }),
    vm({
      id: "vm-150", name: "san-passthrough", guestOs: "Red Hat Enterprise Linux", cpu: 8, memoryMb: 24576, host: "esxi-01",
      disks: [disk("Hard disk 1", 60), disk("Hard disk 2 (RDM)", 4000, { rdm: true, datastore: "raw-lun-3" })],
      notes: "Uses a raw device mapping",
    }),
    vm({
      id: "vm-160", name: "secure-vault", guestOs: "Ubuntu Linux", cpu: 2, memoryMb: 4096, host: "esxi-02",
      disks: [disk("Hard disk 1", 50)], encrypted: true, notes: "VM encryption enabled",
    }),
    vm({
      id: "vm-170", name: "ft-payments", guestOs: "Red Hat Enterprise Linux", cpu: 4, memoryMb: 8192, host: "esxi-01",
      disks: [disk("Hard disk 1", 80)], faultTolerance: true, notes: "Fault Tolerance enabled",
    }),
    vm({ id: "vm-180", name: "build-agent-01", cpu: 8, memoryMb: 16384, host: "esxi-03", disks: [disk("Hard disk 1", 200)], powerState: "poweredOff" }),
    vm({ id: "vm-190", name: "monitoring", guestOs: "Debian Linux", cpu: 4, memoryMb: 8192, host: "esxi-02", disks: [disk("Hard disk 1", 100)] }),
    vm({ id: "vm-200", name: "dev-sandbox", guestOs: "Ubuntu Linux", cpu: 2, memoryMb: 4096, host: "esxi-03", disks: [disk("Hard disk 1", 40)], powerState: "suspended", notes: "Suspended" }),
  ];

  return {
    vcenter: "https://vcenter.soyrage-lab.local",
    vcenterVersion: "vCenter Server 7.0 U3",
    gatheredAt: new Date().toISOString(),
    hosts: [
      { name: "esxi-01", cluster: "Cluster-Prod", cpuModel: "Intel Xeon Gold 6338 (2.0 GHz)", sockets: 2, cores: 64, memGb: 512, esxiVersion: "ESXi 7.0 U3" },
      { name: "esxi-02", cluster: "Cluster-Prod", cpuModel: "Intel Xeon Gold 6338 (2.0 GHz)", sockets: 2, cores: 64, memGb: 512, esxiVersion: "ESXi 7.0 U3" },
      { name: "esxi-03", cluster: "Cluster-Prod", cpuModel: "AMD EPYC 7543 (2.8 GHz)", sockets: 2, cores: 64, memGb: 384, esxiVersion: "ESXi 7.0 U3" },
    ],
    datastores: [
      { name: "vmfs-gold", type: "VMFS 6", capacityGb: 8000, freeGb: 3200 },
      { name: "vmfs-fast", type: "VMFS 6 (NVMe)", capacityGb: 4000, freeGb: 1500 },
      { name: "vmfs-bulk", type: "NFS", capacityGb: 20000, freeGb: 9000 },
      { name: "raw-lun-3", type: "RDM", capacityGb: 4000, freeGb: 0 },
    ],
    vms,
  };
}
