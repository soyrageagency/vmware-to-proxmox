/**
 * vCenter client.
 *
 * Gathers a normalised {@link Inventory} either from a live vCenter (vSphere
 * Automation REST API, 7.0+) or — in demo mode — from a rich, believable
 * fabricated environment so the whole toolkit can be run and demoed without
 * touching production.
 *
 * The live path is intentionally defensive: per-VM detail calls are wrapped so
 * one odd VM never aborts the whole inventory. Fields the API doesn't expose
 * cheaply fall back to sensible defaults.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import { Agent } from "undici";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { Datastore, Host, Inventory, Vm, VmDisk } from "../core/types.js";
import { demoInventory } from "./demo.js";

export class VCenterClient {
  private readonly agent: Agent;
  private session = "";

  constructor(
    private readonly config: AppConfig,
    private readonly log: Logger,
  ) {
    this.agent = new Agent({ connect: { rejectUnauthorized: config.verifyTls } });
  }

  /** Produce a full inventory (demo or live). */
  async inventory(): Promise<Inventory> {
    if (this.config.demo) {
      this.log.info("Running in DEMO mode (fabricated vCenter inventory).");
      return demoInventory();
    }
    if (!this.config.vcenter || !this.config.vcUser) {
      throw new Error(
        "vCenter is not configured. Set VCENTER_HOST / VCENTER_USER / VCENTER_PASSWORD, or run with V2P_DEMO=true to try the toolkit.",
      );
    }
    await this.login();
    const [vms, hosts, datastores, version] = await Promise.all([
      this.fetchVms(),
      this.fetchHosts(),
      this.fetchDatastores(),
      this.fetchVersion(),
    ]);
    return {
      vcenter: this.config.vcenter,
      vcenterVersion: version,
      gatheredAt: new Date().toISOString(),
      hosts,
      datastores,
      vms,
    };
  }

  // ---- Live vSphere Automation API ---------------------------------------

  private async login(): Promise<void> {
    const auth = Buffer.from(`${this.config.vcUser}:${this.config.vcPassword}`).toString("base64");
    const res = await this.fetch("/api/session", { method: "POST", headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`vCenter login failed (${res.status}). Check host and credentials.`);
    this.session = (await res.json()) as string;
    this.log.debug("vCenter session acquired");
  }

  private async fetchVersion(): Promise<string> {
    try {
      const r = await this.api<{ version?: string; build?: string }>("/api/appliance/system/version");
      return r?.version ? `vCenter ${r.version}${r.build ? " (build " + r.build + ")" : ""}` : "vCenter";
    } catch {
      return "vCenter";
    }
  }

  private async fetchVms(): Promise<Vm[]> {
    const list = await this.api<Array<Record<string, unknown>>>("/api/vcenter/vm");
    const out: Vm[] = [];
    for (const v of list ?? []) {
      const id = String(v.vm);
      try {
        const d = await this.api<Record<string, unknown>>(`/api/vcenter/vm/${id}`);
        out.push(this.mapVm(id, v, d));
      } catch (e) {
        this.log.warn(`Could not read details for VM ${id}: ${(e as Error).message}`);
        out.push(this.mapVm(id, v, {}));
      }
    }
    return out;
  }

  private mapVm(id: string, list: Record<string, unknown>, detail: Record<string, unknown>): Vm {
    const hw = (detail.hardware as { version?: string } | undefined)?.version ?? "";
    const hardwareVersion = Number(/(\d+)/.exec(hw)?.[1] ?? 0);
    const disksObj = (detail.disks as Record<string, { label?: string; capacity?: number }> | undefined) ?? {};
    const disks: VmDisk[] = Object.values(disksObj).map((d, i) => ({
      label: d.label ?? `Hard disk ${i + 1}`,
      sizeGb: Math.round(Number(d.capacity ?? 0) / 1024 ** 3),
      thin: true,
      controller: "SCSI",
      datastore: "",
      rdm: false,
    }));
    const os = String(detail.guest_OS ?? list.guest_OS ?? "unknown").toLowerCase();
    return {
      id,
      name: String(list.name ?? detail.name ?? id),
      powerState: mapPower(String(list.power_state ?? detail.power_state ?? "")),
      guestOs: prettyOs(os),
      hardwareVersion,
      toolsStatus: "toolsOk",
      cpu: Number((detail.cpu as { count?: number } | undefined)?.count ?? list.cpu_count ?? 0),
      memoryMb: Number((detail.memory as { size_MiB?: number } | undefined)?.size_MiB ?? list.memory_size_MiB ?? 0),
      disks,
      nics: 1,
      snapshots: 0,
      host: "",
      encrypted: false,
      secureBoot: false,
      vTpm: false,
      faultTolerance: false,
      notes: "",
    };
  }

  private async fetchHosts(): Promise<Host[]> {
    try {
      const list = await this.api<Array<Record<string, unknown>>>("/api/vcenter/host");
      return (list ?? []).map((h) => ({
        name: String(h.name ?? h.host),
        cluster: "",
        cpuModel: "",
        sockets: 0,
        cores: 0,
        memGb: 0,
        esxiVersion: String(h.connection_state ?? ""),
      }));
    } catch {
      return [];
    }
  }

  private async fetchDatastores(): Promise<Datastore[]> {
    try {
      const list = await this.api<Array<Record<string, unknown>>>("/api/vcenter/datastore");
      return (list ?? []).map((d) => ({
        name: String(d.name ?? d.datastore),
        type: String(d.type ?? ""),
        capacityGb: Math.round(Number(d.capacity ?? 0) / 1024 ** 3),
        freeGb: Math.round(Number(d.free_space ?? 0) / 1024 ** 3),
      }));
    } catch {
      return [];
    }
  }

  private async api<T>(path: string): Promise<T> {
    const res = await this.fetch(path, { headers: { "vmware-api-session-id": this.session } });
    if (!res.ok) throw new Error(`vCenter API ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  private fetch(path: string, init: { method?: string; headers?: Record<string, string> }): Promise<Response> {
    const options = { ...init, dispatcher: this.agent };
    return fetch(`${this.config.vcenter}${path}`, options as unknown as RequestInit);
  }
}

function mapPower(s: string): Vm["powerState"] {
  const v = s.toLowerCase();
  if (v.includes("on")) return "poweredOn";
  if (v.includes("susp")) return "suspended";
  return "poweredOff";
}

function prettyOs(os: string): string {
  if (os.includes("windows")) return os.includes("2022") ? "Windows Server 2022" : os.includes("2019") ? "Windows Server 2019" : "Windows";
  if (os.includes("debian")) return "Debian Linux";
  if (os.includes("ubuntu")) return "Ubuntu Linux";
  if (os.includes("rhel") || os.includes("red_hat")) return "Red Hat Enterprise Linux";
  if (os.includes("centos")) return "CentOS";
  if (os.includes("suse")) return "SUSE Linux";
  return os || "unknown";
}
