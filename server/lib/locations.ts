import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "./db.js";
import {
  composeLocationWithConsensus,
  haversineDistance,
} from "@shared/consensus";
import type {
  GuardianNoteWithGuardian,
  Location,
  LocationType,
  LocationWithConsensus,
  Report,
  VerificationLevel,
} from "@shared/schema";
import { LOCATION_TYPES, VERIFICATION_LEVELS } from "@shared/schema";

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
    conditions.push(
      sql`CAST(${schema.locations.latitude} AS double precision) BETWEEN ${swLat} AND ${neLat}`,
    );
    conditions.push(
      sql`CAST(${schema.locations.longitude} AS double precision) BETWEEN ${swLon} AND ${neLon}`,
    );
  }

  const rows = await db
    .select()
    .from(schema.locations)
    .where(and(...conditions));

  if (rows.length === 0) return [];

  // Fetch the last 72h of reports for every location in one query, group in JS.
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

  return rows.map((loc) => {
    const recent = recentByLocation.get(loc.id) ?? [];
    const distance =
      geo &&
      haversineDistance(geo, {
        lat: Number(loc.latitude),
        lon: Number(loc.longitude),
      });
    // List response omits recentReports / guardianNotes / barrierFacts for
    // payload size (contracts.md). Pass empty arrays to the composer; pin
    // status / size / stars are still computed.
    const composed = composeLocationWithConsensus(
      loc,
      recent,
      // Reliability score is denormalised on the row; for the list endpoint
      // we trust that value and pass an empty `allReports` to skip the
      // expensive aggregate. Phase 3 may revise.
      [],
      [],
      { distance },
    );
    composed.reliabilityStars = Math.round(Number(loc.reliabilityScore));
    composed.recentReports = [];
    composed.guardianNotes = [];
    composed.barrierFacts = [];
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

  // Phase 1 has no guardians table populated — empty array. Phase 7 wires
  // this up.
  const guardianNotes: GuardianNoteWithGuardian[] = [];

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

// Re-export Report for callers that need it.
export type { Location, Report };
