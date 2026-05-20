import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "./db.js";
import {
  composeLocationWithConsensus,
  haversineDistance,
  surfaceBarrierFacts,
} from "../../shared/consensus.js";
import type {
  GuardianNoteWithGuardian,
  Location,
  LocationType,
  LocationWithConsensus,
  Report,
  VerificationLevel,
} from "../../shared/schema.js";
import { LOCATION_TYPES, VERIFICATION_LEVELS } from "../../shared/schema.js";

// -----------------------------------------------------------------------------
// Filters accepted by the list endpoint. Each is optional.
// -----------------------------------------------------------------------------

export interface LocationListFilters {
  bbox?: { swLat: number; swLon: number; neLat: number; neLon: number };
  type?: string[];
  verification?: string[];
  recentOnly?: boolean;
  openNow?: boolean;
}

function narrowLocationTypes(values: string[]): LocationType[] {
  return values.filter((v): v is LocationType =>
    (LOCATION_TYPES as readonly string[]).includes(v),
  );
}

function narrowVerificationLevels(values: string[]): VerificationLevel[] {
  return values.filter((v): v is VerificationLevel =>
    (VERIFICATION_LEVELS as readonly string[]).includes(v),
  );
}

export interface UserGeo {
  lat: number;
  lon: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// List
// -----------------------------------------------------------------------------

export async function getLocationsWithConsensus(
  filters: LocationListFilters,
  geo?: UserGeo,
): Promise<LocationWithConsensus[]> {
  const conditions = [isNull(schema.locations.archivedAt)];

  if (filters.type && filters.type.length > 0) {
    const types = narrowLocationTypes(filters.type);
    if (types.length > 0) {
      conditions.push(inArray(schema.locations.type, types));
    }
  }
  if (filters.verification && filters.verification.length > 0) {
    const levels = narrowVerificationLevels(filters.verification);
    if (levels.length > 0) {
      conditions.push(inArray(schema.locations.verificationLevel, levels));
    }
  }
  if (filters.recentOnly) {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
    conditions.push(gte(schema.locations.lastReportAt, sevenDaysAgo));
  }
  if (filters.bbox) {
    const { swLat, swLon, neLat, neLon } = filters.bbox;
    // Compare against the numeric columns directly (no CAST) so the
    // composite (latitude, longitude) B-tree from shared/schema.ts is
    // eligible for an index scan.
    conditions.push(
      sql`${schema.locations.latitude} BETWEEN ${swLat} AND ${neLat}`,
    );
    conditions.push(
      sql`${schema.locations.longitude} BETWEEN ${swLon} AND ${neLon}`,
    );
  }

  // Slim SELECT: detail-only fields (hours_structured, access_notes, phone,
  // website, partnerOrgId, hours free-text) are loaded by the detail endpoint
  // when a pin is opened. The list payload only needs what the map markers,
  // filters and search-results UI render.
  const rows = await db
    .select({
      id: schema.locations.id,
      name: schema.locations.name,
      address: schema.locations.address,
      latitude: schema.locations.latitude,
      longitude: schema.locations.longitude,
      type: schema.locations.type,
      naloxoneForms: schema.locations.naloxoneForms,
      tags: schema.locations.tags,
      verificationLevel: schema.locations.verificationLevel,
      thnObjectId: schema.locations.thnObjectId,
      nswNspListing: schema.locations.nswNspListing,
      vicNspListing: schema.locations.vicNspListing,
      vicNspSuppliesNaloxone: schema.locations.vicNspSuppliesNaloxone,
      totalReportsCount: schema.locations.totalReportsCount,
      reliabilityScore: schema.locations.reliabilityScore,
      lastReportAt: schema.locations.lastReportAt,
      addedAt: schema.locations.addedAt,
      archivedAt: schema.locations.archivedAt,
    })
    .from(schema.locations)
    .where(and(...conditions));

  if (rows.length === 0) return [];

  // Fetch the last 90 days of reports for every location in one query and
  // group in JS. The 90-day window is the upper bound for both pin recency
  // (72h subset) and barrier surfacing (30/90-day windows from
  // algorithms.md §3). Narrow SELECT to just the fields surfaceBarrierFacts +
  // calculatePinStatus need — skipping `notes` (up to 500 chars/row) cuts the
  // payload meaningfully when a viewport has many active locations.
  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);
  const seventyTwoHoursAgo = new Date(Date.now() - SEVENTY_TWO_HOURS_MS);
  const reportRows = await db
    .select({
      locationId: schema.reports.locationId,
      reportType: schema.reports.reportType,
      submittedAt: schema.reports.submittedAt,
      barriers: schema.reports.barriers,
      costAmount: schema.reports.costAmount,
      weight: schema.reports.weight,
    })
    .from(schema.reports)
    .where(
      and(
        inArray(
          schema.reports.locationId,
          rows.map((r) => r.id),
        ),
        gte(schema.reports.submittedAt, ninetyDaysAgo),
      ),
    );
  const reportsByLocation = groupBy(reportRows, (r) => r.locationId);

  return rows.map((loc) => {
    const allRecent = reportsByLocation.get(loc.id) ?? [];
    const last72h = allRecent.filter(
      (r) => r.submittedAt.getTime() >= seventyTwoHoursAgo.getTime(),
    );
    const distance =
      geo &&
      haversineDistance(geo, {
        lat: Number(loc.latitude),
        lon: Number(loc.longitude),
      });
    // Cast the narrowed rows back through the composer; it only reads fields
    // we've SELECTed (status/size/etc.) so the missing detail-only columns
    // (hours, phone, website, …) are surfaced as `undefined` to clients,
    // which is what we want — they're loaded on demand by the detail sheet.
    const composed = composeLocationWithConsensus(
      loc as unknown as Parameters<typeof composeLocationWithConsensus>[0],
      last72h as unknown as Parameters<typeof composeLocationWithConsensus>[1],
      allRecent as unknown as Parameters<typeof composeLocationWithConsensus>[2],
      [],
      { distance },
    );
    composed.reliabilityStars = Math.round(Number(loc.reliabilityScore));
    composed.recentReports = [];
    composed.guardianNotes = [];
    composed.barrierFacts = surfaceBarrierFacts(
      allRecent as unknown as Parameters<typeof surfaceBarrierFacts>[0],
    );
    return composed;
  });
}

// -----------------------------------------------------------------------------
// Detail
// -----------------------------------------------------------------------------

export async function getLocationWithConsensus(
  id: string,
  geo?: UserGeo,
): Promise<LocationWithConsensus | null> {
  const [loc] = await db
    .select()
    .from(schema.locations)
    .where(and(eq(schema.locations.id, id), isNull(schema.locations.archivedAt)))
    .limit(1);

  if (!loc) return null;

  const allReports = await db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.locationId, id))
    .orderBy(desc(schema.reports.submittedAt));

  const seventyTwoHoursAgo = new Date(Date.now() - SEVENTY_TWO_HOURS_MS);
  const recent = allReports.filter(
    (r) => r.submittedAt.getTime() >= seventyTwoHoursAgo.getTime(),
  );

  const recentForTimeline = allReports.slice(0, 10);

  // Phase 7 wires guardian notes here. Joined with the guardian record so we
  // get firstName + organisation in one round trip.
  const noteRows = await db
    .select({
      id: schema.guardianNotes.id,
      noteText: schema.guardianNotes.noteText,
      updatedAt: schema.guardianNotes.updatedAt,
      guardianFirstName: schema.guardians.firstName,
      guardianOrganisation: schema.guardians.organisation,
    })
    .from(schema.guardianNotes)
    .innerJoin(
      schema.guardians,
      eq(schema.guardianNotes.guardianId, schema.guardians.id),
    )
    .where(
      and(
        eq(schema.guardianNotes.locationId, id),
        sql`${schema.guardianNotes.archivedAt} IS NULL`,
      ),
    )
    .orderBy(desc(schema.guardianNotes.updatedAt));
  const guardianNotes: GuardianNoteWithGuardian[] = noteRows;

  const distance =
    geo &&
    haversineDistance(geo, {
      lat: Number(loc.latitude),
      lon: Number(loc.longitude),
    });

  const composed = composeLocationWithConsensus(
    loc,
    recent,
    allReports,
    guardianNotes,
    { distance },
  );
  composed.recentReports = recentForTimeline;
  return composed;
}

// -----------------------------------------------------------------------------
// Search
// -----------------------------------------------------------------------------

export async function searchLocations(
  query: string,
  limit: number,
  geo?: UserGeo,
): Promise<LocationWithConsensus[]> {
  if (!query.trim()) return [];

  const like = `%${query.trim()}%`;
  const rows = await db
    .select()
    .from(schema.locations)
    .where(
      and(
        isNull(schema.locations.archivedAt),
        or(ilike(schema.locations.name, like), ilike(schema.locations.address, like)),
      ),
    )
    .limit(limit);

  if (rows.length === 0) return [];

  const seventyTwoHoursAgo = new Date(Date.now() - SEVENTY_TWO_HOURS_MS);
  const recentReportRows = await db
    .select()
    .from(schema.reports)
    .where(
      and(
        inArray(
          schema.reports.locationId,
          rows.map((r) => r.id),
        ),
        gte(schema.reports.submittedAt, seventyTwoHoursAgo),
      ),
    );
  const recentByLocation = groupBy(recentReportRows, (r) => r.locationId);

  return rows
    .map((loc) => {
      const recent = recentByLocation.get(loc.id) ?? [];
      const distance =
        geo &&
        haversineDistance(geo, {
          lat: Number(loc.latitude),
          lon: Number(loc.longitude),
        });
      const composed = composeLocationWithConsensus(loc, recent, [], [], { distance });
      composed.reliabilityStars = Math.round(Number(loc.reliabilityScore));
      composed.recentReports = [];
      composed.guardianNotes = [];
      composed.barrierFacts = [];
      return composed;
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
