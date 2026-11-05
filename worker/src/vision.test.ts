import { describe, expect, it } from "vitest";
import { AREAS } from "./config";
import { pickToday, type Photo } from "./vision";

const photo = (id: string, area: string | null, inCollage = true): Photo => ({ id, name: id, area, inCollage, order: 0, focus: "center", version: "1" });
const photos: Photo[] = [
  ...Array.from({ length: 6 }, (_, i) => photo(`v${i}`, "Vision")),
  ...Array.from({ length: 4 }, (_, i) => photo(`h${i}`, "Health & Gym")),
  ...Array.from({ length: 3 }, (_, i) => photo(`t${i}`, "Travel")),
  photo("a0", "Apolo"),
  photo("hidden", "Travel", false),
];

describe("vision board daily pick", () => {
  it("is the same all day and changes on other days", () => {
    const a = pickToday(photos, AREAS, "2026-11-05", 8);
    expect(pickToday(photos, AREAS, "2026-11-05", 8)).toEqual(a);
    const days = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"].map((d) => pickToday(photos, AREAS, d, 8).collage.map((p) => p.id).join());
    expect(days.some((d) => d !== a.collage.map((p) => p.id).join())).toBe(true);
  });

  it("shows up to 8 collage photos, only those marked In collage, no repeats", () => {
    const { collage } = pickToday(photos, AREAS, "2026-11-05", 8);
    expect(collage).toHaveLength(8);
    expect(collage.some((p) => p.id === "hidden")).toBe(false);
    expect(new Set(collage.map((p) => p.id)).size).toBe(8);
  });

  it("gives each area a cover from its own photos, and null when it has none", () => {
    const { covers } = pickToday(photos, AREAS, "2026-11-05", 8);
    expect(covers["Apolo"]?.id).toBe("a0");
    expect(covers["Health & Gym"]?.area).toBe("Health & Gym");
    expect(covers["Career & Code"]).toBeNull();
  });

  it("keeps today's covers out of the collage when there are enough photos", () => {
    const { collage, covers } = pickToday(photos, AREAS, "2026-11-05", 8);
    const coverIds = new Set(Object.values(covers).map((p) => p?.id));
    expect(collage.some((p) => coverIds.has(p.id))).toBe(false);
  });

  it("works with few photos", () => {
    const few = [photo("x", "Vision"), photo("y", "Travel")];
    const { collage, covers } = pickToday(few, AREAS, "2026-11-05", 8);
    expect(collage.map((p) => p.id).sort()).toEqual(["x", "y"]);
    expect(covers["Travel"]?.id).toBe("y");
  });
});
