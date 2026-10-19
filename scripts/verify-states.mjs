#!/usr/bin/env node
// Opens the desk (the live run at 1440x900 and 390x844; every ?state= at 1440, 390 and 320), screenshots into qa/, and fails on:
// a horizontal scrollbar, a missing primary action, a JavaScript error, an unexpected 4xx, or the expected text not appearing.
// Usage: node scripts/verify-states.mjs http://localhost:PORT [all|state,state,...] [--allow /path,/path]
//        node scripts/verify-states.mjs --serve [all|...]   starts the built app itself on a free port (what the gate runs)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const argv = process.argv.slice(2);
const serve = argv.includes("--serve");
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1] === "--allow"));
let base = serve ? "" : (positional[0] ?? "http://localhost:3100");
const stateArg = (serve ? positional[0] : positional[1]) ?? "";
let child = null;
if (serve) {
  const port = await new Promise((res) => { const srv = createServer(); srv.listen(0, () => { const p = srv.address().port; srv.close(() => res(p)); }); });
  base = `http://localhost:${port}`;
  child = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { up = (await fetch(base + "/", { signal: AbortSignal.timeout(2000) })).ok; } catch {}
  }
  if (!up) { console.error("the built app did not start; run npm run build first"); child.kill(); process.exit(2); }
  console.log(`serving the build at ${base}`);
}
const stop = () => { if (child) child.kill(); };
process.on("exit", stop);
// --allow /a,/b : paths whose 4xx is expected for now (routes owned by later tasks). The final gate runs without it.
const allowArg = process.argv.indexOf("--allow");
const ALLOW = allowArg > -1 ? (process.argv[allowArg + 1] ?? "").split(",").filter(Boolean) : [];
if (ALLOW.length) console.log(`allowing 4xx on: ${ALLOW.join(" ")}`);

// What each ?state= must show (mirrors src/components/desk/fixtures.ts).
const EXPECT = {
  "": /No record in|Exists, and we hold it|Exists; we don|check any source|Nothing to recover from yet/,
  checking: /Checking three sources/,
  "no-record": /No record in 3 sources/,
  "exists-held": /Exists, and we hold it/,
  "exists-not-held": /we don.t hold it/,
  "source-failed": /No record in 2 sources/,
  unchecked: /check any source/,
  "no-seed": /Nothing to recover from yet/,
  "shelf-loading": /finding held books/,
  "shelf-missing-cover": /No record in 3 sources/,
  "recovery-error": /reach the taste graph/,
  "holds-blocked": /Nothing to reserve yet/,
  "holds-placing": /Reserving/,
  "holds-placed": /books reserved/,
  "holds-error": /Nothing was reserved/,
  logged: /Logged/,
  "already-logged": /Logged 12 times/,
  "panel-open": /The Qloo request/,
  "panel-empty": /Run a check first/,
  "empty-title": /Type the title they asked for/,
  "check-error": /run the checks/,
};
const ALL_STATES = Object.keys(EXPECT).filter(Boolean);
const states = stateArg === "all" ? ALL_STATES : stateArg.split(",").filter(Boolean);
for (const s of states) if (!EXPECT[s]) { console.error(`unknown state ${s}; known: ${ALL_STATES.join(", ")}`); process.exit(2); }

const SIZES = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 }, 320: { width: 320, height: 700 } };
const runs = [["", "1440"], ["", "390"], ...states.flatMap((s) => [[s, "1440"], [s, "390"], [s, "320"]])];
mkdirSync("qa", { recursive: true });

const browser = await chromium.launch();
let failures = 0;
for (const [state, sizeName] of runs) {
  const size = SIZES[sizeName];
  const ctx = await browser.newContext({ viewport: size });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`)); // resource failures are reported by URL below
  const allowed = (u) => ALLOW.some((a) => new URL(u).pathname === a);
  page.on("response", (r) => r.status() >= 400 && !allowed(r.url()) && errors.push(`http ${r.status()}: ${r.url()}`));
  page.on("requestfailed", (r) => !allowed(r.url()) && errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
  const url = `${base}/${state ? `?state=${state}` : ""}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load" });
  let resultSeen = false;
  try {
    // only visible text counts: the desktop action row is display:none on phones and the sticky bar carries the same labels
    await page.getByText(EXPECT[state]).locator("visible=true").first().waitFor({ timeout: state ? 6000 : 20000 });
    resultSeen = true;
  } catch {}
  const resultMs = Date.now() - t0;
  await page.waitForTimeout(state ? 900 : 1500); // let the shelf settle
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const sideways = scrollW > size.width + 1;
  const primary = page.locator('[data-primary="reserve"]').locator("visible=true").first(); // the label changes after a hold ("3 books reserved")
  const primaryVisible = await primary.isVisible().catch(() => false);
  let primaryInView = false;
  if (primaryVisible) {
    const box = await primary.boundingBox();
    primaryInView = !!box && box.y >= 0 && box.y + box.height <= size.height;
  }
  const file = `qa/desk-${sizeName}${state ? `-${state}` : ""}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const bad = !resultSeen || sideways || !primaryInView || errors.length > 0;
  if (bad) failures++;
  console.log(`${bad ? "FAIL" : "ok  "} ${sizeName.padEnd(4)}${state ? ` state=${state}` : " live"}  ${resultSeen ? `text in ${resultMs} ms` : "TEXT NOT SEEN"}  sideways=${sideways}  primaryInView=${primaryInView}  errors=${errors.length}  -> ${file}`);
  for (const e of errors) console.log(`      ${e.slice(0, 200)}`);
  await ctx.close();
}
await browser.close();
stop();
console.log(failures ? `${failures} of ${runs.length} screens failed` : `all ${runs.length} screens pass`);
process.exit(failures ? 1 : 0);
