import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const INPUT_PATH = resolve(process.cwd(), "data/plz_contacts.csv");
const OUTPUT_PATH = resolve(process.cwd(), "public/plz_contacts.json");
const RULE_TYPES = new Set(["default", "range", "exact"]);

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current.trim());
  return result;
}

function toNullable2Digit(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (!/^\d{2}$/.test(trimmed)) {
    throw new Error(`Ungültiger 2-stelliger PLZ-Wert: ${value}`);
  }
  return trimmed;
}

function toRangeNumber(value, fieldName) {
  const v = toNullable2Digit(value);
  if (v === null) {
    throw new Error(`${fieldName} ist erforderlich`);
  }
  return Number.parseInt(v, 10);
}

function normalizeRecord(raw, lineNo) {
  const ruleType = String(raw.rule_type || "").trim().toLowerCase();
  if (!RULE_TYPES.has(ruleType)) {
    throw new Error(`Zeile ${lineNo}: rule_type muss exact, range oder default sein`);
  }

  const role = String(raw.role || "").trim().toUpperCase();
  const name = String(raw.name || "").trim();
  const tel = String(raw.tel || "").trim();
  const mail = String(raw.mail || "").trim();

  if (!role || !name || !tel || !mail) {
    throw new Error(`Zeile ${lineNo}: role, name, tel und mail sind Pflichtfelder`);
  }

  let plz2Exact = null;
  let plz2From = null;
  let plz2To = null;

  if (ruleType === "exact") {
    plz2Exact = toNullable2Digit(raw.plz2_exact);
    if (plz2Exact === null) {
      throw new Error(`Zeile ${lineNo}: plz2_exact ist für exact-Regeln erforderlich`);
    }
  }

  if (ruleType === "range") {
    plz2From = toRangeNumber(raw.plz2_from, "plz2_from");
    plz2To = toRangeNumber(raw.plz2_to, "plz2_to");
    if (plz2From > plz2To) {
      throw new Error(`Zeile ${lineNo}: plz2_from darf nicht größer als plz2_to sein`);
    }
  }

  return {
    rule_type: ruleType,
    plz2_exact: plz2Exact,
    plz2_from: plz2From,
    plz2_to: plz2To,
    role,
    name,
    tel,
    mail,
    line: lineNo
  };
}

function compareRules(a, b) {
  const order = { exact: 0, range: 1, default: 2 };
  if (order[a.rule_type] !== order[b.rule_type]) {
    return order[a.rule_type] - order[b.rule_type];
  }

  if (a.rule_type === "range") {
    const spanA = a.plz2_to - a.plz2_from;
    const spanB = b.plz2_to - b.plz2_from;
    if (spanA !== spanB) return spanA - spanB;
    if (a.plz2_from !== b.plz2_from) return a.plz2_from - b.plz2_from;
  }

  if (a.rule_type === "exact") {
    if (a.plz2_exact !== b.plz2_exact) return a.plz2_exact.localeCompare(b.plz2_exact);
  }

  if (a.role !== b.role) return a.role.localeCompare(b.role);
  return a.line - b.line;
}

async function run() {
  const csvText = await readFile(INPUT_PATH, "utf8");
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length < 2) {
    throw new Error("CSV enthält keine Datensätze");
  }

  const headers = parseCsvLine(lines[0]);
  const requiredHeaders = [
    "rule_type",
    "plz2_exact",
    "plz2_from",
    "plz2_to",
    "role",
    "name",
    "tel",
    "mail"
  ];

  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`CSV-Header fehlt: ${header}`);
    }
  }

  const records = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const raw = {};

    for (let col = 0; col < headers.length; col += 1) {
      raw[headers[col]] = cells[col] ?? "";
    }

    records.push(normalizeRecord(raw, i + 1));
  }

  records.sort(compareRules);

  const output = {
    version: 1,
    generated_at: new Date().toISOString(),
    source: "data/plz_contacts.csv",
    contact_roles: [...new Set(records.map((r) => r.role))],
    contacts: records.map(({ line, ...rest }) => rest)
  };

  await mkdir(resolve(process.cwd(), "public"), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`OK: ${records.length} Kontaktregeln nach ${OUTPUT_PATH} geschrieben.`);
}

run().catch((error) => {
  console.error(`Fehler beim Erzeugen von plz_contacts.json: ${error.message}`);
  process.exitCode = 1;
});
