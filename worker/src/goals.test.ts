import { describe, expect, it } from "vitest";
import { goalProperties, InvalidGoal } from "./goals";

describe("goal input", () => {
  it("creates a goal with defaults", () => {
    const p = goalProperties({ name: "  Run a 10k  " }, true);
    expect(p.Name).toEqual({ title: [{ text: { content: "Run a 10k" } }] });
    expect(p.Tracking).toEqual({ select: { name: "Manual" } });
    expect(p.Status).toEqual({ status: { name: "Not started" } });
  });

  it("only writes the fields that were sent", () => {
    expect(Object.keys(goalProperties({ current: "900" }, false))).toEqual(["Current"]);
    expect(goalProperties({ current: "1.250,5".replace(".", "") }, false).Current).toEqual({ number: 1250.5 });
  });

  it("clears optional fields", () => {
    const p = goalProperties({ area: "", habit: null, due: "", target: "", notes: "" }, false);
    expect(p).toEqual({ Area: { select: null }, Habit: { select: null }, Due: { date: null }, Target: { number: null }, Notes: { rich_text: [] } });
  });

  it("rejects anything outside the allowed values", () => {
    expect(() => goalProperties({ name: "" }, true)).toThrow(InvalidGoal);
    expect(() => goalProperties({ area: "Crypto" }, false)).toThrow(InvalidGoal);
    expect(() => goalProperties({ tracking: "Money" }, false)).toThrow(InvalidGoal);
    expect(() => goalProperties({ habit: "Smoking" }, false)).toThrow(InvalidGoal);
    expect(() => goalProperties({ status: "Deleted" }, false)).toThrow(InvalidGoal);
    expect(() => goalProperties({ target: "-3" }, false)).toThrow(InvalidGoal);
    expect(() => goalProperties({ due: "tomorrow" }, false)).toThrow(InvalidGoal);
  });

  it("accepts archiving", () => {
    expect(goalProperties({ status: "Archived" }, false).Status).toEqual({ status: { name: "Archived" } });
  });
});
