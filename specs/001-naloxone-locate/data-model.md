# Data Model

The complete database schema, with reasoning for every column. Implemented in `shared/schema.ts` using Drizzle ORM. All tables use Postgres.

UUID primary keys are `varchar` columns defaulting to `gen_random_uuid()` to keep IDs URL-safe and avoid binary-handling churn.

---

## `locations`

Naloxone access points.

```ts
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),

  type: text("type", { enum: LOCATION_TYPES }).notNull(),
  hours: text("hours"),                            // free-text e.g. "Mon-Fri 9-5"
  hoursStructured: jsonb("hours_structured")        // parsed canonical form, drives "Open now"
    .$type<OpeningHours | null>(),                  // see algorithms.md §7 for OpeningHours shape
  phone: text("phone"),
  website: text("website"),
  accessNotes: text("access_notes"),               // free-text staff/access tips

  naloxoneForms: jsonb("naloxone_forms")
    .$type<Array<"nasal_spray" | "injectable">>()
    .notNull()
    .default(sql`'["nasal_spray"]'::jsonb`),

  tags: jsonb("tags")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  // Allowed tag values: wheelchair_accessible, no_id_required, bulk_available,
  // open_24_7, confidential, peer_support, emergency_available

  verificationLevel: text("verification_level", {
    enum: ["unverified", "community_verified", "official"]
  }).notNull().default("unverified"),

  partnerOrgId: varchar("partner_org_id"),         // optional FK to partners table (future)

  addedByDeviceKey: text("added_by_device_key"),   // who added it (anonymous)
  addedAt: timestamp("added_at").notNull().defaultNow(),

  // denormalised hot fields for map performance — kept in sync via reports trigger
  totalReportsCount: integer("total_reports_count").notNull().default(0),
  reliabilityScore: decimal("reliability_score", { precision: 3, scale: 2 })
    .notNull().default("0.00"),
  lastReportAt: timestamp("last_report_at"),

  archivedAt: timestamp("archived_at"),            // soft delete; closed locations stay queryable
});

export const LOCATION_TYPES = [
  "nsp", "pharmacy", "hospital", "community_health", "aod_organisation",
  "library", "public_building", "festival_site", "drop_in_centre", "other",
] as const;
```

### Indexes

- `(latitude, longitude)` — for bounding-box queries
- `(type)` — for filter queries
- `(archivedAt) WHERE archivedAt IS NULL` — partial index on active locations

### Reasoning

- **`latitude` / `longitude` as `decimal`** rather than PostGIS `point`: keeps schema simple, no PostGIS dependency, fine for our scale (sub-thousand locations).
- **`hoursStructured` as jsonb** alongside free-text `hours`: free text remains for display, structured form drives the "Open now" filter and badge. Parsing happens at write time (admin import or add-a-place flow); see `algorithms.md` §7 for shape and parser. Null when hours are unknown — UI shows "Hours unknown" rather than misleading the user.
- **`naloxoneForms` as jsonb array** rather than two booleans: extensible if a third form appears (e.g., a future intramuscular auto-injector).
- **`tags` as jsonb array** with a controlled vocabulary documented in code: extensibility without new columns.
- **`verificationLevel` as enum** rather than boolean: three meaningful states.
- **`partnerOrgId`** is reserved for a future `partners` table — adding it now to avoid migration churn. Nullable.
- **`addedByDeviceKey`** is the device key of the user who added the place. Used only for moderation; never displayed.
- **Denormalised `totalReportsCount`, `reliabilityScore`, `lastReportAt`** — recomputed on every report insert via a dedicated function, keeps `GET /api/locations` fast (no per-row aggregate query).
- **Soft delete via `archivedAt`** — closed pharmacies still need to appear in old reports; never hard-delete.

## `reports`

A report is a claim about a specific past visit at a specific time.

```ts
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  deviceKey: text("device_key").notNull(),

  reportType: text("report_type", {
    enum: ["success", "success_but", "out_of_stock", "denied"]
  }).notNull(),

  visitDate: date("visit_date").notNull(),         // date the user actually visited
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),

  barriers: jsonb("barriers")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  // Allowed values: id_required, medicare_required, prescription_required,
  // cost_involved, wrong_form_only, long_wait, staff_unsure, staff_rude,
  // many_questions, age_restriction, limited_hours

  costAmount: decimal("cost_amount", { precision: 6, scale: 2 }), // optional, only if cost_involved

  notes: text("notes"),                             // optional, ≤ 500 chars

  // Computed weight, refreshed periodically
  weight: decimal("weight", { precision: 4, scale: 3 }).notNull().default("1.000"),
});
```

### Indexes

- `(locationId, submittedAt DESC)` — for the recent-reports query on detail sheets
- `(locationId, visitDate DESC)` — for time-window aggregates
- `(deviceKey, locationId, submittedAt)` — for rate-limit checks (also see `device_reports`)

### Reasoning

- **Two timestamps** (`visitDate`, `submittedAt`): a user can submit a report two days after their visit. The visit date is what matters for surfacing; the submitted-at is what matters for rate limiting and audit.
- **`barriers` as jsonb array**: structured but flexible; the constitution forbids adding new barrier types without amendment.
- **`costAmount`** is denormalised from `barriers`: extracting "they charged X" is the only barrier with a numeric payload, and storing it in its own column makes aggregate queries (median cost charged where cost was reported) trivial.
- **`weight`** is computed by the decay function (`algorithms.md` §1.2) and updated by a periodic job. Storing it lets the read path stay simple.
- **`onDelete: "cascade"`** on `locationId`: if a location is *hard*-deleted (only via admin migration, never via the app), reports go too. Soft-delete is the standard path.

## `device_reports`

Rate-limit ledger. One row per `(deviceKey, locationId)` pair, updated on every report.

```ts
export const deviceReports = pgTable("device_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceKey: text("device_key").notNull(),
  locationId: varchar("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  lastReportAt: timestamp("last_report_at").notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("device_reports_uniq").on(t.deviceKey, t.locationId),
}));
```

### Reasoning

- Could be derived from `reports` table, but a denormalised version with a unique index makes the rate-limit check a single `O(1)` lookup.
- Updated via UPSERT in the same transaction as `reports.insert`.

## `guardian_notes`

Signed human context attached to locations.

```ts
export const guardianNotes = pgTable("guardian_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  guardianId: varchar("guardian_id").references(() => guardians.id, { onDelete: "cascade" }).notNull(),
  noteText: text("note_text").notNull(),           // ≤ 500 chars
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
});
```

### Indexes

- `(locationId, archivedAt) WHERE archivedAt IS NULL` — for the public detail-sheet query

### Reasoning

- Denormalised guardian first name and organisation are *not* stored here — joined from `guardians` on read, ensuring updates to a guardian's display name propagate.
- Soft-deleted notes preserved for audit.

## `guardians`

The only table containing identifying data — for vetted community partners.

```ts
export const guardians = pgTable("guardians", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),         // displayed to users
  lastName: text("last_name").notNull(),           // not displayed; for admin records
  email: text("email").notNull().unique(),         // for token issuance / contact
  organisation: text("organisation").notNull(),    // displayed to users
  affiliatedLocationIds: jsonb("affiliated_location_ids")
    .$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Reasoning

- **PII intentional and minimal**: first name + last name + email + organisation. No phone, no address. The trade-off for trust is small and explicit.
- **`affiliatedLocationIds`** scopes which locations a guardian can post notes against. Super-admins (isAdmin=true) can post against any location.
- **`isActive`** allows revocation without deletion.

## `guardian_tokens`

Bcrypt-hashed login tokens.

```ts
export const guardianTokens = pgTable("guardian_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guardianId: varchar("guardian_id").references(() => guardians.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull(),         // bcrypt hash
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),              // null = never
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
});
```

### Indexes

- `(guardianId) WHERE revokedAt IS NULL`

### Reasoning

- Tokens are passwords. Bcrypt cost factor 12.
- Tokens are shown *once* at issuance and never again. The plain token never lands in any log or DB column.
- `expiresAt` allows time-bounded tokens (e.g., for a festival-only guardian).

## `guardian_sessions`

Server-side session storage for guardian admin auth.

```ts
export const guardianSessions = pgTable("guardian_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guardianId: varchar("guardian_id").references(() => guardians.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

The session ID is sent in an HttpOnly Secure cookie. No session data is in the cookie itself.

## `saved_places`

User's saved locations (the "Planning Kit" / "My Places" Saved tab).

```ts
export const savedPlaces = pgTable("saved_places", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceKey: text("device_key").notNull(),
  locationId: varchar("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  personalLabel: text("personal_label"),           // e.g. "home", "work", optional
  personalNote: text("personal_note"),             // optional
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("saved_places_uniq").on(t.deviceKey, t.locationId),
}));
```

## `watches`

Per-device, per-location watch flag with notification preferences.

```ts
export const watches = pgTable("watches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceKey: text("device_key").notNull(),
  locationId: varchar("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  alertOnStatusChange: boolean("alert_on_status_change").notNull().default(true),
  alertOnGuardianNote: boolean("alert_on_guardian_note").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("watches_uniq").on(t.deviceKey, t.locationId),
}));
```

## `push_subscriptions`

Web Push subscription endpoints.

```ts
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
```

A device may have multiple subscriptions (browsers, devices); send to all.

## `corrections`

Free-text correction suggestions submitted by users about a location. Moderation
queue — not user-visible until reviewed by an admin.

```ts
export const corrections = pgTable("corrections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  deviceKey: text("device_key").notNull(),
  text: text("text").notNull(),                    // ≤ 500 chars
  status: text("status", {
    enum: ["pending", "actioned", "dismissed"]
  }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByGuardianId: varchar("reviewed_by_guardian_id")
    .references(() => guardians.id, { onDelete: "set null" }),
});
```

### Indexes

- `(status, createdAt) WHERE status = 'pending'` — moderation queue read

### Reasoning

- Backs `POST /api/locations/:id/correction`. Stores the suggestion in a queue;
  super-admins triage from the guardian dashboard (post-MVP UI; the table
  exists from the start so the endpoint is honest, not a black hole).
- `deviceKey` retained on the row only for spam-pattern detection during
  triage; never displayed.

## `audit_log`

Append-only record of admin actions. Read by
`GET /api/guardian/admin/audit-log`.

```ts
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  at: timestamp("at").notNull().defaultNow(),
  actorGuardianId: varchar("actor_guardian_id")
    .references(() => guardians.id, { onDelete: "set null" }),
  action: text("action", {
    enum: ["ISSUE_TOKEN", "REVOKE_TOKEN", "ARCHIVE_NOTE", "ACTION_CORRECTION"]
  }).notNull(),
  targetId: varchar("target_id"),                  // id of the affected resource
  metadata: jsonb("metadata").$type<Record<string, unknown>>()
    .notNull().default(sql`'{}'::jsonb`),
});
```

### Indexes

- `(at DESC)` — for the recent-actions feed

### Reasoning

- Append-only; never UPDATE or DELETE rows here. Action enum is closed; new
  audit-worthy actions require an amendment.
- `actorGuardianId` set null on guardian deletion preserves the audit trail.

## `daily_metrics`

Aggregate counters powering the `/about` numbers. Updated by a daily job.

```ts
export const dailyMetrics = pgTable("daily_metrics", {
  date: date("date").primaryKey(),
  reportsSubmitted: integer("reports_submitted").notNull().default(0),
  locationsAdded: integer("locations_added").notNull().default(0),
  notesPosted: integer("notes_posted").notNull().default(0),
  successfulReports: integer("successful_reports").notNull().default(0),  // success + success_but
});
```

The `/about` "X% successful in last 30 days" calculation queries this table, sums the windows, divides — no per-report aggregation on read.

## Zod insert schemas

Generated from each table via `drizzle-zod`'s `createInsertSchema`, with appropriate `.omit()` calls:

```ts
export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  addedAt: true,
  totalReportsCount: true,
  reliabilityScore: true,
  lastReportAt: true,
  archivedAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  submittedAt: true,
  weight: true,
}).extend({
  // tighten validation beyond the DB column
  notes: z.string().max(500).optional(),
  barriers: z.array(z.enum(BARRIER_VALUES)).max(10),
  costAmount: z.number().min(0).max(1000).optional(),
});

// ... etc for every other insert path
```

The `extend` calls add validation beyond what the DB column constrains — length limits, allowed-value enums, cross-field rules.

## TypeScript types

Each table exports `$inferSelect` and an `Insert*` type derived from the Zod schema:

```ts
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
// ... etc
```

Plus the consensus shape:

```ts
export interface LocationWithConsensus extends Location {
  pinStatus: "green" | "amber" | "red" | "grey";
  pinSize: number;                    // 16-48 px
  consensusLabel: string;             // human-readable
  reliabilityStars: number;           // 1-5 rounded
  recentReports: Report[];            // last 10 by submittedAt
  guardianNotes: GuardianNoteWithGuardian[];
  barrierFacts: BarrierFact[];        // headline facts derived per algorithms.md §3
  distance?: number;                  // km, only if user lat/lon supplied
}

export interface BarrierFact {
  kind: "rare" | "occasional" | "frequent";    // tone
  barrier: string;                    // one of the barrier vocabulary
  label: string;                      // e.g. "ID rarely asked here"
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
```

## Relationships diagram

```
locations ──< reports
        ├─< device_reports
        ├─< guardian_notes >── guardians
        ├─< corrections >── guardians (reviewer, nullable)
        ├─< saved_places
        └─< watches

guardians ──< guardian_tokens
         ├─< guardian_sessions
         └─< audit_log (actor, nullable)

(device_key text fields connect:
  reports, device_reports, saved_places, watches, push_subscriptions
  — not a foreign key, no devices table; the key is the identity)
```

## Migration policy

- **Schema changes go through `npm run db:push`** in development against a Neon branch
- **In production**, schema changes are applied via Drizzle Kit migrations (`drizzle-kit generate`), reviewed in PR, and applied via a deploy step
- **Never destructive in a single deploy**: column drops, column renames, and FK changes are split across two deploys (add new → migrate data → next deploy drops old)
