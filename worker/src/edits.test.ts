import { describe, expect, it } from "vitest";
import { InvalidEdit, learningProperties, photoProperties } from "./edits";

describe("learning input", () => {
  it("creates with defaults and only writes sent fields", () => {
    expect(learningProperties({ name: "Rust" }, true)).toEqual({ Name: { title: [{ text: { content: "Rust" } }] }, Status: { select: { name: "Planned" } } });
    expect(Object.keys(learningProperties({ status: "Done" }, false))).toEqual(["Status"]);
  });
  it("clears optional fields", () => {
    expect(learningProperties({ type: "", start: "", target: "", link: "", notes: "", order: "" }, false)).toEqual({
      Type: { select: null }, Start: { date: null }, "Target date": { date: null }, Link: { url: null }, Notes: { rich_text: [] }, Order: { number: null },
    });
  });
  it("rejects bad values", () => {
    expect(() => learningProperties({ name: " " }, true)).toThrow(InvalidEdit);
    expect(() => learningProperties({ status: "Dropped" }, false)).toThrow(InvalidEdit);
    expect(() => learningProperties({ link: "javascript:alert(1)" }, false)).toThrow(InvalidEdit);
    expect(() => learningProperties({ target: "soon" }, false)).toThrow(InvalidEdit);
  });
});

describe("photo input", () => {
  it("maps panel fields to Notion properties", () => {
    expect(photoProperties({ area: "Travel", focus: "Top", inCollage: true, active: false })).toEqual({
      Area: { select: { name: "Travel" } }, Focus: { select: { name: "Top" } }, "In collage": { checkbox: true }, Active: { checkbox: false },
    });
  });
  it("rejects unknown areas and focus values", () => {
    expect(() => photoProperties({ area: "Crypto" })).toThrow(InvalidEdit);
    expect(() => photoProperties({ focus: "Middle" })).toThrow(InvalidEdit);
  });
});
