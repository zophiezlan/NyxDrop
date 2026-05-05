import "dotenv/config";

import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import type { LocationType } from "../../shared/schema.js";

// =============================================================================
// THN importer — pulls participating-site data from the Australian Government
// Take Home Naloxone (THN) Program locator and UPSERTs into `locations`.
//
// Source feature service:
//   https://services5.arcgis.com/OvOcYIrJnM97ABBA/ArcGIS/rest/services/
//     Take_Home_Naloxone_Program/FeatureServer/0
//
// Constitution V + D-013: registry membership is NOT a trust signal.
// Imported rows land at `verificationLevel = "unverified"`, regardless of
// existing community reports. The registry membership is recorded via
// `thnObjectId`; the detail sheet surfaces it as a neutral fact, never as
// a verification badge. Community reports are what create trust.
//
// Idempotency: UPSERT on `thnObjectId`. Re-running this script with no
// changes upstream is a no-op. If the registry removes a site, we leave
// the row in place (community history, watches, etc. would otherwise be
// orphaned); a future archival pass can decide whether to soft-delete.
//
// Run:
//   tsx server/scripts/import-thn.ts
// =============================================================================

const FEATURE_SERVER =
  "https://services5.arcgis.com/OvOcYIrJnM97ABBA/ArcGIS/rest/services/Take_Home_Naloxone_Program/FeatureServer/0";

const PAGE_SIZE = 2000;

interface ThnFeature {
  attributes: {
    OBJECTID: number;
    Org_Name: string | null;
    Address: string | null;
    Locality: string | null;
    State: string | null;
    Postcode: string | null;
  };
  geometry: { x: number; y: number } | null;
}

interface ThnPage {
  features: ThnFeature[];
  exceededTransferLimit?: boolean;
}

async function fetchPage(offset: number): Promise<ThnPage> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "OBJECTID,Org_Name,Address,Locality,State,Postcode",
    outSR: "4326", // WGS84 lat/lon
    returnGeometry: "true",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    f: "json",
  });
  const url = `${FEATURE_SERVER}/query?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`THN fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ThnPage;
}

// Heuristic classification by Org_Name keywords. The THN dataset doesn't
// include a category field, so we read the org name. Order matters — more
// specific keywords first.
function classifyType(orgName: string): LocationType {
  const n = orgName.toLowerCase();
  if (
    n.includes("hospital") ||
    n.includes("emergency dept") ||
    n.includes(" ed ") ||
    n.endsWith(" ed")
  )
    return "hospital";
  if (
    n.includes("needle") ||
    n.includes("syringe") ||
    n.includes("nsp") ||
    n.includes("harm reduction")
  )
    return "nsp";
  if (
    n.includes("drug and alcohol") ||
    n.includes("drug & alcohol") ||
    n.includes("alcohol and other drug") ||
    n.includes(" aod") ||
    n.includes("addiction")
  )
    return "aod_organisation";
  if (n.includes("community health") || n.includes("primary health"))
    return "community_health";
  if (
    n.includes("pharmacy") ||
    n.includes("chemist") ||
    n.includes("priceline") ||
    n.includes("amcal") ||
    n.includes("terrywhite") ||
    n.includes("blooms")
  )
    return "pharmacy";
  if (n.includes("library")) return "library";
  if (n.includes("drop-in") || n.includes("drop in")) return "drop_in_centre";
  return "other";
}

function joinAddress(a: ThnFeature["attributes"]): string {
  const parts = [
    a.Address?.trim(),
    a.Locality?.trim(),
    [a.State?.trim(), a.Postcode?.trim()].filter(Boolean).join(" "),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.join(", ");
}

interface ImportStats {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

async function main(): Promise<void> {
  const stats: ImportStats = { fetched: 0, inserted: 0, updated: 0, skipped: 0 };
  let offset = 0;

  while (true) {
    logger.info({ offset }, "fetching THN page");
    const page = await fetchPage(offset);
    const features = page.features ?? [];
    if (features.length === 0) break;
    stats.fetched += features.length;

    for (const f of features) {
      const a = f.attributes;
      const id = a.OBJECTID;
      const name = a.Org_Name?.trim();
      const geo = f.geometry;

      if (!name || !geo) {
        stats.skipped += 1;
        continue;
      }

      const address = joinAddress(a);
      if (!address) {
        stats.skipped += 1;
        continue;
      }

      const type = classifyType(name);
      // ArcGIS returns x = longitude, y = latitude.
      const longitude = geo.x.toFixed(8);
      const latitude = geo.y.toFixed(8);

      // UPSERT by thnObjectId. We never downgrade an existing row's
      // verificationLevel — community work that promoted a row to
      // community_verified or a guardian that flagged it as official is
      // preserved across re-imports.
      const result = await db
        .insert(schema.locations)
        .values({
          name,
          address,
          latitude,
          longitude,
          type,
          naloxoneForms: ["nasal_spray"],
          verificationLevel: "unverified",
          thnObjectId: id,
        })
        .onConflictDoUpdate({
          target: schema.locations.thnObjectId,
          set: {
            name: sql`EXCLUDED.name`,
            address: sql`EXCLUDED.address`,
            latitude: sql`EXCLUDED.latitude`,
            longitude: sql`EXCLUDED.longitude`,
            // Don't overwrite type if a guardian/admin has reclassified.
            // Initial inserts get the heuristic type; later edits stick.
          },
        })
        .returning({ id: schema.locations.id, addedAt: schema.locations.addedAt });

      const row = result[0];
      // Heuristic: if addedAt is within the last second, treat as inserted.
      // (Drizzle/postgres doesn't differentiate insert vs update on
      // ON CONFLICT in a portable way without a separate query.)
      if (row && Date.now() - row.addedAt.getTime() < 1000) {
        stats.inserted += 1;
      } else {
        stats.updated += 1;
      }
    }

    if (!page.exceededTransferLimit && features.length < PAGE_SIZE) break;
    offset += features.length;
  }

  logger.info(stats, "THN import complete");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error({ err }, "THN import failed");
    process.exit(1);
  });
