import { expect, it } from "vitest";
import { ACTION_TOKEN_DAYS, createActionToken, verifyActionToken } from "./action-token";

const secret = "0123456789abcdefghijklmnopqrstuvwxyz";
it("binds a token to one action and notification for 30 days", () => {
  const now = Date.parse("2026-09-26T00:00:00Z");
  const token = createActionToken("mark-read", 42, secret, now);
  expect(verifyActionToken(token, "mark-read", secret, now)).toEqual({ notificationId: 42 });
  expect(verifyActionToken(token, "send-kapowarr", secret, now)).toBe("invalid");
  expect(verifyActionToken(token.replace(/.$/, "x"), "mark-read", secret, now)).toBe("invalid");
  expect(verifyActionToken(token, "mark-read", secret, now + ACTION_TOKEN_DAYS * 86400000)).toBe("expired");
});
