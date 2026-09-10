import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end tests of the main flow, running against the deterministic mock
 * providers (see playwright.config.ts). No external service is required.
 */

/** Opens the app and waits for client hydration (the map is client-only, so its presence proves it). */
async function openApp(page: Page) {
  await page.goto("/");
  await page.getByTestId("route-map").waitFor();
}

async function pickStart(page: Page, query: string, expected: string) {
  const input = page.getByTestId("start-search");
  await input.fill(query);
  await page.getByRole("option", { name: new RegExp(expected) }).first().click();
  await expect(page.getByTestId("start-search-selected")).toContainText(expected);
}

test.describe("main flow", () => {
  test("generates a road-cycling loop from Annecy and downloads a GPX", async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole("heading", { name: "Circuit" })).toBeVisible();

    // 1. activity
    await page.getByTestId("activity-road_cycling").click();
    await expect(page.getByTestId("activity-road_cycling")).toHaveAttribute("aria-checked", "true");

    // 2. start place with suggestions
    await pickStart(page, "Annecy", "Annecy");

    // 3. loop + distance
    await page.getByRole("radio", { name: "Boucle" }).click();
    await page.getByTestId("distance-input").fill("50");

    // 4. generate
    await page.getByTestId("generate-button").click();

    // 5. results: variants, stats, elevation profile
    await expect(page.getByTestId("route-stats")).toBeVisible({ timeout: 30_000 });
    const cards = page.getByTestId("variant-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
    const distanceText = await page.getByTestId("stat-distance").textContent();
    const km = Number(distanceText!.replace(/\s/g, "").replace("km", "").replace(",", "."));
    expect(km).toBeGreaterThan(44);
    expect(km).toBeLessThan(56);
    await expect(page.getByTestId("stat-ascent")).toContainText("m");
    await expect(page.getByTestId("elevation-profile")).toBeVisible();
    await expect(page.getByTestId("route-dna")).toBeVisible();
    await expect(page.getByTestId("route-insights")).toBeVisible();

    // Switching variant updates the details.
    const firstName = await page.getByTestId("route-name").textContent();
    await cards.nth(1).click();
    await expect(page.getByTestId("route-name")).not.toHaveText(firstName!);

    // 6. GPX download
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-button").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^annecy-velo-\d+km\.gpx$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(path!, "utf8");
    expect(content).toContain('<gpx version="1.1"');
    expect(content).toContain("<trkpt");
    expect(content).toContain("<ele>");
  });

  test("shows a readable error when the start is not routable", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("activity-running").click();
    await pickStart(page, "Océan", "Océan Atlantique");
    await page.getByTestId("distance-input").fill("10");
    await page.getByTestId("generate-button").click();
    const alert = page.getByRole("complementary").getByRole("alert");
    await expect(alert).toContainText(/accessible|praticable/i, { timeout: 30_000 });
    await expect(alert).not.toContainText(/stack|Error:/);
  });

  test("interprets a natural-language request and generates", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("nl-input").fill("Je veux une boucle VTT de 35 km au départ d'Annecy avec environ 800 m de D+");
    await page.getByTestId("nl-submit").click();
    await expect(page.getByTestId("route-stats")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("tab-create").click();
    await expect(page.getByTestId("activity-mtb")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("distance-input")).toHaveValue("35");
    await expect(page.getByTestId("start-search-selected")).toContainText("Annecy");
  });

  test("saves a route to the library and imports a GPX file", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("activity-hiking").click();
    await pickStart(page, "Chamonix", "Chamonix");
    await page.getByTestId("distance-input").fill("12");
    await page.getByTestId("surprise-button").click();
    await expect(page.getByTestId("route-stats")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("save-button").click();
    await page.getByTestId("tab-library").click();
    await expect(page.getByTestId("saved-entry").first()).toBeVisible();

    // GPX import (client side)
    await page.getByTestId("tab-create").click();
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Trace test</name><trkseg>
      ${Array.from({ length: 60 }, (_, i) => `<trkpt lat="${(45.9 + i * 0.001).toFixed(5)}" lon="${(6.13 + Math.sin(i / 5) * 0.002).toFixed(5)}"><ele>${450 + i * 2}</ele></trkpt>`).join("")}
    </trkseg></trk></gpx>`;
    await page.getByTestId("gpx-input").setInputFiles({ name: "trace.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx) });
    await expect(page.getByTestId("route-name")).toHaveText("Trace test");
    await expect(page.getByTestId("stat-distance")).toContainText("km");
    await expect(page.getByTestId("elevation-profile")).toBeVisible();
  });

  test("editor: recalculates after reversing the route", async ({ page }) => {
    await openApp(page);
    await page.getByTestId("activity-gravel").click();
    await pickStart(page, "Lyon", "Lyon");
    await page.getByTestId("distance-input").fill("30");
    await page.getByTestId("generate-button").click();
    await expect(page.getByTestId("route-stats")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("edit-button").click();
    await expect(page.getByTestId("editor-toolbar")).toBeVisible();
    await page.getByRole("button", { name: "Inverser" }).click();
    await expect(page.getByText("Recalcul du parcours…")).toBeVisible();
    await expect(page.getByText("Recalcul du parcours…")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Annuler" })).toBeEnabled();
  });
});
