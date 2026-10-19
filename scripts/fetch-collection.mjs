#!/usr/bin/env node
// Builds data/collection.json: the most-borrowed 2025 BOOK titles with ISBNs at Seattle Public Library.
// Source: "Checkouts by Title", City of Seattle open data (public domain), dataset tmmm-ytt6.
// Run: npm run fetch:collection   (no key needed; be gentle: nine requests)
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://data.seattle.gov/resource/tmmm-ytt6.json";
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PER_MONTH = 2500;
const KEEP = 3000;

function isbn10to13(isbn10) {
  const core = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

export function pickIsbn13(field) {
  const parts = String(field || "")
    .split(/[,\s;]+/)
    .map((s) => s.replace(/[^0-9Xx]/g, ""))
    .filter(Boolean);
  const thirteen = parts.find((p) => /^97[89]\d{10}$/.test(p));
  if (thirteen) return thirteen;
  const ten = parts.find((p) => /^\d{9}[\dXx]$/.test(p));
  if (ten && !/x/i.test(ten)) return isbn10to13(ten);
  return null;
}

export function cleanTitle(raw) {
  let t = String(raw || "").trim();
  t = t.split(" / ")[0]; // "Title : subtitle / by Author" -> drop the statement of responsibility
  t = t.replace(/\s*\[.*?\]\s*/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/\s*:\s*/g, ": ");
  return t.replace(/[.\s]+$/g, "");
}

export function cleanAuthor(raw) {
  let a = String(raw || "").trim();
  a = a.replace(/,?\s*\(?\d{4}\s*-\s*(\d{4})?\)?\.?$/g, "").trim(); // drop life dates
  a = a.replace(/[,.]+$/g, "").trim();
  if (a.includes(",")) {
    const [last, first] = a.split(",").map((s) => s.trim());
    if (first) a = `${first} ${last}`;
  }
  return a.replace(/\s+/g, " ");
}

function cleanYear(raw) {
  const m = String(raw || "").match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

function cleanSubjects(raw) {
  return String(raw || "")
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

async function fetchMonth(month) {
  const params = new URLSearchParams({
    $select: "title,creator,isbn,publisher,publicationyear,subjects,checkouts",
    $where: `checkoutyear=2025 AND checkoutmonth=${month} AND materialtype='BOOK' AND isbn IS NOT NULL`,
    $order: "checkouts DESC",
    $limit: String(PER_MONTH),
  });
  const res = await fetch(`${BASE}?${params}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`SODA ${res.status} for month ${month}`);
  return res.json();
}

const merged = new Map();
for (const month of MONTHS) {
  const rows = await fetchMonth(month);
  for (const r of rows) {
    const isbn13 = pickIsbn13(r.isbn);
    if (!isbn13) continue;
    const checkouts = Number(r.checkouts || 0);
    const prev = merged.get(isbn13);
    if (prev) {
      prev.checkouts2025 += checkouts;
      continue;
    }
    merged.set(isbn13, {
      isbn13,
      title: cleanTitle(r.title),
      author: cleanAuthor(r.creator),
      authorRaw: String(r.creator || ""),
      publisher: String(r.publisher || "").replace(/[,.]+$/, "").trim(),
      year: cleanYear(r.publicationyear),
      subjects: cleanSubjects(r.subjects),
      checkouts2025: checkouts,
    });
  }
  console.error(`month ${month}: ${rows.length} rows, ${merged.size} distinct ISBNs so far`);
}

const items = [...merged.values()]
  .filter((it) => it.title && it.author)
  .sort((a, b) => b.checkouts2025 - a.checkouts2025)
  .slice(0, KEEP);

mkdirSync("data", { recursive: true });
writeFileSync(
  "data/collection.json",
  JSON.stringify(
    {
      source: "Seattle Public Library, Checkouts by Title (City of Seattle open data, public domain), dataset tmmm-ytt6",
      fetched: new Date().toISOString().slice(0, 10),
      rule: `most-borrowed BOOK titles with ISBNs, January to September 2025, top ${KEEP} by checkouts`,
      items,
    },
    null,
    0,
  ) + "\n",
);
console.error(`wrote data/collection.json with ${items.length} items`);
