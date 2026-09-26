import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import sample from "../../docs/design/sample-data.json";
import { resolve } from "node:path";
const desktop = { width: 1440, height: 900 }; const mobile = { width: 390, height: 844 };
test.beforeEach(() => {
  const sqlite = new Database(resolve("data/visual-test.db"));
  sqlite.prepare("DELETE FROM kv_cache WHERE key = 'job:backup-db'").run();
  sqlite.exec("DELETE FROM issues WHERE followed_series_id IN (SELECT id FROM followed_series WHERE komga_series_id='visual:m02'); DELETE FROM followed_series WHERE komga_series_id='visual:m02';");
  sqlite.exec("DELETE FROM issues WHERE followed_series_id IN (SELECT id FROM followed_series WHERE komga_series_id='visual:m04'); DELETE FROM followed_series WHERE komga_series_id='visual:m04';");
  sqlite.prepare("DELETE FROM followed_series WHERE komga_series_id = ?").run("visual:12");
  const setRead = sqlite.prepare("UPDATE notifications SET read_at = ? WHERE id = ?");
  for (const item of sample.notifications) setRead.run(item.u ? null : "2026-09-20T00:00:00Z", item.id);
  sqlite.close();
});

test("Settings downloads follows, imports a file and runs a backup", async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto("/settings");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download follows" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("gutter-follows.json");
  await page.getByLabel("Import follows").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"version":2,"follows":[]}') });
  await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Follows", exact: true }) }).getByRole("status")).toContainText("Invalid follows file");
  await page.getByLabel("Import follows").setInputFiles({ name: "empty.json", mimeType: "application/json", buffer: Buffer.from('{"version":1,"follows":[]}') });
  await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Follows", exact: true }) }).getByRole("status")).toContainText("0 follows imported");
  await page.locator(".srow").filter({ hasText: "Database backup" }).getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Database backup saved.", { exact: true })).toBeVisible();
});

test("mobile Settings follows controls", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto("/settings");
  await expect(async () => { await page.getByLabel("Import follows").scrollIntoViewIfNeeded(); }).toPass({ timeout: 5000 });
  await shot(page, "mobile-settings-follows");
});
const shot = async (page: import("@playwright/test").Page, name: string) => { await page.locator("#clock").evaluate((element) => { element.textContent = ""; }); await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.02 }); };
function seedProgress(state: "incomplete" | "up-to-date" | "complete") {
  const sqlite = new Database(resolve("data/visual-test.db"));
  const follow = sqlite.prepare("INSERT INTO followed_series (komga_series_id,title,publisher,match_status,monitor_mode,series_status,created_at) VALUES ('visual:m02','Night Signal','Harbor Press','confirmed','all',?,'2020-01-01T00:00:00Z')").run(state === "complete" ? "completed" : "ongoing");
  const insert = sqlite.prepare("INSERT INTO issues (metron_issue_id,followed_series_id,number,title,store_date,owned,updated_at) VALUES (?,?,?,?,'2026-09-21',?,'2026-09-21T00:00:00Z')");
  insert.run(900001, follow.lastInsertRowid, "1", "First light", 1);
  insert.run(900002, follow.lastInsertRowid, "2", "Second light", state === "incomplete" ? 0 : 1);
  sqlite.close();
}
for (const state of ["incomplete", "up-to-date", "complete"] as const) test(`series progress ${state}`, async ({ page }) => {
  seedProgress(state);
  await page.setViewportSize(desktop);
  await page.goto("/series/visual%3Am02");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", state === "incomplete" ? "1" : "2");
  await shot(page, `desktop-series-${state}`);
});
test("mobile skip, reload, filtered list and unskip", async ({ page }) => {
  seedProgress("incomplete");
  await page.setViewportSize(mobile);
  await page.goto("/series/visual%3Am02");
  await page.getByRole("button", { name: /#2 Second light/ }).click();
  await page.getByRole("button", { name: "Skip issue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unskip issue", exact: true })).toBeEnabled();
  await expect(page.locator(".series-progress-label")).toContainText("1 / 1 issues owned");
  await page.reload();
  await expect(page.getByRole("button", { name: /#2 Second light/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Skipped (1)" }).click();
  await shot(page, "mobile-series-skipped");
  await page.getByRole("button", { name: /#2 Second light/ }).click();
  await shot(page, "mobile-series-unskip");
  await page.getByRole("button", { name: "Unskip issue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Skip issue", exact: true })).toBeEnabled();
  await expect(page.locator(".series-progress-label")).toContainText("1 / 2 issues owned");
  await page.getByRole("button", { name: "← Issues" }).click();
  await expect(page.getByRole("button", { name: "Skipped (0)" })).toBeVisible();
  await page.getByRole("button", { name: "Issues", exact: true }).click();
  await expect(page.getByRole("button", { name: /#2 Second light/ })).toBeVisible();
});
for (const [name, path] of [["desktop-notifications-detail", "/notifications/2"], ["desktop-notifications-empty", "/notifications"], ["desktop-dashboard", "/"], ["desktop-library", "/library"], ["desktop-discover", "/discover"], ["desktop-settings", "/settings"]] as const) test(name, async ({ page }) => { await page.setViewportSize(desktop); await page.goto(path); await shot(page, name); });
test("coming-up dashboard strip on desktop and mobile", async ({ page }) => {
  const date = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
  const sqlite = new Database(resolve("data/visual-test.db"));
  const follow = sqlite.prepare("INSERT INTO followed_series (komga_series_id,title,publisher,match_status,monitor_mode,created_at) VALUES ('visual:m04','Night Signal','Harbor Press','confirmed','all','2020-01-01T00:00:00Z')").run();
  sqlite.prepare("INSERT INTO issues (metron_issue_id,followed_series_id,number,title,store_date,previous_date,date_changed_at,updated_at) VALUES (990004,?,15,'The new signal',?,?,?,?)").run(follow.lastInsertRowid, date, "2026-09-23", Date.now(), new Date().toISOString());
  sqlite.close();
  await page.setViewportSize(desktop);
  await page.goto("/");
  await expect(page.locator(".upcoming-week figure")).toHaveCount(1);
  await expect(page.locator(".upcoming-week .moved-tag")).toHaveText("moved");
  const normalise = async () => { await page.locator(".week-label").evaluate((element) => { element.textContent = "Week of 5 Oct"; }); await page.locator(".upcoming-week figcaption span").evaluate((element) => { element.textContent = "2026-10-07 / The new signal"; }); await page.locator("nextjs-portal").evaluateAll((elements) => elements.forEach((element) => element.remove())); await page.locator(".upcoming-week").scrollIntoViewIfNeeded(); };
  await normalise();
  await shot(page, "desktop-dashboard-coming-up");
  await page.setViewportSize(mobile);
  await normalise();
  await shot(page, "mobile-dashboard-coming-up");
});
test("desktop-library-selected", async ({ page }) => { await page.setViewportSize(desktop); await page.goto("/library"); await page.locator(".item").nth(2).click(); await page.locator(".item").nth(4).click(); await shot(page, "desktop-library-selected"); });
test.describe("mobile", () => {
  test.use({ viewport: mobile, deviceScaleFactor: 2 });
  for (const [name, path] of [["mobile-notifications-list", "/notifications"], ["mobile-notifications-detail", "/notifications/3"], ["mobile-dashboard", "/"], ["mobile-discover", "/discover"]] as const) test(name, async ({ page }) => { await page.goto(path); await shot(page, name); });
});

test("attention badge and filtered Library", async ({ page }) => {
  const sqlite = new Database(resolve("data/visual-test.db"));
  sqlite.prepare("INSERT INTO followed_series (komga_series_id,title,publisher,match_status,active,created_at) VALUES (?,?,?,'unmatched',1,?)").run("visual:12", "Glass Meridian", "Harbor Press", "2026-09-24T00:00:00Z");
  sqlite.close();
  await page.setViewportSize(desktop);
  await page.goto("/library?followed=1&attention=1");
  await expect(page.getByRole("link", { name: "1 series needs a match" })).toBeVisible();
  await expect(page.locator(".grid .item")).toHaveCount(1);
  await shot(page, "desktop-library-attention");
});

test("mobile attention badge", async ({ page }) => {
  const sqlite = new Database(resolve("data/visual-test.db"));
  sqlite.prepare("INSERT INTO followed_series (komga_series_id,title,publisher,match_status,active,created_at) VALUES (?,?,?,'unmatched',1,?)").run("visual:12", "Glass Meridian", "Harbor Press", "2026-09-24T00:00:00Z");
  sqlite.close();
  await page.setViewportSize(mobile);
  await page.goto("/library?followed=1&attention=1");
  await expect(page.locator(".tabbar .attention-badge")).toHaveText("1");
  await shot(page, "mobile-library-attention");
});

test("PWA manifest and icons resolve", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json() as { name: string; display: string; icons: { src: string }[] };
  expect(manifest).toMatchObject({ name: "Gutter", display: "standalone" });
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBeTruthy();
  expect((await page.request.get("/apple-touch-icon.png")).ok()).toBeTruthy();
  expect(errors).toEqual([]);
});

test("keyboard list navigation and search typing", async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Unread only" }).click();
  await page.getByRole("button", { name: "Unread only" }).click();
  await expect(page.getByRole("button", { name: "Unread only" })).toHaveAttribute("aria-pressed", "false");
  await page.locator(".idx-head").click();
  await page.keyboard.press("j");
  await expect(page.locator(".index .row").first()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("j");
  await expect(page.locator(".index .row").nth(1)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("k");
  await expect(page.locator(".index .row").first()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/notifications\/1$/);
  await expect(page.locator(".stage .hl")).toContainText(/Night Signal/i);
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/notifications\/2$/);
  await expect(page.locator(".stage .hl")).toContainText(/The Salt Line/i);
  await expect(page.locator('.index .row[href="/notifications/2"]')).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/\/notifications\/1$/);
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Search your library" }).fill("j");
  await expect(page.getByRole("searchbox", { name: "Search your library" })).toHaveValue("j");
  await expect(page).toHaveURL(/\/library$/);
});

test("mobile Escape returns to the notification list", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto("/notifications/2");
  await page.getByRole("button", { name: "Mark unread" }).click();
  await expect(page.getByRole("button", { name: "Marked unread" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/notifications\/3$/);
  await expect(page.locator(".stage .hl")).toContainText(/Hollow Crown/i);
  await page.getByRole("button", { name: "Mark unread" }).click();
  await expect(page.getByRole("button", { name: "Marked unread" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/notifications$/);
});


test("series management opens from Library and saves monitoring mode", async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto("/library");
  await page.getByRole("link", { name: "Manage issues" }).first().click();
  await expect(page).toHaveURL(/\/series\/visual%3A0/i);
  await expect(page.getByRole("button", { name: "Future only" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Future only" }).click();
  await expect(page.getByRole("button", { name: "Future only" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Future only" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /#14/ }).click();
  await expect(page.getByText("Issue title")).toBeVisible();
});

test("health reports the migrated test database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response).toBeOK();
});

test.describe("mobile series", () => {
  test.use({ viewport: mobile, deviceScaleFactor: 2 });
  test("opens an issue and returns to its index", async ({ page }) => {
    await page.goto("/series/visual%3A0");
    await expect(page.getByRole("button", { name: /#14/ })).toBeVisible();
    await page.getByRole("button", { name: /#14/ }).click();
    await expect(page.getByText("Issue title")).toBeVisible();
    await page.getByRole("button", { name: "← Issues" }).click();
    await expect(page.getByRole("button", { name: /#14/ })).toBeVisible();
  });
});

