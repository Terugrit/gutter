import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE followed_series (id INTEGER PRIMARY KEY, komga_series_id TEXT NOT NULL, title TEXT NOT NULL, match_status TEXT NOT NULL, active INTEGER NOT NULL)");
  return { db: drizzle(sqlite), sqlite };
});
import { sqlite } from "@/db";
import { getAttentionCount } from "./attention";

describe("getAttentionCount", () => {
  beforeEach(() => sqlite.exec("DELETE FROM followed_series"));
  it("counts only active unmatched follows", async () => {
    sqlite.exec("INSERT INTO followed_series (komga_series_id,title,match_status,active) VALUES ('a','A','unmatched',1),('b','B','auto',1),('c','C','confirmed',1),('d','D','unmatched',0)");
    expect(await getAttentionCount()).toBe(1);
    sqlite.exec("UPDATE followed_series SET match_status='confirmed' WHERE komga_series_id='a'");
    expect(await getAttentionCount()).toBe(0);
    sqlite.exec("UPDATE followed_series SET match_status='unmatched' WHERE komga_series_id='a'");
    sqlite.exec("UPDATE followed_series SET active=0 WHERE komga_series_id='a'");
    expect(await getAttentionCount()).toBe(0);
  });
});
