import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve("/tmp/test-sheets");
process.env.SHEETS_DIR = DIR;

const { appendToSheet, readSheet } = await import("../tools/spreadsheet.js");

describe("spreadsheet output", () => {
  beforeAll(async () => {
    await fs.rm(DIR, { recursive: true, force: true });
  });
  afterAll(async () => {
    await fs.rm(DIR, { recursive: true, force: true });
  });

  it("writes a real xlsx file that can be read back", async () => {
    const res = await appendToSheet("leads", [
      { Business: "Joe's Cafe", Website: "none", Phone: "555-0100" },
    ]);
    expect(res.success).toBe(true);
    expect(res.totalRows).toBe(1);

    const back = await readSheet("leads");
    expect("rows" in back).toBe(true);
    if ("rows" in back) {
      expect(back.rows[0].Business).toBe("Joe's Cafe");
    }
  });

  it("APPENDS across runs instead of overwriting — a scheduled workflow builds one sheet", async () => {
    await appendToSheet("leads", [{ Business: "Second Shop", Website: "x.com", Phone: "555-0200" }]);
    const back = await readSheet("leads");
    if ("rows" in back) {
      expect(back.rows.length, "second run must not wipe the first").toBe(2);
    }
  });

  it("adds new columns without losing existing data", async () => {
    // The agent won't always produce identically-shaped rows; a new field
    // appearing later must not drop the earlier rows or their values.
    await appendToSheet("leads", [{ Business: "Third", Notes: "no SSL, slow" }]);
    const back = await readSheet("leads");
    if ("rows" in back) {
      expect(back.rows.length).toBe(3);
      expect(back.rows[0].Business).toBe("Joe's Cafe");
      expect(back.rows[2].Notes).toBe("no SSL, slow");
    }
  });

  it("refuses a filename that tries to escape the output directory", async () => {
    await appendToSheet("../../etc/passwd", [{ a: "1" }]);
    const files = await fs.readdir(DIR);
    expect(files.every((f) => f.endsWith(".xlsx"))).toBe(true);
    expect(files.some((f) => f.includes(".."))).toBe(false);
  });

  it("rejects an empty write rather than creating a blank file", async () => {
    const res = await appendToSheet("empty", []);
    expect(res.success).toBe(false);
  });
});
