import { expect, it } from "vitest";
import { notificationActions } from "./notification-actions";

it("omits buttons without a secret and limits Send to eligible follows", () => {
  expect(notificationActions(1, "https://gutter.test", undefined, 42, null)).toEqual([]);
  expect(notificationActions(1, "https://gutter.test", "secret", null, null).map((action) => action.label)).toEqual(["Mark read"]);
  expect(notificationActions(1, "https://gutter.test", "secret", 42, 7).map((action) => action.label)).toEqual(["Mark read"]);
  expect(notificationActions(1, "https://gutter.test", "secret", 42, null).map((action) => action.label)).toEqual(["Mark read", "Send to Kapowarr"]);
});
