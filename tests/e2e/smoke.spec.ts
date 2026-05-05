import { expect, test } from "@playwright/test";

// Thin Phase 0–7 smoke suite. Each test exercises one golden path and is
// resilient to DB seeding: assertions check for UI structure, not specific
// pin names or counter values.

test.describe("Smoke", () => {
  test.beforeEach(async ({ page }) => {
    // Onboarding shows once per device key. Tests run with a fresh storage
    // state by default, so dismiss the overlay if it appears.
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("nl.onboarded", "true"));
    await page.reload();
  });

  test("home page loads with bottom action bar", async ({ page }) => {
    await expect(page.getByRole("button", { name: /I went here/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add a place/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Filters/i })).toBeVisible();
    // The API-unreachable banner must NOT be present on a healthy load.
    await expect(page.getByText(/Could not reach the server/i)).toHaveCount(0);
  });

  test("mode toggle switches Plan ↔ Now", async ({ page }) => {
    const planBtn = page.getByRole("button", { name: "Plan" });
    const nowBtn = page.getByRole("button", { name: "Now" });
    await expect(planBtn).toHaveAttribute("aria-pressed", "true");
    await nowBtn.click();
    // In Now mode, the Call 000 button is the most prominent thing on screen.
    await expect(page.getByRole("button", { name: /Call 000/i })).toBeVisible();
    // "I'm OK now" exits to Plan.
    await page.getByRole("button", { name: /I am OK now/i }).click();
    await expect(planBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("/emergency deep-link boots in Now mode", async ({ page }) => {
    await page.goto("/emergency");
    await expect(page.getByRole("button", { name: /Call 000/i })).toBeVisible();
  });

  test("settings: language switch flips html dir to rtl for Arabic", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.getByRole("combobox", { name: /Language/i }).selectOption("ar");
    await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe("rtl");
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("ar");
    // Switch back so trailing test state stays clean for the next case.
    await page.getByRole("combobox", { name: /Language/i }).selectOption("en");
  });

  test("/about renders the eight-section page", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "About NaloxoneLocate" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What this is/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /How to recognise an overdose/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Privacy/i })).toBeVisible();
  });
});
