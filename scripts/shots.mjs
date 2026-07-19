import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Start the web UI (demo) + generate reports.
const srv = spawn("node", ["dist/index.js", "web", "--demo"], { env: { ...process.env, V2P_WEB_PORT: "4711", V2P_OUT_DIR: "./assessment", V2P_LOG_LEVEL: "error" }, stdio: "ignore" });
const B = "http://127.0.0.1:4711";
for (let i = 0; i < 40; i++) { try { const r = await fetch(B + "/api/meta"); if (r.ok) break; } catch {} await new Promise(r=>setTimeout(r,150)); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Landing
await page.goto(B, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.screenshot({ path: "assets/screenshots/web-landing.png" });
console.log("web-landing");

// Results
await page.click("#run");
await page.waitForSelector("#results:not(.hidden)", { timeout: 8000 });
await page.waitForTimeout(600);
await page.screenshot({ path: "assets/screenshots/web-results.png", fullPage: true });
console.log("web-results");

// HTML report (generated into ./assessment)
const html = resolve("assessment/assessment.html");
if (existsSync(html)) {
  await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "assets/screenshots/report-html.png", fullPage: true });
  console.log("report-html");
}

await browser.close();
srv.kill();
