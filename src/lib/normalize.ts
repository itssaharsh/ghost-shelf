// Text normalisation shared by the catalog check and the source matchers.

const ARTICLES = /^(the|a|an)\s+/;

export function normalizeTitle(raw: string): string {
  return String(raw || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(ARTICLES, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Main title only: everything before a colon or the first subtitle separator. */
export function mainTitle(raw: string): string {
  return normalizeTitle(String(raw || "").split(/[:;]/)[0]);
}

export function normalizeAuthor(raw: string): string {
  let a = String(raw || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/,?\s*\(?\d{4}\s*-\s*(\d{4})?\)?\.?$/g, "")
    .trim();
  if (a.includes(",")) {
    const [last, first] = a.split(",").map((s) => s.trim());
    if (first) a = `${first} ${last}`;
  }
  return a
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The surname used for loose author matching ("Jess Walter" -> "walter"). */
export function authorKey(raw: string): string {
  const parts = normalizeAuthor(raw).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

export function sameAuthor(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ka = authorKey(a);
  const kb = authorKey(b);
  return ka.length > 1 && ka === kb;
}

export function isbn10to13(isbn10: string): string {
  const core = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

export function toIsbn13(raw: string): string | null {
  const p = String(raw || "").replace(/[^0-9Xx]/g, "");
  if (/^97[89]\d{10}$/.test(p)) return p;
  if (/^\d{9}[\dXx]$/.test(p)) return isbn10to13(p);
  return null;
}
