import { describe, expect, it } from "vitest";
import { issueState, issueToken, verifyState, verifyToken } from "./auth";

const S = "test-secret";

describe("tokens", () => {
  it("accepts a session token as a session", async () => {
    expect(await verifyToken(S, await issueToken(S))).toBe(true);
  });
  it("never accepts the OneDrive sign-in state as a session", async () => {
    expect(await verifyToken(S, await issueState(S))).toBe(false);
  });
  it("never accepts a session token as the sign-in state", async () => {
    expect(await verifyState(S, await issueToken(S))).toBe(false);
  });
  it("rejects tokens signed with another secret", async () => {
    expect(await verifyToken(S, await issueToken("other"))).toBe(false);
    expect(await verifyState(S, await issueState("other"))).toBe(false);
  });
});
