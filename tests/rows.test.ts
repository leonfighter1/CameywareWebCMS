import { describe, expect, it } from "vitest";
import { insertPlacement, moveCard, moveRow, rowsIn } from "@/lib/rows";

type P = { id: string; zone: string; row?: string };
const p = (id: string, zone = "main", row?: string): P => ({ id, zone, ...(row && { row }) });
/** A list as text: each zone's rows, a row's ids joined by +. */
const shape = (list: P[]) =>
  ["hero", "main"]
    .map(
      (z) =>
        `${z}: ${rowsIn(list, z)
          .map((r) => r.at.map((i) => list[i]!.id).join("+"))
          .join(" | ")}`,
    )
    .join(" / ");

describe("a page's rows (S5)", () => {
  const page = [p("banner", "hero"), p("a", "main", "r1"), p("b", "main", "r1"), p("c"), p("d")];

  it("reads the rows of a zone: placements next to each other with one key; one without a key alone", () => {
    expect(shape(page)).toBe("hero: banner / main: a+b | c | d");
    expect(rowsIn(page, "main").map((r) => r.at)).toEqual([[1, 2], [3], [4]]);
  });

  it("puts a new component beside a row, before one of its own, as a row of its own, or in a new empty row", () => {
    expect(shape(insertPlacement(page, p("x"), { zone: "main", join: [1, 2] }))).toBe(
      "hero: banner / main: a+b+x | c | d",
    );
    expect(shape(insertPlacement(page, p("x"), { zone: "main", join: [1, 2], before: 2 }))).toBe(
      "hero: banner / main: a+x+b | c | d",
    );
    // A row alone gets a key when another joins it, the same component twice too.
    const twice = insertPlacement(page, p("c"), { zone: "main", join: [3] });
    expect(shape(twice)).toBe("hero: banner / main: a+b | c+c | d");
    expect(twice[3]!.row).toBe(twice[4]!.row);
    expect(twice[3]!.row).toMatch(/^r-[a-z0-9]+$/);
    expect(shape(insertPlacement(page, p("x"), { zone: "main", beforeRow: [3] }))).toBe(
      "hero: banner / main: a+b | x | c | d",
    );
    expect(shape(insertPlacement(page, p("x"), { zone: "main" }))).toBe(
      "hero: banner / main: a+b | c | d | x",
    );
    const fresh = insertPlacement(page, p("x"), { zone: "main", beforeRow: [1, 2], row: "r-new" });
    expect(shape(fresh)).toBe("hero: banner / main: x | a+b | c | d");
    expect(fresh[1]!.row).toBe("r-new");
  });

  it("moves a whole row up, down, to the end, into another zone; dropped on itself, nothing changes", () => {
    expect(shape(moveRow(page, [3], { zone: "main", beforeRow: [1, 2] }))).toBe(
      "hero: banner / main: c | a+b | d",
    );
    expect(shape(moveRow(page, [1, 2], { zone: "main", beforeRow: [4] }))).toBe(
      "hero: banner / main: c | a+b | d",
    );
    expect(shape(moveRow(page, [1, 2], { zone: "main" }))).toBe("hero: banner / main: c | d | a+b");
    expect(shape(moveRow(page, [1, 2], { zone: "hero" }))).toBe("hero: banner | a+b / main: c | d");
    expect(moveRow(page, [1, 2], { zone: "main", beforeRow: [1, 2] })).toBe(page);
  });

  it("moves a component into another row, within its row, or out into a row of its own", () => {
    expect(shape(moveCard(page, 4, { zone: "main", join: [1, 2] }))).toBe("hero: banner / main: a+b+d | c");
    expect(shape(moveCard(page, 2, { zone: "main", join: [1, 2], before: 1 }))).toBe(
      "hero: banner / main: b+a | c | d",
    );
    expect(shape(moveCard(page, 1, { zone: "main", join: [1, 2] }))).toBe("hero: banner / main: b+a | c | d");
    const out = moveCard(page, 1, { zone: "main", beforeRow: [4] });
    expect(shape(out)).toBe("hero: banner / main: b | c | a | d");
    expect(out.find((x) => x.id === "a")!.row).toBeUndefined();
    expect(shape(moveCard(page, 3, { zone: "main", join: [4] }))).toBe("hero: banner / main: a+b | d+c");
    // A row of one dropped beside itself, or a card dropped on itself: nothing changes.
    expect(moveCard(page, 3, { zone: "main", join: [3] })).toBe(page);
    expect(moveCard(page, 1, { zone: "main", join: [1, 2], before: 1 })).toBe(page);
    expect(moveCard(page, 3, { zone: "main", beforeRow: [3] })).toBe(page);
  });
});
