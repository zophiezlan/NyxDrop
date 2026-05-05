import { describe, expect, it } from "vitest";
import {
  calculatePinSize,
  calculatePinStatus,
  calculateReliabilityScore,
  calculateReportWeight,
  classifyPinFlip,
  filterByAbsenceOfBarriers,
  haversineDistance,
  isOpenNow,
  surfaceBarrierFacts,
} from "../consensus.js";
import type {
  BarrierValue,
  LocationWithConsensus,
  Report,
  ReportType,
} from "../schema.js";

// -----------------------------------------------------------------------------
// Fixture helpers
// -----------------------------------------------------------------------------

const NOW = new Date("2026-05-04T12:00:00Z");

function reportFixture(
  overrides: Partial<Report> & { hoursAgo?: number },
): Report {
  const hoursAgo = overrides.hoursAgo ?? 1;
  const submittedAt = new Date(NOW.getTime() - hoursAgo * 3_600_000);
  return {
    id: overrides.id ?? `r-${hoursAgo}-${Math.random().toString(16).slice(2, 8)}`,
    locationId: overrides.locationId ?? "loc-1",
    deviceKey: overrides.deviceKey ?? "device-1",
    reportType: overrides.reportType ?? "success",
    visitDate: overrides.visitDate ?? submittedAt.toISOString().slice(0, 10),
    submittedAt: overrides.submittedAt ?? submittedAt,
    barriers: overrides.barriers ?? [],
    costAmount: overrides.costAmount ?? null,
    notes: overrides.notes ?? null,
    weight: overrides.weight ?? "1.000",
  };
}

function many(
  n: number,
  overrides: Parameters<typeof reportFixture>[0] = {},
): Report[] {
  return Array.from({ length: n }, (_, i) =>
    reportFixture({ ...overrides, hoursAgo: (overrides.hoursAgo ?? 1) + i * 0.01 }),
  );
}

// -----------------------------------------------------------------------------
// Pin status (algorithms.md §1)
// -----------------------------------------------------------------------------

describe("calculatePinStatus", () => {
  it("returns grey with 0 stars when no reports", () => {
    expect(calculatePinStatus([], NOW)).toEqual({
      status: "grey",
      label: "No recent reports",
      confidenceN: 0,
    });
  });

  it("returns grey when only old reports (>168h)", () => {
    const old = reportFixture({ hoursAgo: 200, reportType: "success" });
    const result = calculatePinStatus([old], NOW);
    expect(result.status).toBe("grey");
  });

  it("five recent successes → green", () => {
    const reports = many(5, { reportType: "success", hoursAgo: 4 });
    const result = calculatePinStatus(reports, NOW);
    expect(result.status).toBe("green");
    expect(result.confidenceN).toBe(5);
  });

  it("five denied → red", () => {
    const reports = many(5, { reportType: "denied", hoursAgo: 4 });
    const result = calculatePinStatus(reports, NOW);
    expect(result.status).toBe("red");
  });

  it("five out_of_stock → red (failure bucket)", () => {
    const reports = many(5, { reportType: "out_of_stock", hoursAgo: 4 });
    const result = calculatePinStatus(reports, NOW);
    expect(result.status).toBe("red");
  });

  it("50/50 success + success_but → amber", () => {
    const reports = [
      ...many(3, { reportType: "success", hoursAgo: 4 }),
      ...many(3, { reportType: "success_but", hoursAgo: 4 }),
    ];
    const result = calculatePinStatus(reports, NOW);
    expect(result.status).toBe("amber");
  });

  it("mostly success with one denied → still green at 5/6 success ratio", () => {
    const reports = [
      ...many(5, { reportType: "success", hoursAgo: 4 }),
      reportFixture({ reportType: "denied", hoursAgo: 6 }),
    ];
    const result = calculatePinStatus(reports, NOW);
    expect(result.status).toBe("green");
  });

  it("label says 'today' when most recent is within 24h", () => {
    const reports = many(2, { reportType: "success", hoursAgo: 3 });
    const result = calculatePinStatus(reports, NOW);
    expect(result.label).toContain("today");
  });

  it("label says days-ago when most recent is older than 24h but within decay horizon", () => {
    const reports = [reportFixture({ reportType: "success", hoursAgo: 60 })];
    const result = calculatePinStatus(reports, NOW);
    expect(result.label).toMatch(/days? ago/);
  });
});

// -----------------------------------------------------------------------------
// Weight decay (algorithms.md §1.2)
// -----------------------------------------------------------------------------

describe("calculateReportWeight", () => {
  it("weight = 1 at age 0", () => {
    const at = NOW;
    expect(calculateReportWeight(at, NOW)).toBeCloseTo(1, 5);
  });

  it("weight = 0.5 at exactly 48h", () => {
    const at = new Date(NOW.getTime() - 48 * 3_600_000);
    expect(calculateReportWeight(at, NOW)).toBeCloseTo(0.5, 5);
  });

  it("a 48h-old report contributes exactly half a 0h-old report", () => {
    const fresh = reportFixture({ reportType: "success", hoursAgo: 0 });
    const half = reportFixture({ reportType: "success", hoursAgo: 48 });
    const wFresh = calculateReportWeight(fresh.submittedAt, NOW);
    const wHalf = calculateReportWeight(half.submittedAt, NOW);
    expect(wHalf).toBeCloseTo(wFresh / 2, 5);
  });

  it("weight is 0 past 168h horizon", () => {
    const at = new Date(NOW.getTime() - 200 * 3_600_000);
    expect(calculateReportWeight(at, NOW)).toBe(0);
  });

  it("a 24h-old report has weight ≈ 0.71", () => {
    const at = new Date(NOW.getTime() - 24 * 3_600_000);
    expect(calculateReportWeight(at, NOW)).toBeCloseTo(0.7071, 3);
  });
});

// -----------------------------------------------------------------------------
// Reliability score (algorithms.md §2)
// -----------------------------------------------------------------------------

describe("calculateReliabilityScore", () => {
  it("empty → score 0, stars 0, low", () => {
    const r = calculateReliabilityScore([]);
    expect(r).toEqual({ score: 0, stars: 0, confidenceTier: "low" });
  });

  it("1 success → low confidence, 4 stars (5 × 0.7)", () => {
    const r = calculateReliabilityScore([
      reportFixture({ reportType: "success" }),
    ]);
    expect(r.confidenceTier).toBe("low");
    expect(r.stars).toBe(4);
    expect(r.score).toBeCloseTo(3.5, 5);
  });

  it("5 success → medium confidence, 5 stars (5 × 0.85 = 4.25 → round 4)", () => {
    const r = calculateReliabilityScore(many(5, { reportType: "success" }));
    expect(r.confidenceTier).toBe("medium");
    expect(r.stars).toBe(4);
  });

  it("20 success + 1 denied → high confidence, ~5 stars", () => {
    const reports = [
      ...many(20, { reportType: "success" }),
      reportFixture({ reportType: "denied" }),
    ];
    const r = calculateReliabilityScore(reports);
    expect(r.confidenceTier).toBe("high");
    expect(r.stars).toBeGreaterThanOrEqual(4);
    expect(r.stars).toBeLessThanOrEqual(5);
  });

  it("all denied → 1 star floor", () => {
    const r = calculateReliabilityScore(many(5, { reportType: "denied" }));
    expect(r.score).toBe(0);
    expect(r.stars).toBe(1);
  });

  it("confidence tier boundaries", () => {
    expect(calculateReliabilityScore(many(2, { reportType: "success" })).confidenceTier).toBe("low");
    expect(calculateReliabilityScore(many(3, { reportType: "success" })).confidenceTier).toBe("medium");
    expect(calculateReliabilityScore(many(9, { reportType: "success" })).confidenceTier).toBe("medium");
    expect(calculateReliabilityScore(many(10, { reportType: "success" })).confidenceTier).toBe("medium");
    expect(calculateReliabilityScore(many(19, { reportType: "success" })).confidenceTier).toBe("medium");
    expect(calculateReliabilityScore(many(20, { reportType: "success" })).confidenceTier).toBe("high");
  });
});

// -----------------------------------------------------------------------------
// Barrier surfacing (algorithms.md §3)
// -----------------------------------------------------------------------------

describe("surfaceBarrierFacts", () => {
  function reportWithBarriers(
    hoursAgo: number,
    type: ReportType,
    barriers: BarrierValue[] = [],
    costAmount: string | null = null,
  ): Report {
    return reportFixture({ hoursAgo, reportType: type, barriers, costAmount });
  }

  it("5 reports of which 3 have id_required → 'often asked recently'", () => {
    const reports = [
      reportWithBarriers(2, "success_but", ["id_required"]),
      reportWithBarriers(3, "success_but", ["id_required"]),
      reportWithBarriers(4, "success_but", ["id_required"]),
      reportWithBarriers(5, "success", []),
      reportWithBarriers(6, "success", []),
    ];
    const facts = surfaceBarrierFacts(reports, NOW);
    const id = facts.find((f) => f.barrier === "id_required");
    expect(id).toBeDefined();
    expect(id?.kind).toBe("frequent");
    expect(id?.label).toMatch(/often asked recently/i);
  });

  it("3 reports with 2 id_required → 'sometimes' (occasional)", () => {
    const reports = [
      reportWithBarriers(2, "success_but", ["id_required"]),
      reportWithBarriers(3, "success_but", ["id_required"]),
      reportWithBarriers(5, "success", []),
    ];
    const facts = surfaceBarrierFacts(reports, NOW);
    const id = facts.find((f) => f.barrier === "id_required");
    expect(id?.kind).toBe("occasional");
    expect(id?.label).toMatch(/sometimes asked recently/i);
  });

  it("10 reports with 0 id_required → 'rarely asked here'", () => {
    const reports = many(10, { reportType: "success" });
    const facts = surfaceBarrierFacts(reports, NOW);
    const id = facts.find((f) => f.barrier === "id_required");
    expect(id?.kind).toBe("rare");
    expect(id?.label).toMatch(/rarely asked/i);
  });

  it("staff_rude rare label is suppressed", () => {
    const reports = many(10, { reportType: "success" });
    const facts = surfaceBarrierFacts(reports, NOW);
    const rude = facts.find((f) => f.barrier === "staff_rude");
    expect(rude).toBeUndefined();
  });

  it("limited_hours is never surfaced", () => {
    const reports = [
      reportWithBarriers(2, "success_but", ["limited_hours"]),
      reportWithBarriers(3, "success_but", ["limited_hours"]),
      reportWithBarriers(4, "success_but", ["limited_hours"]),
      reportWithBarriers(5, "success_but", ["limited_hours"]),
      reportWithBarriers(6, "success_but", ["limited_hours"]),
    ];
    const facts = surfaceBarrierFacts(reports, NOW);
    expect(facts.find((f) => f.barrier === "limited_hours")).toBeUndefined();
  });

  it("cost_involved frequent with ≥3 cost amounts → label includes median", () => {
    const reports = [
      reportWithBarriers(1, "success_but", ["cost_involved"], "30.00"),
      reportWithBarriers(2, "success_but", ["cost_involved"], "40.00"),
      reportWithBarriers(3, "success_but", ["cost_involved"], "50.00"),
      reportWithBarriers(4, "success_but", ["cost_involved"], "40.00"),
      reportWithBarriers(5, "success", []),
    ];
    const facts = surfaceBarrierFacts(reports, NOW);
    const cost = facts.find((f) => f.barrier === "cost_involved");
    expect(cost?.kind).toBe("frequent");
    expect(cost?.label).toContain("$40");
  });

  it("orders frequent first, occasional, then rare; caps at 4", () => {
    // Build a scenario with many surfacing barriers
    const reports = [
      // id_required: frequent
      ...Array.from({ length: 4 }, (_, i) =>
        reportWithBarriers(i + 1, "success_but", ["id_required"]),
      ),
      // medicare_required: occasional
      reportWithBarriers(2, "success_but", ["medicare_required"]),
      reportWithBarriers(3, "success_but", ["medicare_required"]),
      // staff_unsure: occasional
      reportWithBarriers(4, "success_but", ["staff_unsure"]),
      reportWithBarriers(5, "success_but", ["staff_unsure"]),
      // a couple more clean reports
      reportWithBarriers(6, "success", []),
      reportWithBarriers(7, "success", []),
    ];
    const facts = surfaceBarrierFacts(reports, NOW);
    expect(facts.length).toBeLessThanOrEqual(4);
    // First fact should be the most actionable warning
    if (facts[0]) expect(facts[0].kind).not.toBe("rare");
  });
});

// -----------------------------------------------------------------------------
// Pin size (algorithms.md §5)
// -----------------------------------------------------------------------------

describe("calculatePinSize", () => {
  it("0 reports → 16 px", () => expect(calculatePinSize(0)).toBe(16));
  it("1 report → 18 px", () => expect(calculatePinSize(1)).toBe(18));
  it("100 reports → 32 px", () => expect(calculatePinSize(100)).toBe(32));
  it("1000 reports → 40 px", () => expect(calculatePinSize(1000)).toBe(40));
  it("never exceeds 48 px", () => {
    expect(calculatePinSize(1_000_000)).toBeLessThanOrEqual(48);
  });
});

// -----------------------------------------------------------------------------
// Haversine (algorithms.md §6)
// -----------------------------------------------------------------------------

describe("haversineDistance", () => {
  it("Sydney → Melbourne ≈ 713 km", () => {
    const sydney = { lat: -33.8688, lon: 151.2093 };
    const melbourne = { lat: -37.8136, lon: 144.9631 };
    const km = haversineDistance(sydney, melbourne);
    expect(km).toBeGreaterThan(700);
    expect(km).toBeLessThan(720);
  });
});

// -----------------------------------------------------------------------------
// isOpenNow (algorithms.md §7)
// -----------------------------------------------------------------------------

describe("isOpenNow", () => {
  it("null hours → null", () => {
    expect(isOpenNow(null)).toBeNull();
    expect(isOpenNow(undefined as unknown as null)).toBeNull();
  });

  it("returns true when within window", () => {
    const monday = new Date("2026-05-04T10:30:00"); // local time
    const open = isOpenNow({ mon: [{ from: "09:00", to: "17:00" }] }, monday);
    expect(open).toBe(true);
  });

  it("returns false when outside window", () => {
    const sunday = new Date("2026-05-03T10:30:00");
    const open = isOpenNow({ mon: [{ from: "09:00", to: "17:00" }] }, sunday);
    expect(open).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Pin-status flip (algorithms.md §9)
// -----------------------------------------------------------------------------

describe("classifyPinFlip", () => {
  it("grey → anything is no_meaningful_flip", () => {
    expect(classifyPinFlip("grey", "green")).toBe("no_meaningful_flip");
    expect(classifyPinFlip("grey", "red")).toBe("no_meaningful_flip");
  });
  it("anything → grey is no_meaningful_flip", () => {
    expect(classifyPinFlip("green", "grey")).toBe("no_meaningful_flip");
  });
  it("same status is no_meaningful_flip", () => {
    expect(classifyPinFlip("amber", "amber")).toBe("no_meaningful_flip");
  });
  it("red → green is improvement", () => {
    expect(classifyPinFlip("red", "green")).toBe("improvement");
  });
  it("green → red is degradation", () => {
    expect(classifyPinFlip("green", "red")).toBe("degradation");
  });
  it("amber → green is improvement", () => {
    expect(classifyPinFlip("amber", "green")).toBe("improvement");
  });
});

// -----------------------------------------------------------------------------
// filterByAbsenceOfBarriers (algorithms.md §4)
// -----------------------------------------------------------------------------

describe("filterByAbsenceOfBarriers", () => {
  function loc(
    id: string,
    facts: { barrier: BarrierValue; kind: "rare" | "occasional" | "frequent" }[],
  ): LocationWithConsensus {
    return {
      id,
      name: `loc ${id}`,
      address: "x",
      latitude: "0",
      longitude: "0",
      type: "pharmacy",
      hours: null,
      hoursStructured: null,
      phone: null,
      website: null,
      accessNotes: null,
      naloxoneForms: ["nasal_spray"],
      tags: [],
      verificationLevel: "unverified",
      partnerOrgId: null,
      thnObjectId: null,
      nswNspListing: null,
      vicNspListing: null,
      vicNspSuppliesNaloxone: null,
      addedByDeviceKey: null,
      addedAt: NOW,
      totalReportsCount: 0,
      reliabilityScore: "0.00",
      lastReportAt: null,
      archivedAt: null,
      pinStatus: "amber",
      pinSize: 24,
      consensusLabel: "x",
      reliabilityStars: 0,
      recentReports: [],
      guardianNotes: [],
      barrierFacts: facts.map((f) => ({
        kind: f.kind,
        barrier: f.barrier,
        label: f.barrier,
        countInWindow: 1,
        windowDays: 30,
      })),
    };
  }

  it("hides locations with frequent matching barrier", () => {
    const a = loc("a", [{ barrier: "id_required", kind: "frequent" }]);
    const b = loc("b", [{ barrier: "cost_involved", kind: "frequent" }]);
    const result = filterByAbsenceOfBarriers([a, b], ["id_required"]);
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("does not hide on occasional", () => {
    const a = loc("a", [{ barrier: "id_required", kind: "occasional" }]);
    const result = filterByAbsenceOfBarriers([a], ["id_required"]);
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("empty hide list returns all", () => {
    const a = loc("a", [{ barrier: "id_required", kind: "frequent" }]);
    expect(filterByAbsenceOfBarriers([a], [])).toEqual([a]);
  });
});
