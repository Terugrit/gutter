import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const directory = mkdtempSync(join(tmpdir(), "gutter-notifications-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");

let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let service: typeof import("@/lib/services/notifications");
let notificationRoute: typeof import("@/app/api/notifications/[id]/route");
let notificationsRoute: typeof import("@/app/api/notifications/route");
let readRoute: typeof import("@/app/api/notifications/[id]/read/route");

beforeAll(async () => {
  database = await import("@/db");
  schema = await import("@/db/schema");
  service = await import("@/lib/services/notifications");
  notificationRoute = await import("@/app/api/notifications/[id]/route");
  notificationsRoute = await import("@/app/api/notifications/route");
  readRoute = await import("@/app/api/notifications/[id]/read/route");
});

beforeEach(() => database.sqlite.exec("DELETE FROM notifications; DELETE FROM issues; DELETE FROM followed_series;"));
afterAll(() => { database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

async function fixture(index: number) {
  const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: `notification-${index}`, title: `Series ${index}`, matchStatus: "confirmed" }).returning())[0];
  const issue = (await database.db.insert(schema.issues).values({ metronIssueId: 9000 + index, followedSeriesId: follow.id, number: String(index), storeDate: `2026-09-${String(index).padStart(2, "0")}`, updatedAt: new Date().toISOString() }).returning())[0];
  const notification = (await database.db.insert(schema.notifications).values({ issueId: issue.id, type: "new_release", dedupeKey: `new-release:${issue.id}` }).returning())[0];
  return { issue, notification };
}

it("soft-deletes one notification while retaining its delivery record", async () => {
  const { issue, notification } = await fixture(1);
  expect(await service.getNotifications()).toHaveLength(1);
  const response = await notificationRoute.DELETE(new Request("http://localhost/api/notifications/1", { method: "DELETE" }), { params: Promise.resolve({ id: String(notification.id) }) });
  expect(response.status).toBe(200);
  expect(await service.getNotifications()).toEqual([]);
  expect(await service.getNotification(notification.id)).toBeNull();
  expect(await service.getUnreadNotificationCount()).toBe(0);
  expect(await service.oldestNotificationDate()).toBe("");
  const retained = (await database.db.select().from(schema.notifications).where(eq(schema.notifications.id, notification.id)))[0];
  expect(retained.deletedAt).toBeTruthy();
  await database.db.insert(schema.notifications).values({ issueId: issue.id, type: "new_release", dedupeKey: retained.dedupeKey }).onConflictDoNothing();
  expect(await database.db.select().from(schema.notifications)).toHaveLength(1);
  expect((await notificationRoute.DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: String(notification.id) }) })).status).toBe(404);
  expect((await readRoute.PATCH(new Request("http://localhost", { method: "PATCH" }), { params: Promise.resolve({ id: String(notification.id) }) })).status).toBe(404);
  expect((await notificationRoute.DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
});

it("clears every visible release notification but leaves digest history alone", async () => {
  const first = await fixture(2);
  await fixture(3);
  await database.db.insert(schema.notifications).values({ issueId: first.issue.id, type: "weekly_digest", dedupeKey: "weekly:2026-09-23" });
  const response = await notificationsRoute.DELETE();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, count: 2 });
  expect(await service.getNotifications()).toEqual([]);
  const rows = await database.db.select().from(schema.notifications);
  expect(rows).toHaveLength(3);
  expect(rows.filter((row) => row.type === "new_release").every((row) => row.deletedAt)).toBe(true);
  expect(rows.find((row) => row.type === "weekly_digest")?.deletedAt).toBeNull();
  expect(await (await notificationsRoute.DELETE()).json()).toEqual({ ok: true, count: 0 });
});

it("adds the soft-delete column idempotently", async () => {
  const { migrateSchema } = await import("@/db/migrate-schema");
  migrateSchema(database.sqlite);
  migrateSchema(database.sqlite);
  const columns = database.sqlite.prepare("PRAGMA table_info(notifications)").all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toContain("deleted_at");
});
