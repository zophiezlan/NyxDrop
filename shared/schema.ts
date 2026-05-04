import { sql } from "drizzle-orm";
import {
  date,
  decimal,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================================================
// Constant vocabularies (closed sets — adding requires a constitution amendment)
// =============================================================================

export const LOCATION_TYPES = [
  "nsp",
  "pharmacy",
  "hospital",
  "community_health",
  "aod_organisation",
  "library",
  "public_building",
  "festival_site",
  "drop_in_centre",
  "other",
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const NALOXONE_FORMS = ["nasal_spray", "injectable"] as const;
export type NaloxoneForm = (typeof NALOXONE_FORMS)[number];

export const VERIFICATION_LEVELS = [
  "unverified",
  "community_verified",
  "official",
] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const LOCATION_TAGS = [
  "wheelchair_accessible",
  "no_id_required",
  "bulk_available",
  "open_24_7",
  "confidential",
  "peer_support",
  "emergency_available",
] as const;
export type LocationTag = (typeof LOCATION_TAGS)[number];

export const REPORT_TYPES = [
  "success",
  "success_but",
  "out_of_stock",
  "denied",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const BARRIER_VALUES = [
  "id_required",
  "medicare_required",
  "prescription_required",
  "cost_involved",
  "wrong_form_only",
  "long_wait",
  "staff_unsure",
  "staff_rude",
  "many_questions",
  "age_restriction",
  "limited_hours",
] as const;
export type BarrierValue = (typeof BARRIER_VALUES)[number];

// Per-day windows of trading hours, parsed from the free-text `hours` field.
// See algorithms.md §7 for the parser and isOpenNow logic.
export type OpeningHoursWindow = { from: string; to: string };
export type OpeningHours = Partial<
  Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", OpeningHoursWindow[]>
>;

// =============================================================================
// locations
// =============================================================================

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),

  type: text("type", { enum: LOCATION_TYPES }).notNull(),
  hours: text("hours"),
  hoursStructured: jsonb("hours_structured").$type<OpeningHours | null>(),
  phone: text("phone"),
  website: text("website"),
  accessNotes: text("access_notes"),

  naloxoneForms: jsonb("naloxone_forms")
    .$type<NaloxoneForm[]>()
    .notNull()
    .default(sql`'["nasal_spray"]'::jsonb`),

  tags: jsonb("tags")
    .$type<LocationTag[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  verificationLevel: text("verification_level", { enum: VERIFICATION_LEVELS })
    .notNull()
    .default("unverified"),

  partnerOrgId: varchar("partner_org_id"),

  addedByDeviceKey: text("added_by_device_key"),
  addedAt: timestamp("added_at").notNull().defaultNow(),

  // denormalised hot fields, kept in sync via the report-insert pipeline
  totalReportsCount: integer("total_reports_count").notNull().default(0),
  reliabilityScore: decimal("reliability_score", { precision: 3, scale: 2 })
    .notNull()
    .default("0.00"),
  lastReportAt: timestamp("last_report_at"),

  archivedAt: timestamp("archived_at"),
});

// =============================================================================
// reports
// =============================================================================

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  deviceKey: text("device_key").notNull(),

  reportType: text("report_type", { enum: REPORT_TYPES }).notNull(),

  visitDate: date("visit_date").notNull(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),

  barriers: jsonb("barriers")
    .$type<BarrierValue[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  costAmount: decimal("cost_amount", { precision: 6, scale: 2 }),

  notes: text("notes"),

  weight: decimal("weight", { precision: 4, scale: 3 }).notNull().default("1.000"),
});

// =============================================================================
// device_reports — rate-limit ledger
// =============================================================================

export const deviceReports = pgTable(
  "device_reports",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    deviceKey: text("device_key").notNull(),
    locationId: varchar("location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    lastReportAt: timestamp("last_report_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("device_reports_uniq").on(t.deviceKey, t.locationId),
  }),
);

// =============================================================================
// Zod insert schemas
// =============================================================================
//
// `createInsertSchema` derives from the Drizzle table; we `.omit` server-set
// columns and `.extend` to tighten beyond the DB column (length limits,
// allowed-value enums, cross-field rules — see contracts.md).

export const insertLocationSchema = createInsertSchema(locations)
  .omit({
    id: true,
    addedAt: true,
    totalReportsCount: true,
    reliabilityScore: true,
    lastReportAt: true,
    archivedAt: true,
  })
  .extend({
    name: z.string().min(1).max(200),
    address: z.string().min(1).max(300),
    type: z.enum(LOCATION_TYPES),
    hours: z.string().max(200).nullish(),
    phone: z.string().max(40).nullish(),
    website: z.string().url().max(300).nullish(),
    accessNotes: z.string().max(500).nullish(),
    naloxoneForms: z.array(z.enum(NALOXONE_FORMS)).min(1).max(2),
    tags: z.array(z.enum(LOCATION_TAGS)).max(LOCATION_TAGS.length),
    verificationLevel: z.enum(VERIFICATION_LEVELS).default("unverified"),
  });

export const insertReportSchema = createInsertSchema(reports)
  .omit({
    id: true,
    submittedAt: true,
    weight: true,
  })
  .extend({
    reportType: z.enum(REPORT_TYPES),
    barriers: z.array(z.enum(BARRIER_VALUES)).max(BARRIER_VALUES.length),
    notes: z.string().max(500).nullish(),
    costAmount: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === "number" ? v.toFixed(2) : v))
      .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/))
      .nullish(),
  });

// =============================================================================
// TypeScript types
// =============================================================================

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type DeviceReport = typeof deviceReports.$inferSelect;

// Consensus shape served by the API. Computed from `reports` via consensus.ts.
export interface BarrierFact {
  kind: "rare" | "occasional" | "frequent";
  barrier: BarrierValue;
  label: string;
  countInWindow: number;
  windowDays: number;
}

export interface GuardianNoteWithGuardian {
  id: string;
  noteText: string;
  updatedAt: Date;
  guardianFirstName: string;
  guardianOrganisation: string;
}

export type PinStatus = "green" | "amber" | "red" | "grey";

export interface LocationWithConsensus extends Location {
  pinStatus: PinStatus;
  pinSize: number;
  consensusLabel: string;
  reliabilityStars: number;
  recentReports: Report[];
  guardianNotes: GuardianNoteWithGuardian[];
  barrierFacts: BarrierFact[];
  distance?: number;
  isSaved?: boolean;
  isWatched?: boolean;
}
