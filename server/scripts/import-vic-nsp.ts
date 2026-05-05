import "dotenv/config";

import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import type {
  LocationType,
  VicNspListing,
} from "../../shared/schema.js";

// =============================================================================
// Vic NSP importer — pulls participating-outlet data from the Victorian
// Department of Health public NSP directory, exposed as a CartoDB SQL
// endpoint linked from
// https://www.health.vic.gov.au/aod-treatment-services/needle-and-syringe-program
//
// Constitution V + D-013: NSP listing membership is NOT a trust signal,
// and the dataset's `naloxone` boolean is NOT either. Imported rows land
// at `verificationLevel: "unverified"`. The detail sheet surfaces the
// listing and naloxone-funded flag as neutral facts, never as
// verification badges.
//
// Run AFTER THN and (if you want) NSW NSP, so the geo-dedup picks up
// existing rows:
//   npm run db:import-thn
//   npm run db:import-nsw-nsp
//   npm run db:import-vic-nsp
// =============================================================================

const ENDPOINT = "https://dhhs.cartodb.com/api/v2/sql";
const SQL = `
  SELECT
    agency_site_name AS sitename,
    naloxone,
    operating_model,
    street_address,
    suburb,
    postcode,
    opening_hours,
    latitude,
    longitude
  FROM public.dhhsnsppublic
`;

const DEDUP_RADIUS_METERS = 100;

interface VicRow {
  sitename: string | null;
  naloxone: boolean | null;
  operating_model: string | null;
  street_address: string | null;
  suburb: string | null;
  postcode: number | string | null;
  opening_hours: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface CartoDbResponse {
  rows: VicRow[];
}

async function fetchAll(): Promise<VicRow[]> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(SQL)}&format=JSON`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Vic NSP fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as CartoDbResponse;
  return json.rows ?? [];
}

// Map Vic's free-text operating_model into our enum slug.
function mapListing(model: string | null): VicNspListing | null {
  if (!model) return null;
  const m = model.toLowerCase().trim();
  if (m === "fixed site") return "fixed_site";
  if (m === "secure dispensing unit") return "secure_dispensing";
  if (m === "vehicle outreach") return "vehicle_outreach";
  if (m === "pharmacy") return "pharmacy";
  if (m === "foot patrol") return "foot_patrol";
  return null; // unknown model — skip the listing flag rather than guess
}

// Outlet → our LocationType. Pharmacies are pharmacies; everything else is
// "nsp" since by construction it is one.
function mapType(model: string | null): LocationType {
  return model?.toLowerCase().trim() === "pharmacy" ? "pharmacy" : "nsp";
}

function buildAddress(row: VicRow): string {
  const parts = [
    row.street_address?.trim(),
    row.suburb?.trim(),
    [row.postcode != null ? String(row.postcode) : null]
      .filter((p): p is string => Boolean(p && p.trim()))
      .join(""),
  ]
    .filter((p): p is string => Boolean(p && p.length > 0));
  // Vic dataset has no State column; this is by definition all VIC.
  if (!parts.some((p) => /\bVIC\b/i.test(p))) {
    if (parts.length > 0) parts[parts.length - 1] = `${parts[parts.length - 1]} VIC`.trim();
  }
  return parts.join(", ");
}

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
  hours: string | null;
}

async function buildNameIndex(): Promise<Map<string, ExistingLoc[]>> {
  const rows = await db
    .select({
      id: schema.locations.id,
      name: schema.locations.name,
      latitude: schema.locations.latitude,
      longitude: schema.locations.longitude,
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
      hours: row.hours,
    });
    map.set(k, arr);
  }
  return map;
}

interface ImportStats {
  fetched: number;
  inserted: number;
  matched: number;
  skipped: number;
}

async function main(): Promise<void> {
  logger.info("Vic NSP import starting");
  const stats: ImportStats = { fetched: 0, inserted: 0, matched: 0, skipped: 0 };

  const rows = await fetchAll();
  stats.fetched = rows.length;
  logger.info({ rows: rows.length }, "fetched Vic NSP rows");

  const nameIndex = await buildNameIndex();

  for (const row of rows) {
    const name = row.sitename?.trim();
    const lat = row.latitude;
    const lon = row.longitude;
    if (!name || lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      stats.skipped += 1;
      continue;
    }

    const listing = mapListing(row.operating_model);
    const type = mapType(row.operating_model);
    const address = buildAddress(row);
    const hours = row.opening_hours?.trim() || null;
    const naloxoneFlag = row.naloxone ?? null;

    const candidates = nameIndex.get(normaliseName(name)) ?? [];
    const match = candidates.find(
      (c) =>
        haversineMeters({ lat: c.lat, lon: c.lon }, { lat, lon }) <
        DEDUP_RADIUS_METERS,
    );

    if (match) {
      // Update: set the listing + naloxone-funded flag; fill hours only if
      // currently null. Never overwrite community-edited data.
      await db
        .update(schema.locations)
        .set({
          vicNspListing: listing,
          vicNspSuppliesNaloxone: naloxoneFlag,
          ...(match.hours == null && hours != null ? { hours } : {}),
        })
        .where(eq(schema.locations.id, match.id));
      stats.matched += 1;
      match.hours = match.hours ?? hours;
      continue;
    }

    const inserted = await db
      .insert(schema.locations)
      .values({
        name,
        address,
        latitude: lat.toFixed(8),
        longitude: lon.toFixed(8),
        type,
        hours,
        naloxoneForms: ["nasal_spray"],
        verificationLevel: "unverified",
        vicNspListing: listing,
        vicNspSuppliesNaloxone: naloxoneFlag,
      })
      .returning({ id: schema.locations.id });
    stats.inserted += 1;

    const newRow = inserted[0];
    if (newRow) {
      const k = normaliseName(name);
      const arr = nameIndex.get(k) ?? [];
      arr.push({ id: newRow.id, lat, lon, hours });
      nameIndex.set(k, arr);
    }
  }

  logger.info(stats, "Vic NSP import complete");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error({ err }, "Vic NSP import failed");
    process.exit(1);
  });
