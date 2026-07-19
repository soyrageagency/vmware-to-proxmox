/**
 * Click-through web UI.
 *
 * A tiny, dependency-free HTTP server (Node core only) that serves a one-page
 * app: press a button, it runs the assessment and shows the readiness score,
 * findings and cost — with one-click downloads of the PDF, HTML, runbook and
 * JSON. Binds to 127.0.0.1 by default.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

import { createServer, type ServerResponse } from "node:http";
import { readFile, readFile as read } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { BRAND } from "../branding.js";
import { runAssessment } from "../core/assess.js";
import { writeReports, type ReportPaths } from "../core/report.js";
import type { Assessment } from "../core/types.js";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "public");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8",
};

export function startWeb(config: AppConfig, logger: Logger): Promise<void> {
  const log = logger;
  let cache: { assessment: Assessment; paths: ReportPaths } | null = null;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    try {
      if (path === "/api/meta") {
        return json(res, 200, { product: BRAND.product, author: BRAND.author, url: BRAND.url, donate: BRAND.donate, demo: config.demo, vcenter: config.demo ? "DEMO vCenter" : config.vcenter });
      }
      if (path === "/api/assess") {
        const assessment = await runAssessment(config, log);
        const paths = await writeReports(assessment, config);
        cache = { assessment, paths };
        return json(res, 200, summarize(assessment));
      }
      if (path.startsWith("/download/")) {
        if (!cache) return json(res, 409, { error: "Run the assessment first." });
        const kind = path.slice("/download/".length);
        const map: Record<string, { file: string; mime: string; name: string }> = {
          pdf: { file: cache.paths.pdf, mime: "application/pdf", name: "vmware-proxmox-assessment.pdf" },
          html: { file: cache.paths.html, mime: "text/html", name: "assessment.html" },
          script: { file: cache.paths.script, mime: "text/x-shellscript", name: "migration-plan.sh" },
          json: { file: cache.paths.json, mime: "application/json", name: "assessment.json" },
        };
        const item = map[kind];
        if (!item || !existsSync(item.file)) return json(res, 404, { error: "Not found." });
        const body = await read(item.file);
        res.writeHead(200, { "Content-Type": item.mime, "Content-Disposition": `attachment; filename="${item.name}"` });
        return void res.end(body);
      }
      if (req.method === "GET") return await serveStatic(res, path);
      res.writeHead(405); res.end("Method not allowed");
    } catch (err) {
      log.error(`Request ${path} failed`, err);
      json(res, 500, { error: err instanceof Error ? err.message : "error" });
    }
  });

  return new Promise((resolvePromise) => {
    server.listen(config.webPort, config.webHost, () => {
      logger.info(`V2P web UI ready at http://${config.webHost}:${config.webPort}${config.demo ? "  (DEMO mode)" : ""}`);
      resolvePromise();
    });
  });
}

function summarize(a: Assessment) {
  return {
    readiness: a.readiness,
    inventory: { vcenter: a.inventory.vcenter, version: a.inventory.vcenterVersion, hosts: a.inventory.hosts.length,
      vms: a.inventory.vms.map((v) => ({ name: v.name, os: v.guestOs, cpu: v.cpu, ramGb: Math.round(v.memoryMb / 1024), diskGb: v.disks.reduce((s, d) => s + d.sizeGb, 0), power: v.powerState })) },
    estimate: a.estimate,
    findings: a.findings,
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(payload);
}

async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const target = normalize(join(PUBLIC_DIR, rel));
  if (!target.startsWith(PUBLIC_DIR) || !existsSync(target)) { res.writeHead(404); return void res.end("Not found"); }
  const body = await readFile(target);
  res.writeHead(200, { "Content-Type": MIME[extname(target)] ?? "application/octet-stream" });
  res.end(body);
}
