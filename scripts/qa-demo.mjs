#!/usr/bin/env node
// T13 QA against a URL: the demo script three times with a reset between, a failure injection (offline mid-run), and axe on four routes.
// Usage: node scripts/qa-demo.mjs https://ghost-shelf.vercel.app
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const browser = await chromium.launch();
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const errorsOf = (page, list) => {
  page.on("pageerror", (e) => list.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && list.push(`console: ${m.text()}`));
  page.on("response", (r) => r.status() >= 400 && !/\/api\/cover\//.test(r.url()) && list.push(`http ${r.status()}: ${r.url()}`));
};

// 1. The demo script, three times, reset between.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  errorsOf(page, errors);
  await page.goto(`${base}/?judge=1`, { waitUntil: "load" });
  await page.getByText(/No record in 3 sources/).locator("visible=true").first().waitFor({ timeout: 20000 });
  for (let run = 1; run <= 3; run++) {
    const t0 = Date.now();
    await page.getByRole("button", { name: /^Invented title: Tidewater Dreams/ }).click();
    await page.getByText(/Checking three sources/).locator("visible=true").first().waitFor({ timeout: 5000 }).catch(() => {});
    await page.getByText(/No record in \d sources/).locator("visible=true").first().waitFor({ timeout: 20000 });
    const tCard = Date.now() - t0;
    await page.locator('section[aria-label="Held books"] figure').first().waitFor({ timeout: 20000 });
    const books = await page.locator('section[aria-label="Held books"] figure').count();
    const reserve = page.locator('[data-primary="reserve"]').locator("visible=true").first();
    await reserve.click();
    await page.locator("button", { hasText: /books? reserved/ }).locator("visible=true").first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /^Log this invented title$/ }).click();
    await page.locator("button", { hasText: /^Logged/ }).locator("visible=true").first().waitFor({ timeout: 10000 });
    const tDone = Date.now() - t0;
    ok(books === 3, `run ${run}: card in ${tCard} ms, ${books} books, reserved and logged in ${tDone} ms`);
    // reset: alt+shift+r returns to preset 1 with nothing reserved or logged
    await page.keyboard.press("Alt+Shift+R");
    await page.getByText(/No record in 3 sources/).locator("visible=true").first().waitFor({ timeout: 20000 });
    const title = await page.getByLabel("Title they asked for").inputValue();
    const reserveLabel = await page.locator('[data-primary="reserve"]').locator("visible=true").first().textContent();
    ok(title === "The Last Algorithm" && /^Reserve/.test(reserveLabel ?? ""), `run ${run}: reset -> "${title}", button "${reserveLabel?.trim()}"`);
  }
  // replay: alt+shift+p runs the current title again
  await page.keyboard.press("Alt+Shift+P");
  const replayed = await page.getByText(/Checking three sources/).locator("visible=true").first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  await page.getByText(/No record in 3 sources/).locator("visible=true").first().waitFor({ timeout: 20000 });
  ok(replayed, "replay shortcut re-ran the check");
  // the Qloo request panel opens and closes with Escape
  await page.getByRole("button", { name: /Show the Qloo request/ }).click();
  await page.getByRole("dialog", { name: "The Qloo request" }).waitFor({ timeout: 5000 });
  await page.keyboard.press("Escape");
  ok(!(await page.getByRole("dialog", { name: "The Qloo request" }).isVisible().catch(() => false)), "request panel opens and Escape closes it");
  // record mode hides the judge card
  await page.goto(`${base}/?record=1`, { waitUntil: "load" });
  await page.getByText(/No record in 3 sources/).locator("visible=true").first().waitFor({ timeout: 20000 });
  ok(!(await page.getByLabel("How to judge this").isVisible().catch(() => false)), "?record=1 hides the judge card");
  ok(errors.length === 0, `no console errors or unexpected 4xx across the three runs (${errors.length})`);
  for (const e of errors.slice(0, 5)) console.log(`      ${e.slice(0, 160)}`);
  await ctx.close();
}

// 2. Failure injection: the connection drops mid-run.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.getByText(/No record in 3 sources/).locator("visible=true").first().waitFor({ timeout: 20000 });
  await ctx.setOffline(true);
  await page.getByRole("button", { name: /^Invented title: Nightshade Market/ }).click();
  const failed = await page.getByText(/did not answer/).locator("visible=true").first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const cardText = (await page.locator("article").first().textContent().catch(() => "")) ?? "";
  ok(failed, `offline: drawers report "did not answer"`);
  ok(cardText.length > 10 && !/does not exist|fake|hallucinat/i.test(cardText), `offline: the card still renders ("${cardText.slice(0, 60).trim()}…")`);
  await ctx.setOffline(false);
  await page.getByRole("button", { name: /^Invented title: The Rainmakers/ }).click();
  const recovered = await page.getByText(/No record in \d sources/).locator("visible=true").first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  ok(recovered, "back online: the next check completes");
  await ctx.close();
}

// 3. axe on the four routes at 1440.
for (const route of ["/", "/invented", "/lists", "/about"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}${route}`, { waitUntil: "load" });
  if (route === "/") await page.getByText(/No record in 3 sources/).locator("visible=true").first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok(results.violations.length === 0, `axe ${route}: ${results.violations.length} violations`);
  for (const v of results.violations) console.log(`      ${v.id} (${v.impact}): ${v.help} x${v.nodes.length} e.g. ${v.nodes[0]?.target?.join(" ")}`);
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} QA checks failed` : "all QA checks pass");
process.exit(failures ? 1 : 0);
