#!/usr/bin/env node
// Opens the desk at 1440x900 and 390x844 (and every ?state= when given), screenshots into qa/, and fails on:
// a horizontal scrollbar, a missing primary action, a JavaScript error, or the result not appearing within 20 s.
// Usage: node scripts/verify-states.mjs http://localhost:3100 [state,state,...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const states = (process.argv[3] ?? "").split(",").filter(Boolean);
// --allow /a,/b : paths whose 4xx is expected for now (routes owned by later tasks). The final gate runs without it.
const allowArg = process.argv.indexOf("--allow");
const ALLOW = allowArg > -1 ? (process.argv[allowArg + 1] ?? "").split(",").filter(Boolean) : [];
if (ALLOW.length) console.log(`allowing 4xx on: ${ALLOW.join(" ")}`);
const sizes = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
mkdirSync("qa", { recursive: true });

const browser = await chromium.launch();
let failures = 0;
for (const size of sizes) {
  for (const state of ["", ...states]) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`)); // resource failures are reported by URL below
    // name the resource behind a "Failed to load resource" line, so a failing run says what 404'd
    const allowed = (u) => ALLOW.some((a) => new URL(u).pathname === a);
    page.on("response", (r) => r.status() >= 400 && !allowed(r.url()) && errors.push(`http ${r.status()}: ${r.url()}`));
    page.on("requestfailed", (r) => !allowed(r.url()) && errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
    const url = `${base}/${state ? `?state=${state}` : ""}`;
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "load" });
    let resultSeen = false;
    try {
      await page.getByText(/No record in|Exists, and we hold it|Exists; we don|Couldn.t check any source|Nothing to recover from yet/).first().waitFor({ timeout: 20000 });
      resultSeen = true;
    } catch {}
    const resultMs = Date.now() - t0;
    // let the shelf settle
    await page.waitForTimeout(1500);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const sideways = scrollW > size.width + 1;
    const primary = page.getByRole("button", { name: /^Reserve/ }).first();
    const primaryVisible = await primary.isVisible().catch(() => false);
    let primaryInView = false;
    if (primaryVisible) {
      const box = await primary.boundingBox();
      primaryInView = !!box && box.y >= 0 && box.y + box.height <= size.height;
    }
    const file = `qa/desk-${size.name}${state ? `-${state}` : ""}.png`;
    await page.screenshot({ path: file, fullPage: false });
    const bad = !resultSeen || sideways || !primaryInView || errors.length > 0;
    if (bad) failures++;
    console.log(`${bad ? "FAIL" : "ok  "} ${size.name}${state ? ` state=${state}` : ""}  result ${resultSeen ? `in ${resultMs} ms` : "NOT SEEN"}  sideways=${sideways}  primaryInView=${primaryInView}  errors=${errors.length}  -> ${file}`);
    for (const e of errors) console.log(`      ${e.slice(0, 200)}`);
    await ctx.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
