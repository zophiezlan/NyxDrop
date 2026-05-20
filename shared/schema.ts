import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
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

// NSW Health publishes its Needle and Syringe Program outlets in three
// sub-lists. We retain the sub-list a location belongs to as a neutral
// presence flag — same constitutional rule as `thnObjectId` (D-013):
// listing membership is NOT a trust signal.
export const NSW_NSP_LISTINGS = ["primary", "secondary", "pharmacy"] as const;
export type NswNspListing = (typeof NSW_NSP_LISTINGS)[number];

// Victorian DHHS publishes its NSP outlets via a CartoDB endpoint with an
// `operating_model` field. Same constitutional rule (D-013).
export const VIC_NSP_LISTINGS = [
  "fixed_site",
  "secure_dispensing",
  "vehicle_outreach",
  "pharmacy",
  "foot_patrol",
] as const;
export type VicNspListing = (typeof VIC_NSP_LISTINGS)[number];

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

  /**
   * If this row was imported from the Australian Government Take Home
   * Naloxone Program participating-site locator, the OBJECTID from that
   * registry. Used as the upsert key by `server/scripts/import-thn.ts` so
   * re-running the importer is idempotent.
   *
   * Constitution V + D-013: registry membership is a non-trust signal,
   * separate from `verificationLevel`. Being on the THN registry means the
   * org has signed up to participate; it does NOT mean stock is available
   * today. The detail sheet surfaces this as a neutral fact, never as a
   * verification badge.
   */
  thnObjectId: integer("thn_object_id").unique(),

  /**
   * If this row appears in NSW Health's Needle and Syringe Program outlet
   * lists, which sub-list. `null` means the row is not on a NSW NSP list
   * (e.g. it's outside NSW, or NSW Health hasn't listed it). Set by the
   * NSW NSP importer (`server/scripts/import-nsw-nsp.ts`); preserved
   * across re-runs.
   *
   * Same constitutional rule as `thnObjectId` (D-013): being a NSW NSP
   * outlet says NSW Health knows the operator participates; it does NOT
   * mean stock is available today.
   */
  nswNspListing: text("nsw_nsp_listing", { enum: NSW_NSP_LISTINGS }),

  /**
   * If this row appears in Victorian DHHS's NSP outlet directory, the
   * operating-model classification. `null` if not on the Vic list.
   * Set by `server/scripts/import-vic-nsp.ts`; same D-013 rule.
   */
  vicNspListing: text("vic_nsp_listing", { enum: VIC_NSP_LISTINGS }),

  /**
   * The Vic dataset has a separate `naloxone` boolean indicating the
   * outlet is funded to supply naloxone through the NSP (distinct from
   * being in the THN registry, which covers pharmacies). Surfaced as a
   * neutral fact, not a trust signal — stock today is still a separate
   * question (D-013).
   */
  vicNspSuppliesNaloxone: boolean("vic_nsp_supplies_naloxone"),

  addedByDeviceKey: text("added_by_device_key"),
  addedAt: timestamp("added_at").notNull().defaultNow(),

  // denormalised hot fields, kept in sync via the report-insert pipeline
  totalReportsCount: integer("total_reports_count").notNull().default(0),
  reliabilityScore: decimal("reliability_score", { precision: 3, scale: 2 })
    .notNull()
    .default("0.00"),
  lastReportAt: timestamp("last_report_at"),

  archivedAt: timestamp("archived_at"),
}, (t) => ({
  // Bbox query path: WHERE archived_at IS NULL AND latitude BETWEEN … AND
  // longitude BETWEEN …  These let Postgres index-scan a viewport instead of
  // sequentially CASTing every row's lat/lon to double precision.
  archivedIdx: index("locations_archived_idx").on(t.archivedAt),
  latLonIdx: index("locations_lat_lon_idx").on(t.latitude, t.longitude),
}));

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
}, (t) => ({
  // Hot path: pull the last 90 days of reports for a set of locations to
  // compute barrierFacts + pinStatus on the list endpoint. A composite
  // (locationId, submittedAt DESC) index lets each per-location lookup hit
  // exactly the recent slice instead of scanning the whole report history.
  locSubmittedIdx: index("reports_location_submitted_idx").on(
    t.locationId,
    t.submittedAt,
  ),
}));

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
// guardians — vetted community partners (the only authenticated identity)
// =============================================================================

export const guardians = pgTable("guardians", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  organisation: text("organisation").notNull(),
  affiliatedLocationIds: jsonb("affiliated_location_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// =============================================================================
// guardian_tokens — bcrypt-hashed login tokens
// =============================================================================

export const guardianTokens = pgTable("guardian_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guardianId: varchar("guardian_id")
    .references(() => guardians.id, { onDelete: "cascade" })
    .notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
});

// =============================================================================
// guardian_sessions — server-side session storage for guardian admin auth
// =============================================================================

export const guardianSessions = pgTable("guardian_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guardianId: varchar("guardian_id")
    .references(() => guardians.id, { onDelete: "cascade" })
    .notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// =============================================================================
// guardian_notes — signed human context attached to locations
// =============================================================================

export const guardianNotes = pgTable("guardian_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  guardianId: varchar("guardian_id")
    .references(() => guardians.id, { onDelete: "cascade" })
    .notNull(),
  noteText: text("note_text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
});

// =============================================================================
// saved_places — user's saved locations (My Places "Saved" tab)
// =============================================================================

export const savedPlaces = pgTable(
  "saved_places",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    deviceKey: text("device_key").notNull(),
    locationId: varchar("location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    personalLabel: text("personal_label"),
    personalNote: text("personal_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("saved_places_uniq").on(t.deviceKey, t.locationId),
  }),
);

// =============================================================================
// watches — per-device, per-location watch with notification preferences
// =============================================================================

export const watches = pgTable(
  "watches",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    deviceKey: text("device_key").notNull(),
    locationId: varchar("location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    alertOnStatusChange: boolean("alert_on_status_change").notNull().default(true),
    alertOnGuardianNote: boolean("alert_on_guardian_note").notNull().default(true),
    // Per algorithms.md §9.2: at most one alert per (device, location) per 6h.
    // Updated whenever a notification is enqueued for this watch.
    lastAlertAt: timestamp("last_alert_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("watches_uniq").on(t.deviceKey, t.locationId),
  }),
);

// =============================================================================
// push_subscriptions — Web Push (VAPID) endpoints
// =============================================================================

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceKey: text("device_key").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
});

// =============================================================================
// daily_metrics — aggregate counters powering /about's three numbers
// =============================================================================

export const dailyMetrics = pgTable("daily_metrics", {
  date: date("date").primaryKey(),
  reportsSubmitted: integer("reports_submitted").notNull().default(0),
  locationsAdded: integer("locations_added").notNull().default(0),
  notesPosted: integer("notes_posted").notNull().default(0),
  successfulReports: integer("successful_reports").notNull().default(0),
});

// =============================================================================
// corrections — moderation queue for user-submitted location corrections
// =============================================================================

export const corrections = pgTable("corrections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  deviceKey: text("device_key").notNull(),
  text: text("text").notNull(),
  status: text("status", { enum: ["pending", "actioned", "dismissed"] })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByGuardianId: varchar("reviewed_by_guardian_id").references(
    () => guardians.id,
    { onDelete: "set null" },
  ),
});

// =============================================================================
// audit_log — append-only record of admin actions
// =============================================================================

export const AUDIT_ACTIONS = [
  "ISSUE_TOKEN",
  "REVOKE_TOKEN",
  "ARCHIVE_NOTE",
  "ACTION_CORRECTION",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  at: timestamp("at").notNull().defaultNow(),
  actorGuardianId: varchar("actor_guardian_id").references(
    () => guardians.id,
    { onDelete: "set null" },
  ),
  action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
  targetId: varchar("target_id"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

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
    addedByDeviceKey: true,
    // hoursStructured is parsed server-side from `hours` (Phase 6 lands the
    // parser); clients never send it directly.
    hoursStructured: true,
    // thnObjectId is set only by the THN importer, never by user submissions.
    thnObjectId: true,
    // nswNspListing is set only by the NSW NSP importer, never by clients.
    nswNspListing: true,
    // vicNspListing + vicNspSuppliesNaloxone are set only by the Vic NSP
    // importer, never by clients.
    vicNspListing: true,
    vicNspSuppliesNaloxone: true,
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

// Barrier vocabulary matrix per report type. See spec.md §6.4 and contracts.md
// "Reports" section. Barriers not listed for a given type are rejected.
export const BARRIERS_FOR_REPORT_TYPE: Record<ReportType, ReadonlySet<BarrierValue>> = {
  success: new Set<BarrierValue>(), // must be empty
  success_but: new Set<BarrierValue>(BARRIER_VALUES), // any
  out_of_stock: new Set<BarrierValue>([
    "wrong_form_only",
    "staff_unsure",
    "staff_rude",
    "limited_hours",
  ]),
  denied: new Set<BarrierValue>([
    "id_required",
    "medicare_required",
    "prescription_required",
    "staff_unsure",
    "staff_rude",
    "many_questions",
    "age_restriction",
  ]),
};

export const insertReportSchema = createInsertSchema(reports)
  .omit({
    id: true,
    submittedAt: true,
    weight: true,
    // deviceKey comes from the X-Device-Key header server-side; clients never
    // submit it in the body.
    deviceKey: true,
  })
  .extend({
    reportType: z.enum(REPORT_TYPES),
    barriers: z.array(z.enum(BARRIER_VALUES)).max(BARRIER_VALUES.length).default([]),
    notes: z.string().max(500).nullish(),
    costAmount: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === "number" ? v.toFixed(2) : v))
      .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/))
      .nullish(),
    visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .superRefine((report, ctx) => {
    const allowed = BARRIERS_FOR_REPORT_TYPE[report.reportType];

    // success must have no barriers; success_but and denied must have ≥1.
    if (report.reportType === "success" && report.barriers.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["barriers"],
        message: "barriers must be empty when reportType is 'success'",
      });
    }
    if (
      (report.reportType === "success_but" || report.reportType === "denied") &&
      report.barriers.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["barriers"],
        message: `barriers must contain at least one item when reportType is '${report.reportType}'`,
      });
    }

    // Every selected barrier must be valid for this report type.
    for (const b of report.barriers) {
      if (!allowed.has(b)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["barriers"],
          message: `barrier '${b}' is not valid for reportType '${report.reportType}'`,
        });
      }
    }

    // costAmount only on success_but, only if cost_involved is selected.
    if (report.costAmount != null) {
      if (report.reportType !== "success_but") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["costAmount"],
          message: "costAmount is only permitted on success_but reports",
        });
      }
      if (!report.barriers.includes("cost_involved")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["costAmount"],
          message: "costAmount requires 'cost_involved' in barriers",
        });
      }
    }

    // visitDate window: ≤ today_utc + 1 (timezone slack), ≥ today_utc - 90.
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const visit = new Date(report.visitDate + "T00:00:00Z");
    const maxFutureMs = 24 * 60 * 60 * 1000;
    const minPastMs = 90 * 24 * 60 * 60 * 1000;
    if (Number.isNaN(visit.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visitDate"],
        message: "visitDate is not a valid date",
      });
    } else if (visit.getTime() > todayUtc.getTime() + maxFutureMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visitDate"],
        message: "visitDate cannot be more than 1 day in the future",
      });
    } else if (visit.getTime() < todayUtc.getTime() - minPastMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visitDate"],
        message: "visitDate cannot be more than 90 days ago",
      });
    }
  });

// =============================================================================
// Other insert schemas — minimal Phase-2 subset; Phase 4/7 add the rest.
// =============================================================================

export const insertSavedPlaceSchema = createInsertSchema(savedPlaces)
  .omit({ id: true, createdAt: true, deviceKey: true })
  .extend({
    personalLabel: z.string().max(40).nullish(),
    personalNote: z.string().max(500).nullish(),
  });

export const insertWatchSchema = createInsertSchema(watches)
  .omit({ id: true, createdAt: true, deviceKey: true })
  .extend({
    alertOnStatusChange: z.boolean().default(true),
    alertOnGuardianNote: z.boolean().default(true),
  });

export const insertCorrectionSchema = createInsertSchema(corrections)
  .omit({
    id: true,
    createdAt: true,
    deviceKey: true,
    status: true,
    reviewedAt: true,
    reviewedByGuardianId: true,
  })
  .extend({
    text: z.string().min(1).max(500),
  });

// =============================================================================
// TypeScript types
// =============================================================================

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type DeviceReport = typeof deviceReports.$inferSelect;

export type SavedPlace = typeof savedPlaces.$inferSelect;
export type InsertSavedPlace = z.infer<typeof insertSavedPlaceSchema>;

export type Watch = typeof watches.$inferSelect;
export type InsertWatch = z.infer<typeof insertWatchSchema>;

export type Guardian = typeof guardians.$inferSelect;
export type GuardianNote = typeof guardianNotes.$inferSelect;
export type GuardianToken = typeof guardianTokens.$inferSelect;
export type GuardianSession = typeof guardianSessions.$inferSelect;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type DailyMetric = typeof dailyMetrics.$inferSelect;

export type Correction = typeof corrections.$inferSelect;
export type InsertCorrection = z.infer<typeof insertCorrectionSchema>;

export type AuditLogEntry = typeof auditLog.$inferSelect;

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
