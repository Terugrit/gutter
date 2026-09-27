import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const preview = pathToFileURL(resolve("docs/design/preview.html")).href;
  await page.goto(`${preview}#/shelf`);
  await page.evaluate(() => document.fonts.ready);
  for (const [name, width, height] of [["desktop-shelf-empty", 1440, 900], ["mobile-shelf-empty", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `docs/design/screenshots/${name}.png` });
  }
  await page.goto(`${preview}#/discover`);
  await page.getByRole("button", { name: "Save to shelf" }).first().click();
  await page.getByRole("button", { name: "Save to shelf" }).first().click();
  await page.goto(`${preview}#/shelf`);
  await page.locator("#toast").evaluate((element) => element.classList.remove("on"));
  for (const [name, width, height] of [["desktop-shelf", 1440, 900], ["mobile-shelf", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `docs/design/screenshots/${name}.png` });
  }
  await page.goto(`${preview}#/dashboard`);
  await page.evaluate(() => document.fonts.ready);
  for (const [name, width, height] of [["desktop-dashboard-coming-soon", 1440, 900], ["mobile-dashboard-coming-soon", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `docs/design/screenshots/${name}.png` });
  }
} finally { await browser.close(); }
