import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const preview = pathToFileURL(resolve("docs/design/preview.html")).href;
  for (const [route, name] of [["recap/2026", "recap"], ["library", "library"], ["discover", "discover"]]) {
    await page.goto(`${preview}#/${route}`);
    await page.evaluate(() => document.fonts.ready);
    if (name === "discover") await page.locator(".drow").first().hover();
    for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: `docs/design/screenshots/${device}-${name}-m06.png` });
    }
  }
} finally { await browser.close(); }
