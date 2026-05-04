# API Contracts

Every endpoint exposed by the server. Request and response shapes. Errors. Auth requirements.

All endpoints are JSON. The base path is `/api`. The HTTP server is described in `plan.md`.

---

## Conventions

### Headers

| Header | Where | Purpose |
|---|---|---|
| `X-Device-Key` | Sent on every public-app request | Pseudonymous identity, opaque to server |
| `Cookie: nl_guardian_session=…` | Sent on `/api/guardian/*` after login | Guardian session |

### Errors

Errors return the appropriate HTTP status with a JSON body:

```json
{ "error": "human_readable_message", "code": "MACHINE_READABLE_CODE" }
```

Validation errors (400) include a `fields` map:

```json
{
  "error": "Invalid report data",
  "code": "VALIDATION_FAILED",
  "fields": { "barriers": "must contain at least one barrier" }
}
```

### Status codes

- `200` OK — success with body
- `201` Created — resource created
- `204` No Content — success with no body (DELETE)
- `400` Bad Request — validation failure
- `401` Unauthorized — guardian session missing/invalid
- `403` Forbidden — guardian session valid but lacking scope (e.g., trying to post a note on a non-affiliated location)
- `404` Not Found
- `409` Conflict — duplicate (e.g., already saved this place)
- `429` Too Many Requests — rate-limited
- `500` Server Error

---

## Health

### `GET /api/health`

For uptime checks. No auth.

**Response 200:**
```json
{ "status": "ok", "time": "2026-05-04T12:34:56.789Z" }
```

---

## Locations

### `GET /api/locations`

List all active locations with consensus data. Supports geo and bounds filtering.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `lat`, `lon` | number | User's location for distance calculation |
| `bbox` | `swLat,swLon,neLat,neLon` | Map viewport bounding box |
| `type` | string (repeated) | Filter by location type |
| `verification` | string (repeated) | Filter by verification level |
| `recent` | `true`/`false` | Only locations with reports in last 7 days |
| `openNow` | `true`/`false` | Only locations open at request time (uses `hours`) |

**Headers:** `X-Device-Key` (used to mark `isSaved`/`isWatched` flags per location)

**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "Chemist Warehouse Pitt Street",
    "address": "199 Pitt Street, Sydney NSW 2000",
    "latitude": "-33.8688",
    "longitude": "151.2093",
    "type": "pharmacy",
    "hours": "Mon-Sun 8:00-21:00",
    "phone": "02 9234 5678",
    "website": "https://...",
    "naloxoneForms": ["nasal_spray"],
    "tags": ["wheelchair_accessible"],
    "verificationLevel": "community_verified",
    "totalReportsCount": 87,
    "reliabilityScore": "4.10",
    "lastReportAt": "2026-05-04T11:42:00.000Z",
    "pinStatus": "green",
    "pinSize": 38,
    "consensusLabel": "Got it easily — 2 reports today",
    "reliabilityStars": 4,
    "distance": 1.23,
    "isSaved": false,
    "isWatched": false
  }
]
```

The full `LocationWithConsensus` shape is defined in `shared/schema.ts`. The list endpoint omits `recentReports`, `guardianNotes`, and `barrierFacts` for payload size — those are fetched per-location via the detail endpoint.

### `GET /api/locations/:id`

Single location, fully hydrated.

**Query params:** `lat`, `lon` (for distance)

**Headers:** `X-Device-Key`

**Response 200:** `LocationWithConsensus` including `recentReports` (last 10), `guardianNotes`, `barrierFacts`.

**Response 404:** Location archived or not found.

### `GET /api/locations/search`

Search by name and address.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `q` | string, required | Search query (server-side ILIKE on name + address, ranked) |
| `lat`, `lon` | number | For distance ranking and display |
| `limit` | number | Default 20, max 50 |

**Response 200:** Array of `LocationWithConsensus`, max `limit`.

### `POST /api/locations`

Create a new location. Called as part of the report flow when a user adds a place.

**Headers:** `X-Device-Key`

**Body:**
```json
{
  "name": "string, required",
  "address": "string, required",
  "latitude": "string, required (decimal as string per Drizzle convention)",
  "longitude": "string, required",
  "type": "one of LOCATION_TYPES, required",
  "hours": "string, optional",
  "phone": "string, optional",
  "website": "string, optional",
  "accessNotes": "string, optional",
  "naloxoneForms": ["nasal_spray"],
  "tags": []
}
```

**Response 201:** The newly created `Location`.

**Response 400:** Validation failure.

**Rate limit:** 5 new locations per device per 24h (in addition to general API rate limit).

### `POST /api/locations/:id/correction`

Suggest a correction (free-text). Stub for MVP — stores in a moderation queue table for later review. Not user-visible until reviewed.

**Headers:** `X-Device-Key`

**Body:**
```json
{ "text": "string, max 500 chars" }
```

**Response 202 Accepted.**

---

## Reports

### `POST /api/reports`

Submit a report.

**Headers:** `X-Device-Key`

**Body:**
```json
{
  "locationId": "uuid",
  "reportType": "success | success_but | out_of_stock | denied",
  "visitDate": "2026-05-04",
  "barriers": ["id_required", "medicare_required"],
  "costAmount": 40.00,
  "notes": "Optional free text"
}
```

Validation rules (enforced server-side via Zod):

- `barriers` must be empty for `success`
- `barriers` must contain ≥1 item for `success_but` and `denied`
- `barriers` must be empty or contain only `wrong_form_only` for `out_of_stock`
- `notes` ≤ 500 chars
- `costAmount` ≤ 1000 and only valid if `cost_involved` in `barriers`
- `visitDate` must be ≤ today and ≥ 90 days ago

**Response 201:**
```json
{
  "id": "uuid",
  "locationId": "uuid",
  "reportType": "success_but",
  "visitDate": "2026-05-04",
  "submittedAt": "2026-05-04T12:34:56.789Z",
  "barriers": ["id_required"],
  "costAmount": null,
  "notes": null,
  "weight": "1.000",
  "ackMessage": "Thanks. 47 people have used reports like yours to plan their visit this month."
}
```

**Response 429 Too Many Requests:**
```json
{
  "error": "You already reported this place today. Try again tomorrow.",
  "code": "RATE_LIMITED",
  "nextReportAllowedAt": "2026-05-05T12:34:56.789Z"
}
```

**Side effects:**

1. Insert into `reports`
2. UPSERT `device_reports`
3. Recompute and update denormalised `totalReportsCount`, `reliabilityScore`, `lastReportAt` on the location
4. If the location's `pinStatus` flipped, enqueue push notifications to watchers
5. Increment `daily_metrics`

### `POST /api/reports/check`

Pre-check whether the device can report. Used by the report sheet to disable the submit button proactively.

**Headers:** `X-Device-Key`

**Body:**
```json
{ "locationId": "uuid" }
```

**Response 200:**
```json
{ "canReport": true, "nextReportAllowedAt": null }
```

or

```json
{ "canReport": false, "nextReportAllowedAt": "2026-05-05T12:34:56.789Z" }
```

### `GET /api/locations/:id/reports`

Reports for a location. Supports time-window queries.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `limit` | number | Default 20, max 100 |
| `windowDays` | number | Default 30 — only reports from last N days |

**Response 200:** Array of `Report`. Sorted by `submittedAt` DESC.

---

## Saved places

### `GET /api/saved-places`

User's saved places.

**Headers:** `X-Device-Key`

**Response 200:** Array of `SavedPlace` joined with `Location` summary.

### `POST /api/saved-places`

Save a location.

**Headers:** `X-Device-Key`

**Body:**
```json
{
  "locationId": "uuid",
  "personalLabel": "home",
  "personalNote": "near tram stop"
}
```

**Response 201:** The created `SavedPlace`.

**Response 409:** Already saved.

### `PATCH /api/saved-places/:id`

Update label or note.

**Body:**
```json
{ "personalLabel": "work", "personalNote": "..." }
```

**Response 200:** Updated `SavedPlace`.

### `DELETE /api/saved-places/:id`

**Response 204.**

---

## Watches

### `GET /api/watches`

User's active watches.

**Headers:** `X-Device-Key`

**Response 200:** Array of `Watch` joined with `Location` summary.

### `POST /api/watches`

Add a watch.

**Headers:** `X-Device-Key`

**Body:**
```json
{
  "locationId": "uuid",
  "alertOnStatusChange": true,
  "alertOnGuardianNote": true
}
```

**Response 201:** The created `Watch`.

**Response 409:** Already watching.

### `PATCH /api/watches/:id`

Update notification preferences.

**Response 200:** Updated `Watch`.

### `DELETE /api/watches/:id`

**Response 204.**

---

## Guardian notes (public)

### `GET /api/locations/:id/guardian-notes`

Public-readable notes for a location.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "noteText": "Ask at the back counter, not the front register. Open till 9 PM.",
    "updatedAt": "2026-05-01T00:00:00.000Z",
    "guardianFirstName": "Sarah",
    "guardianOrganisation": "Uniting NSP Kings Cross"
  }
]
```

Excludes archived notes. Sorted by `updatedAt` DESC.

---

## Push notifications

### `GET /api/push/vapid-public-key`

Returns the server's VAPID public key. Cached aggressively client-side.

**Response 200:**
```json
{ "publicKey": "BL...base64url..." }
```

### `POST /api/push/subscribe`

Register a push subscription.

**Headers:** `X-Device-Key`

**Body:** A standard PushSubscription JSON:
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BC...",
    "auth": "..."
  }
}
```

**Response 201.** Endpoint is unique-keyed; duplicate subscribes are no-ops returning 200.

### `DELETE /api/push/subscribe`

Unsubscribe by endpoint.

**Headers:** `X-Device-Key`

**Body:**
```json
{ "endpoint": "https://..." }
```

**Response 204.**

---

## Forget device

### `POST /api/device/forget`

Clears all server-side data associated with a device key.

**Headers:** `X-Device-Key`

**Response 204.**

**Effects:**

- Delete rows in `saved_places` for this device key
- Delete rows in `watches` for this device key
- Delete rows in `push_subscriptions` for this device key
- Delete rows in `device_reports` for this device key

**What is preserved:** rows in `reports` — they are anonymised data points contributing to public consensus, and the device key on them is treated as opaque random text. The constitution requires deletability of identity, not deletion of contributed evidence. The user is told this in the `/me` confirmation copy.

---

## /about metrics

### `GET /api/metrics/summary`

Powers the three counters on `/about`.

**Response 200:**
```json
{
  "totalLocations": 247,
  "reportsLast30Days": 1582,
  "successRateLast30Days": 73,
  "lastUpdated": "2026-05-04T00:00:00.000Z"
}
```

Computed from `daily_metrics`. Cached server-side for 5 minutes.

---

## Guardian admin

All routes here require a valid guardian session cookie. Routes marked **(super-admin)** also require the session's guardian to have `isAdmin = true`.

### `POST /api/guardian/login`

**Body:**
```json
{ "token": "32-byte-base64url-token" }
```

**Response 200 + Set-Cookie:**
```json
{
  "guardian": {
    "id": "uuid",
    "firstName": "Sarah",
    "organisation": "Uniting NSP Kings Cross",
    "affiliatedLocationIds": ["uuid", "uuid"],
    "isAdmin": false
  }
}
```

Sets `nl_guardian_session=<sid>; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`.

**Response 401:** Token invalid, expired, or revoked.

### `POST /api/guardian/logout`

**Response 204.** Clears the session cookie.

### `GET /api/guardian/me`

**Response 200:** Same shape as login response's `guardian` object.

### `POST /api/guardian/notes`

Post a note.

**Body:**
```json
{
  "locationId": "uuid",
  "noteText": "Ask at the back counter, not the front register."
}
```

**Response 201:** The created `GuardianNote`.

**Response 403:** Location is not in the guardian's `affiliatedLocationIds` (and the guardian is not an admin).

### `PATCH /api/guardian/notes/:id`

Edit own note.

**Body:**
```json
{ "noteText": "Updated text" }
```

**Response 200:** Updated note. **Response 403** if the note's `guardianId` ≠ session's guardian.

### `DELETE /api/guardian/notes/:id`

Soft-delete (sets `archivedAt`).

**Response 204.** **403** if not own note.

### `GET /api/guardian/notes/mine`

List the guardian's own notes (active + archived).

**Response 200:** Array of `GuardianNote`.

### `POST /api/guardian/admin/issue-token` (super-admin)

Issue a new guardian token.

**Body:**
```json
{
  "firstName": "Sarah",
  "lastName": "Khouri",
  "email": "sarah@uniting.org",
  "organisation": "Uniting NSP Kings Cross",
  "affiliatedLocationIds": ["uuid", "uuid"],
  "isAdmin": false,
  "expiresAt": "2026-12-31T00:00:00.000Z"
}
```

**Response 201:**
```json
{
  "guardianId": "uuid",
  "token": "32-byte-base64url-token-shown-once",
  "loginUrl": "https://<host>/guardian?t=<one-time-link>"
}
```

The plaintext token is in the response **once**. After this, only the bcrypt hash exists.

### `POST /api/guardian/admin/revoke-token/:tokenId` (super-admin)

**Response 204.** Sets `revokedAt`.

### `GET /api/guardian/admin/audit-log` (super-admin)

**Response 200:** Last 100 admin actions. Format:
```json
[
  {
    "at": "2026-05-04T12:34:56.789Z",
    "actorGuardianId": "uuid",
    "action": "ISSUE_TOKEN | REVOKE_TOKEN | ARCHIVE_NOTE",
    "targetId": "uuid",
    "metadata": {}
  }
]
```

---

## Rate limits

Applied as middleware before route handlers:

- **Per-IP**: 100 requests / 15 minutes (general)
- **Per-device, reports**: 1 per (device, location) per 24h (see `device_reports`)
- **Per-device, location creation**: 5 per device per 24h
- **Per-device, push subscribe**: 10 per device per hour (prevents storage abuse)

When rate-limited, return 429 with a `Retry-After` header set to seconds until reset.
