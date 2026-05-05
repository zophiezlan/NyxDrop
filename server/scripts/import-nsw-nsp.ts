import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import type {
  LocationType,
  NswNspListing,
} from "../../shared/schema.js";

// =============================================================================
// NSW NSP importer — pulls participating-outlet data from NSW Health's three
// CSV exports of the Needle and Syringe Program outlet directory:
//
//   - NSP primary outlets.csv
//   - NSP secondary outlets.csv
//   - Pharmacies.csv
//
// CSVs are not checked into the repo. Point the importer at a directory
// containing the three files via NSW_NSP_DATA_DIR, otherwise it defaults to
// `.archive/NSW Needle and Syringe Program (NSP) outlets/` at repo root.
//
// Constitution V + D-013: NSW NSP listing membership is NOT a trust signal.
// Imported rows land at `verificationLevel: "unverified"`. The listing is
// recorded via `nswNspListing`; the detail sheet surfaces it as a neutral
// fact, never as a verification badge.
//
// Run THN first, then this importer:
//   npm run db:import-thn
//   npm run db:import-nsw-nsp
//
// Order matters because this script geo-dedups against existing rows. THN
// gives us the national pharmacy/site list; this script enriches the NSW
// subset with phone, hours, and the NSW listing flag where the NSW data
// has them.
// =============================================================================

const DEFAULT_DATA_DIR =
  ".archive/NSW Needle and Syringe Program (NSP) outlets";

const FILES: Array<{ filename: string; listing: NswNspListing; type: LocationType }> = [
  { filename: "NSP primary outlets.csv", listing: "primary", type: "nsp" },
  { filename: "NSP secondary outlets.csv", listing: "secondary", type: "nsp" },
  { filename: "Pharmacies.csv", listing: "pharmacy", type: "pharmacy" },
];

// 100m bound for "same location" geo-match. At Australian latitudes
// (~-33° in Sydney), 0.001° ≈ 93m of longitude and ~111m of latitude;
// 100m is a defensible round number that's tight enough to avoid
// false matches between unrelated shops and loose enough to absorb
// minor coord drift between sources.
const DEDUP_RADIUS_METERS = 100;

// -----------------------------------------------------------------------------
// CSV parsing — small state-machine parser. The NSW CSVs use embedded
// newlines inside quoted fields (the phone+hours column wraps), and one
// row has a literal CRLF inside its address. RFC 4180 + tolerate \r\n and
// "" escapes. No external dep.
// -----------------------------------------------------------------------------

function parseCsv(text: string): Record<string, string>[] {
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      row.push(field);
      field = "";
      // Skip empty trailing line.
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
      if (c === "\r" && text[i + 1] === "\n") i += 2;
      else i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0]!;
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

// -----------------------------------------------------------------------------
// Field extraction
// -----------------------------------------------------------------------------

interface ParsedRow {
  name: string;
  address: string;
  lat: number;
  lon: number;
  phone: string | null;
  hours: string | null;
}

function parseCoordinates(row: Record<string, string>): { lat: number; lon: number } | null {
  const c = row.Coordinates;
  if (c) {
    const parts = c.split(",").map((s) => Number.parseFloat(s.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      // NSW CSVs format the Coordinates column as "lat, lon".
      return { lat: parts[0]!, lon: parts[1]! };
    }
  }
  const wkt = row.WKT;
  if (wkt) {
    const m = wkt.match(/POINT\s*Z?\s*\(\s*([-\d.]+)\s+([-\d.]+)/i);
    if (m) {
      // WKT POINT is "(lon lat ...)".
      const lon = Number.parseFloat(m[1]!);
      const lat = Number.parseFloat(m[2]!);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }
  return null;
}

function splitPhoneHours(combined: string): { phone: string | null; hours: string | null } {
  const lines = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { phone: null, hours: null };
  return {
    phone: lines[0]!,
    hours: lines.length > 1 ? lines.slice(1).join("\n") : null,
  };
}

function buildAddress(row: Record<string, string>): string {
  const parts = [row.Address, row.Suburb, [row.State, row.Postcode].filter(Boolean).join(" ")]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  // NSW CSVs don't have a separate State column; default to NSW since
  // the dataset is NSW Health's.
  if (!parts.some((p) => /\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/.test(p))) {
    const last = parts.length - 1;
    if (last >= 0) parts[last] = `${parts[last]} NSW`.trim();
  }
  return parts.join(", ");
}

function rowToParsed(row: Record<string, string>): ParsedRow | null {
  const name = row.Name;
  if (!name) return null;
  const coords = parseCoordinates(row);
  if (!coords) return null;
  const { phone, hours } = splitPhoneHours(row.Phone_number_and_operating_hours ?? "");
  return {
    name,
    address: buildAddress(row),
    lat: coords.lat,
    lon: coords.lon,
    phone,
    hours,
  };
}

// -----------------------------------------------------------------------------
// Geo-dedup
// -----------------------------------------------------------------------------

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EARTH_RADIUS_M = 6_371_000;
function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

interface ExistingLoc {
  id: string;
  lat: number;
  lon: number;
  phone: string | null;
  hours: string | null;
}

async function buildNameIndex(): Promise<Map<string, ExistingLoc[]>> {
  const rows = await db
    .select({
      id: schema.locations.id,
      name: schema.locations.name,
      latitude: schema.locations.latitude,
      longitude: schema.locations.longitude,
      phone: schema.locations.phone,
      hours: schema.locations.hours,
    })
    .from(schema.locations);
  const map = new Map<string, ExistingLoc[]>();
  for (const row of rows) {
    const k = normaliseName(row.name);
    const arr = map.get(k) ?? [];
    arr.push({
      id: row.id,
      lat: Number.parseFloat(row.latitude),
      lon: Number.parseFloat(row.longitude),
      phone: row.phone,
      hours: row.hours,
    });
    map.set(k, arr);
  }
  return map;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

interface ImportStats {
  fetched: number;
  inserted: number;
  matched: number;
  skipped: number;
}

async function main(): Promise<void> {
  const dataDir = process.env.NSW_NSP_DATA_DIR ?? DEFAULT_DATA_DIR;
  logger.info({ dataDir }, "NSW NSP import starting");

  const stats: ImportStats = { fetched: 0, inserted: 0, matched: 0, skipped: 0 };
  const nameIndex = await buildNameIndex();

  for (const file of FILES) {
    const filepath = path.join(dataDir, file.filename);
    if (!fs.existsSync(filepath)) {
      logger.warn({ filepath }, "skipping missing CSV");
      continue;
    }
    const text = fs.readFileSync(filepath, "utf8");
    const rows = parseCsv(text);
    logger.info({ file: file.filename, rows: rows.length }, "parsed CSV");

    for (const raw of rows) {
      const parsed = rowToParsed(raw);
      stats.fetched += 1;
      if (!parsed) {
        stats.skipped += 1;
        continue;
      }

      const candidates = nameIndex.get(normaliseName(parsed.name)) ?? [];
      const match = candidates.find(
        (c) =>
          haversineMeters({ lat: c.lat, lon: c.lon }, { lat: parsed.lat, lon: parsed.lon }) <
          DEDUP_RADIUS_METERS,
      );

      if (match) {
        // Update the existing row: set the listing flag, fill phone/hours
        // only if they're currently null. Never overwrite community-edited
        // data.
        await db
          .update(schema.locations)
          .set({
            nswNspListing: file.listing,
            ...(match.phone == null && parsed.phone != null ? { phone: parsed.phone } : {}),
            ...(match.hours == null && parsed.hours != null ? { hours: parsed.hours } : {}),
          })
          .where(eq(schema.locations.id, match.id));
        stats.matched += 1;
        // Update the name index in case a later CSV row is a duplicate of
        // this same location (would otherwise insert again).
        match.phone = match.phone ?? parsed.phone;
        match.hours = match.hours ?? parsed.hours;
        continue;
      }

      const inserted = await db
        .insert(schema.locations)
        .values({
          name: parsed.name,
          address: parsed.address,
          latitude: parsed.lat.toFixed(8),
          longitude: parsed.lon.toFixed(8),
          type: file.type,
          phone: parsed.phone,
          hours: parsed.hours,
          naloxoneForms: ["nasal_spray"],
          verificationLevel: "unverified",
          nswNspListing: file.listing,
        })
        .returning({ id: schema.locations.id });
      stats.inserted += 1;

      // Add the freshly-inserted row to the index so subsequent CSV rows
      // (e.g. a Pharmacies.csv entry that overlaps a Secondary entry)
      // dedup against it.
      const newRow = inserted[0];
      if (newRow) {
        const k = normaliseName(parsed.name);
        const arr = nameIndex.get(k) ?? [];
        arr.push({
          id: newRow.id,
          lat: parsed.lat,
          lon: parsed.lon,
          phone: parsed.phone,
          hours: parsed.hours,
        });
        nameIndex.set(k, arr);
      }
    }
  }

  logger.info(stats, "NSW NSP import complete");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error({ err }, "NSW NSP import failed");
    process.exit(1);
  });
