/**
 * Assessment orchestrator — inventory → compatibility → estimate → plan.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { VCenterClient } from "../vcenter/client.js";
import { analyze, readinessScore } from "./compatibility.js";
import { estimate } from "./estimate.js";
import { buildPlan } from "./plan.js";
import type { Assessment, Inventory } from "./types.js";

/** Run the full assessment pipeline. */
export async function runAssessment(config: AppConfig, log: Logger): Promise<Assessment> {
  const client = new VCenterClient(config, log);
  const inventory = await client.inventory();
  return assessInventory(inventory, config);
}

/** Assess an already-gathered inventory (used by the web/menu flows). */
export function assessInventory(inventory: Inventory, config: AppConfig): Assessment {
  const findings = analyze(inventory);
  return {
    inventory,
    findings,
    estimate: estimate(inventory, config),
    plan: buildPlan(inventory),
    readiness: readinessScore(findings),
  };
}
