import "dotenv/config";

import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { sql } from "drizzle-orm";
import { calculateReliabilityScore } from "@shared/consensus";
import type { BarrierValue, ReportType } from "@shared/schema";

type DbInsertLocation = typeof schema.locations.$inferInsert;

// =============================================================================
// Locations — a mix of NSPs, pharmacies, hospitals, libraries, AOD orgs, and a
// festival site, across Sydney / Melbourne / Brisbane.
//
// Addresses are plausible-real for demo purposes. Before any production launch
// they need verification against the live THN program data. Treat this seed
// as a fixture, not a directory.
// =============================================================================

interface SeedLocation extends Omit<DbInsertLocation, "id" | "addedAt" | "totalReportsCount" | "reliabilityScore" | "lastReportAt" | "archivedAt" | "addedByDeviceKey"> {
  /** Demo-only: which "narrative" should the seeded reports follow? */
  narrative: "mostly_success" | "mixed" | "mostly_denied" | "stock_problems" | "stale";
}

const LOCATIONS: SeedLocation[] = [
  // --- Sydney ---
  {
    name: "Uniting Medically Supervised Injecting Centre",
    address: "66 Darlinghurst Road, Kings Cross NSW 2011",
    latitude: "-33.87286",
    longitude: "151.22189",
    type: "nsp",
    hours: "Mon-Sun 7:00-21:00",
    phone: "02 9360 1191",
    website: "https://www.uniting.org",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["wheelchair_accessible", "no_id_required", "confidential", "peer_support"],
    verificationLevel: "official",
    narrative: "mostly_success",
  },
  {
    name: "Kirketon Road Centre",
    address: "Beare Park, Ithaca Road, Elizabeth Bay NSW 2011",
    latitude: "-33.87158",
    longitude: "151.22682",
    type: "nsp",
    hours: "Mon-Fri 9:30-18:00; Sat 11:00-15:30",
    phone: "02 9360 2766",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["no_id_required", "peer_support", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Chemist Warehouse Pitt Street",
    address: "199 Pitt Street, Sydney NSW 2000",
    latitude: "-33.86848",
    longitude: "151.20903",
    type: "pharmacy",
    hours: "Mon-Fri 8:00-21:00; Sat-Sun 9:00-19:00",
    phone: "02 9234 5678",
    website: "https://www.chemistwarehouse.com.au",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "community_verified",
    narrative: "mixed",
  },
  {
    name: "Priceline Pharmacy Town Hall",
    address: "Town Hall Square, 464 Kent Street, Sydney NSW 2000",
    latitude: "-33.87332",
    longitude: "151.20614",
    type: "pharmacy",
    hours: "Mon-Fri 7:30-21:00; Sat 8:00-20:00; Sun 9:00-19:00",
    phone: "02 9264 4022",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "unverified",
    narrative: "mostly_denied",
  },
  {
    name: "St Vincent's Hospital Sydney",
    address: "390 Victoria Street, Darlinghurst NSW 2010",
    latitude: "-33.87902",
    longitude: "151.22253",
    type: "hospital",
    hours: "Mon-Sun 24:00",
    phone: "02 8382 1111",
    website: "https://www.svhs.org.au",
    naloxoneForms: ["injectable"],
    tags: ["wheelchair_accessible", "open_24_7", "emergency_available"],
    verificationLevel: "official",
    narrative: "mixed",
  },
  {
    name: "Sydney City Library — Customs House",
    address: "31 Alfred Street, Sydney NSW 2000",
    latitude: "-33.86157",
    longitude: "151.21039",
    type: "library",
    hours: "Mon-Fri 8:00-19:00; Sat-Sun 11:00-16:00",
    phone: "02 9242 8595",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible", "no_id_required", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Newtown Drop-In",
    address: "245 King Street, Newtown NSW 2042",
    latitude: "-33.89812",
    longitude: "151.17996",
    type: "drop_in_centre",
    hours: "Mon-Fri 10:00-17:00",
    phone: "02 9519 8273",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["no_id_required", "peer_support", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "TerryWhite Chemmart Bondi Junction",
    address: "Westfield Bondi Junction, 500 Oxford Street, Bondi Junction NSW 2022",
    latitude: "-33.89108",
    longitude: "151.24868",
    type: "pharmacy",
    hours: "Mon-Fri 8:00-21:00; Sat 9:00-18:00; Sun 10:00-17:00",
    phone: "02 9389 2244",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "unverified",
    narrative: "stock_problems",
  },
  {
    name: "South Court Community Health",
    address: "82 Glebe Point Road, Glebe NSW 2037",
    latitude: "-33.87786",
    longitude: "151.18473",
    type: "community_health",
    hours: "Mon-Fri 9:00-17:00",
    phone: "02 9660 4944",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["wheelchair_accessible", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mixed",
  },
  {
    name: "WHOS Drug & Alcohol Service",
    address: "47 Iredale Street, Newtown NSW 2042",
    latitude: "-33.89567",
    longitude: "151.18162",
    type: "aod_organisation",
    hours: "Mon-Fri 9:00-17:00",
    phone: "02 8572 7444",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["peer_support", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },

  // --- Melbourne ---
  {
    name: "North Richmond Community Health — Medically Supervised Injecting Room",
    address: "23 Lennox Street, Richmond VIC 3121",
    latitude: "-37.81557",
    longitude: "144.99841",
    type: "nsp",
    hours: "Mon-Sun 7:00-23:00",
    phone: "03 9418 9800",
    website: "https://nrch.com.au",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["wheelchair_accessible", "no_id_required", "confidential", "peer_support"],
    verificationLevel: "official",
    narrative: "mostly_success",
  },
  {
    name: "Health Works Footscray",
    address: "146 Nicholson Street, Footscray VIC 3011",
    latitude: "-37.80100",
    longitude: "144.89947",
    type: "community_health",
    hours: "Mon-Fri 8:30-17:00",
    phone: "03 9448 1600",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["wheelchair_accessible", "confidential", "peer_support"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Chemist Warehouse Bourke Street",
    address: "210 Bourke Street, Melbourne VIC 3000",
    latitude: "-37.81423",
    longitude: "144.96743",
    type: "pharmacy",
    hours: "Mon-Sun 8:00-21:00",
    phone: "03 9650 5050",
    website: "https://www.chemistwarehouse.com.au",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "community_verified",
    narrative: "mixed",
  },
  {
    name: "State Library Victoria",
    address: "328 Swanston Street, Melbourne VIC 3000",
    latitude: "-37.80979",
    longitude: "144.96528",
    type: "library",
    hours: "Mon-Thu 10:00-21:00; Fri-Sun 10:00-18:00",
    phone: "03 8664 7000",
    website: "https://www.slv.vic.gov.au",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible", "no_id_required", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Royal Melbourne Hospital ED",
    address: "300 Grattan Street, Parkville VIC 3050",
    latitude: "-37.79853",
    longitude: "144.95626",
    type: "hospital",
    hours: "Mon-Sun 24:00",
    phone: "03 9342 7000",
    website: "https://www.thermh.org.au",
    naloxoneForms: ["injectable"],
    tags: ["wheelchair_accessible", "open_24_7", "emergency_available"],
    verificationLevel: "official",
    narrative: "mixed",
  },
  {
    name: "Cohealth Footscray",
    address: "78 Paisley Street, Footscray VIC 3011",
    latitude: "-37.80127",
    longitude: "144.90108",
    type: "community_health",
    hours: "Mon-Fri 9:00-17:00",
    phone: "03 9448 0200",
    website: "https://www.cohealth.org.au",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["wheelchair_accessible", "peer_support", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Salvation Army AOD — Crossroads",
    address: "69 Bourke Street, Melbourne VIC 3000",
    latitude: "-37.81293",
    longitude: "144.97221",
    type: "aod_organisation",
    hours: "Mon-Fri 9:00-17:00",
    phone: "03 9653 3211",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["peer_support", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Priceline Pharmacy Melbourne Central",
    address: "Shop 218 Melbourne Central, 211 La Trobe Street, Melbourne VIC 3000",
    latitude: "-37.81004",
    longitude: "144.96295",
    type: "pharmacy",
    hours: "Mon-Sun 8:00-21:00",
    phone: "03 9663 3211",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "unverified",
    narrative: "mixed",
  },
  {
    name: "Capital Chemist Brunswick",
    address: "390 Sydney Road, Brunswick VIC 3056",
    latitude: "-37.76717",
    longitude: "144.96198",
    type: "pharmacy",
    hours: "Mon-Fri 8:30-19:00; Sat 9:00-17:00",
    phone: "03 9387 8000",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Living Room Drop-In",
    address: "7-9 Hosier Lane, Melbourne VIC 3000",
    latitude: "-37.81670",
    longitude: "144.96973",
    type: "drop_in_centre",
    hours: "Mon-Fri 9:00-17:30",
    phone: "03 9650 0680",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["no_id_required", "peer_support", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },

  // --- Brisbane ---
  {
    name: "QuIHN Brisbane",
    address: "1 Hamilton Place, Bowen Hills QLD 4006",
    latitude: "-27.44617",
    longitude: "153.03345",
    type: "nsp",
    hours: "Mon-Fri 9:00-17:00",
    phone: "07 3620 8111",
    website: "https://www.quihn.org",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["no_id_required", "peer_support", "confidential"],
    verificationLevel: "official",
    narrative: "mostly_success",
  },
  {
    name: "Royal Brisbane and Women's Hospital",
    address: "Butterfield Street, Herston QLD 4029",
    latitude: "-27.44664",
    longitude: "153.02897",
    type: "hospital",
    hours: "Mon-Sun 24:00",
    phone: "07 3646 8111",
    naloxoneForms: ["injectable"],
    tags: ["wheelchair_accessible", "open_24_7", "emergency_available"],
    verificationLevel: "official",
    narrative: "mixed",
  },
  {
    name: "Brisbane Square Library",
    address: "266 George Street, Brisbane City QLD 4000",
    latitude: "-27.47148",
    longitude: "153.02385",
    type: "library",
    hours: "Mon-Thu 9:00-19:00; Fri 9:00-17:00; Sat 9:00-16:00; Sun 10:00-16:00",
    phone: "07 3403 4166",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible", "no_id_required", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Chemist Warehouse Queen Street Mall",
    address: "Shop 7-9, 91 Queen Street, Brisbane City QLD 4000",
    latitude: "-27.46946",
    longitude: "153.02523",
    type: "pharmacy",
    hours: "Mon-Sun 8:00-21:00",
    phone: "07 3010 8500",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "community_verified",
    narrative: "mixed",
  },
  {
    name: "Biala Community Health Centre",
    address: "270 Roma Street, Brisbane City QLD 4000",
    latitude: "-27.46735",
    longitude: "153.01935",
    type: "community_health",
    hours: "Mon-Fri 8:30-16:30",
    phone: "07 3837 5611",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["wheelchair_accessible", "peer_support", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Hot House (3rd Space)",
    address: "44 Wickham Street, Fortitude Valley QLD 4006",
    latitude: "-27.45605",
    longitude: "153.03283",
    type: "drop_in_centre",
    hours: "Mon-Fri 8:00-16:00",
    phone: "07 3257 2400",
    naloxoneForms: ["nasal_spray"],
    tags: ["no_id_required", "peer_support", "confidential"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "TerryWhite Chemmart Brunswick Street",
    address: "1000 Brunswick Street, New Farm QLD 4005",
    latitude: "-27.46783",
    longitude: "153.04573",
    type: "pharmacy",
    hours: "Mon-Fri 7:30-21:00; Sat-Sun 9:00-18:00",
    phone: "07 3358 5111",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "unverified",
    narrative: "mostly_denied",
  },

  // --- A festival site (time-bounded) and a stale-reports outlier ---
  {
    name: "Strawberry Fields Medic Tent",
    address: "Tocumwal NSW 2714 (festival site)",
    latitude: "-35.81421",
    longitude: "145.56789",
    type: "festival_site",
    hours: "Fri-Sun 24:00 (festival weekend)",
    naloxoneForms: ["nasal_spray", "injectable"],
    tags: ["no_id_required", "peer_support", "confidential", "emergency_available"],
    verificationLevel: "community_verified",
    narrative: "mostly_success",
  },
  {
    name: "Carlton Family Pharmacy",
    address: "440 Lygon Street, Carlton VIC 3053",
    latitude: "-37.79938",
    longitude: "144.96740",
    type: "pharmacy",
    hours: "Mon-Fri 9:00-19:00; Sat 9:00-13:00",
    phone: "03 9347 1234",
    naloxoneForms: ["nasal_spray"],
    tags: ["wheelchair_accessible"],
    verificationLevel: "unverified",
    narrative: "stale",
  },
];

// =============================================================================
// Reports — generate ~10 per location based on the narrative.
// =============================================================================

function generateReports(narrative: SeedLocation["narrative"]): {
  reportType: ReportType;
  hoursAgo: number;
  barriers: BarrierValue[];
  costAmount?: string;
  notes?: string;
}[] {
  const HOUR = 1;
  const DAY = 24;

  switch (narrative) {
    case "mostly_success":
      return [
        { reportType: "success", hoursAgo: 2 * HOUR, barriers: [] },
        { reportType: "success", hoursAgo: 8 * HOUR, barriers: [] },
        { reportType: "success", hoursAgo: 1 * DAY, barriers: [] },
        { reportType: "success", hoursAgo: 2 * DAY, barriers: [] },
        { reportType: "success_but", hoursAgo: 3 * DAY, barriers: ["staff_unsure"] },
        { reportType: "success", hoursAgo: 4 * DAY, barriers: [] },
        { reportType: "success", hoursAgo: 6 * DAY, barriers: [] },
        { reportType: "success", hoursAgo: 9 * DAY, barriers: [] },
        { reportType: "success_but", hoursAgo: 12 * DAY, barriers: ["many_questions"] },
        { reportType: "success", hoursAgo: 18 * DAY, barriers: [] },
      ];
    case "mixed":
      return [
        { reportType: "success_but", hoursAgo: 4 * HOUR, barriers: ["id_required"] },
        { reportType: "success", hoursAgo: 14 * HOUR, barriers: [] },
        {
          reportType: "success_but",
          hoursAgo: 1 * DAY + 6 * HOUR,
          barriers: ["id_required", "many_questions"],
          notes: "Pharmacist asked a lot but eventually dispensed.",
        },
        { reportType: "success", hoursAgo: 2 * DAY, barriers: [] },
        {
          reportType: "success_but",
          hoursAgo: 3 * DAY,
          barriers: ["cost_involved"],
          costAmount: "40.00",
          notes: "They charged me. Said it was a fee.",
        },
        { reportType: "denied", hoursAgo: 4 * DAY + 5 * HOUR, barriers: ["prescription_required"] },
        { reportType: "success", hoursAgo: 6 * DAY, barriers: [] },
        { reportType: "success_but", hoursAgo: 8 * DAY, barriers: ["long_wait"] },
        { reportType: "out_of_stock", hoursAgo: 10 * DAY, barriers: [] },
        { reportType: "success", hoursAgo: 14 * DAY, barriers: [] },
      ];
    case "mostly_denied":
      return [
        { reportType: "denied", hoursAgo: 5 * HOUR, barriers: ["prescription_required"] },
        {
          reportType: "denied",
          hoursAgo: 1 * DAY,
          barriers: ["id_required", "medicare_required"],
          notes: "They refused without a Medicare card.",
        },
        { reportType: "denied", hoursAgo: 1 * DAY + 8 * HOUR, barriers: ["staff_rude"] },
        {
          reportType: "success_but",
          hoursAgo: 2 * DAY + 4 * HOUR,
          barriers: ["medicare_required", "many_questions"],
        },
        { reportType: "denied", hoursAgo: 4 * DAY, barriers: ["age_restriction"] },
        { reportType: "out_of_stock", hoursAgo: 5 * DAY, barriers: [] },
        { reportType: "denied", hoursAgo: 7 * DAY, barriers: ["prescription_required"] },
        { reportType: "denied", hoursAgo: 9 * DAY, barriers: ["staff_rude", "many_questions"] },
        { reportType: "success", hoursAgo: 12 * DAY, barriers: [] },
        { reportType: "denied", hoursAgo: 16 * DAY, barriers: ["staff_unsure"] },
      ];
    case "stock_problems":
      return [
        { reportType: "out_of_stock", hoursAgo: 3 * HOUR, barriers: [] },
        { reportType: "out_of_stock", hoursAgo: 1 * DAY, barriers: ["wrong_form_only"] },
        { reportType: "success", hoursAgo: 1 * DAY + 6 * HOUR, barriers: [] },
        { reportType: "out_of_stock", hoursAgo: 2 * DAY + 2 * HOUR, barriers: [] },
        {
          reportType: "out_of_stock",
          hoursAgo: 3 * DAY,
          barriers: ["wrong_form_only"],
          notes: "Only injectable in stock; I wanted nasal.",
        },
        { reportType: "success", hoursAgo: 5 * DAY, barriers: [] },
        { reportType: "out_of_stock", hoursAgo: 6 * DAY + 4 * HOUR, barriers: [] },
        { reportType: "success_but", hoursAgo: 9 * DAY, barriers: ["wrong_form_only"] },
        { reportType: "success", hoursAgo: 12 * DAY, barriers: [] },
        { reportType: "out_of_stock", hoursAgo: 18 * DAY, barriers: [] },
      ];
    case "stale":
      // No reports in the last 7 days — pin should be grey.
      return [
        { reportType: "success", hoursAgo: 12 * DAY, barriers: [] },
        { reportType: "success", hoursAgo: 18 * DAY, barriers: [] },
        { reportType: "success_but", hoursAgo: 25 * DAY, barriers: ["id_required"] },
        { reportType: "success", hoursAgo: 35 * DAY, barriers: [] },
        { reportType: "success", hoursAgo: 40 * DAY, barriers: [] },
        { reportType: "denied", hoursAgo: 45 * DAY, barriers: ["staff_rude"] },
        { reportType: "success", hoursAgo: 55 * DAY, barriers: [] },
        { reportType: "success", hoursAgo: 60 * DAY, barriers: [] },
      ];
  }
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fakeDeviceKey(seed: number): string {
  // Stable per-seed pseudo-random hex. Each seeded report gets a distinct
  // device key so we don't collide on the device_reports unique index.
  let n = seed >>> 0;
  let out = "";
  for (let i = 0; i < 16; i++) {
    n = (n * 1664525 + 1013904223) >>> 0;
    out += (n & 0xff).toString(16).padStart(2, "0");
  }
  return out;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  logger.info("seeding NaloxoneLocate dev database");

  // Wipe in dependency order. `device_reports` cascades from `locations`
  // anyway, but being explicit makes the intent obvious.
  await db.delete(schema.deviceReports);
  await db.delete(schema.reports);
  await db.delete(schema.locations);
  logger.info("cleared existing rows");

  let totalReports = 0;
  let deviceSeed = 1;

  for (const seedLoc of LOCATIONS) {
    const { narrative, ...insertable } = seedLoc;
    const [created] = await db
      .insert(schema.locations)
      .values(insertable)
      .returning();
    if (!created) throw new Error(`Failed to insert location ${seedLoc.name}`);

    const reports = generateReports(narrative);
    for (const r of reports) {
      const submittedAt = new Date(Date.now() - r.hoursAgo * 60 * 60 * 1000);
      const deviceKey = fakeDeviceKey(deviceSeed++);

      await db.insert(schema.reports).values({
        locationId: created.id,
        deviceKey,
        reportType: r.reportType,
        visitDate: isoDate(submittedAt),
        submittedAt,
        barriers: r.barriers,
        ...(r.costAmount !== undefined ? { costAmount: r.costAmount } : {}),
        ...(r.notes !== undefined ? { notes: r.notes } : {}),
      });

      totalReports++;
    }

    // Update denormalised aggregates on the location row to match the inserted
    // reports. Phase 3 owns the canonical recomputation; this is a quick seed
    // helper.
    const allReports = await db
      .select()
      .from(schema.reports)
      .where(sql`${schema.reports.locationId} = ${created.id}`);

    const lastReportAt = allReports.reduce<Date | null>((acc, r) => {
      if (!acc || r.submittedAt.getTime() > acc.getTime()) return r.submittedAt;
      return acc;
    }, null);

    const reliability = calculateReliabilityScore(allReports);

    await db
      .update(schema.locations)
      .set({
        totalReportsCount: allReports.length,
        reliabilityScore: reliability.score.toFixed(2),
        lastReportAt,
      })
      .where(sql`${schema.locations.id} = ${created.id}`);

    logger.info(
      { name: seedLoc.name, narrative, reports: allReports.length },
      "seeded location",
    );
  }

  logger.info(
    { locations: LOCATIONS.length, totalReports },
    "seed complete",
  );
}

main().catch((err) => {
  logger.error({ err }, "seed failed");
  process.exit(1);
});
