import { describe, expect, it } from "vitest";
import { excludedIssue, plainIssueNumber } from "./missing";

describe("missing issue filtering", () => {
  it("keeps only ordinary issue numbers", () => {
    expect(plainIssueNumber("12")).toBe(true);
    expect(plainIssueNumber("12.1")).toBe(true);
    expect(plainIssueNumber("Annual 1")).toBe(false);
    expect(plainIssueNumber("12A")).toBe(false);
  });
  it("excludes annuals and variants rather than counting them as missing", () => {
    expect(excludedIssue("12", "Annual 2026")).toBe(true);
    expect(excludedIssue("12", "Variant cover")).toBe(true);
    expect(excludedIssue("12", "The ordinary issue")).toBe(false);
  });
});
