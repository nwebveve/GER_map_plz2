import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const INPUT_PATH = resolve(process.cwd(), "data/plz_contacts.csv");
const OUTPUT_PATH = resolve(process.cwd(), "public/plz_contacts.json");
const REQUIRED_ROLES = ["VAD", "KAMLIGHT", "KAMHEAVY"];
const ALL_PLZ2 = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

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

function normalizePlz2(value, lineNo) {
  const plz2 = String(value || "").trim();
  if (!/^\d{2}$/.test(plz2)) {
    throw new Error(`Zeile ${lineNo}: plz2 muss zweistellig sein (00-99)`);
  }
  return plz2;
}

function normalizeRole(value, lineNo) {
  const role = String(value || "").trim().toUpperCase();
  if (!REQUIRED_ROLES.includes(role)) {
    throw new Error(`Zeile ${lineNo}: role muss einer von ${REQUIRED_ROLES.join(", ")} sein`);
  }
  return role;
}

function normalizeRecord(raw, lineNo) {
  const plz2 = normalizePlz2(raw.plz2, lineNo);
  const role = normalizeRole(raw.role, lineNo);
  const name = String(raw.name || "").trim();
  const tel = String(raw.tel || "").trim();
  const mail = String(raw.mail || "").trim();

  if (!name || !tel || !mail) {
    throw new Error(`Zeile ${lineNo}: name, tel und mail sind Pflichtfelder`);
  }

  return { plz2, role, name, tel, mail, line: lineNo };
}

function compareRecords(a, b) {
  const aNum = Number.parseInt(a.plz2, 10);
  const bNum = Number.parseInt(b.plz2, 10);
  if (aNum !== bNum) return aNum - bNum;
  return REQUIRED_ROLES.indexOf(a.role) - REQUIRED_ROLES.indexOf(b.role);
}

function validateCompleteness(records) {
  const present = new Set(records.map((r) => `${r.plz2}|${r.role}`));
  const missing = [];

  for (const plz2 of ALL_PLZ2) {
    for (const role of REQUIRED_ROLES) {
      const key = `${plz2}|${role}`;
      if (!present.has(key)) missing.push(key);
    }
  }

  if (missing.length > 0) {
    const preview = missing.slice(0, 20).join(", ");
    throw new Error(
      `CSV ist nicht vollständig. Fehlende Kombinationen: ${preview}${missing.length > 20 ? " ..." : ""}`
    );
  }
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
  const requiredHeaders = ["plz2", "role", "name", "tel", "mail"];

  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`CSV-Header fehlt: ${header}`);
    }
  }

  const records = [];
  const seenKeys = new Set();

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const raw = {};

    for (let col = 0; col < headers.length; col += 1) {
      raw[headers[col]] = cells[col] ?? "";
    }

    const record = normalizeRecord(raw, i + 1);
    const key = `${record.plz2}|${record.role}`;
    if (seenKeys.has(key)) {
      throw new Error(`Zeile ${i + 1}: Doppelte Kombination ${key}`);
    }

    seenKeys.add(key);
    records.push(record);
  }

  validateCompleteness(records);
  records.sort(compareRecords);

  const output = {
    version: 2,
    generated_at: new Date().toISOString(),
    source: "data/plz_contacts.csv",
    required_roles: REQUIRED_ROLES,
    total_plz2: ALL_PLZ2.length,
    total_entries: records.length,
    contacts: records.map(({ line, ...rest }) => rest)
  };

  await mkdir(resolve(process.cwd(), "public"), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`OK: ${records.length} Kontakte nach ${OUTPUT_PATH} geschrieben.`);
}

run().catch((error) => {
  console.error(`Fehler beim Erzeugen von plz_contacts.json: ${error.message}`);
  process.exitCode = 1;
});
