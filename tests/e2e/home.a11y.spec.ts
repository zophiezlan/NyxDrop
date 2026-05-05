import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Constitution IX: WCAG 2.1 AA is the floor. This suite runs axe-core against
// the primary public surfaces. New WCAG 2.1 AA violations should fail CI; we
// scope to that tag set rather than all axe rules to avoid noisy "best
// practice" warnings dictating release readiness.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe("Accessibility", () => {
  test("/ — primary map surface", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("nl.onboarded", "true"));
    await page.reload();
    // Wait for the bottom action bar to make sure the app has hydrated.
    await page.getByRole("button", { name: /I went here/i }).waitFor();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("/about — static info page", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("heading", { name: "About NaloxoneLocate" }).waitFor();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("/ with onboarding overlay open", async ({ page }) => {
    await page.goto("/");
    // Don't dismiss — verify the modal itself is accessible.
    await page.getByRole("dialog", { name: /NaloxoneLocate/i }).waitFor();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
