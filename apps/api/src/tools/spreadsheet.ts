import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs/promises";

// Real .xlsx output, not CSV. The whole point of a lead-generation workflow
// is handing someone a file they can open, sort, and filter — a CSV of
// business names loses that the moment a field contains a comma.
//
// Rows APPEND across runs by design: a workflow that scrapes 20 businesses
// an hour should build one growing sheet, not 24 separate files a day.

const SHEETS_DIR = path.resolve(process.env.SHEETS_DIR || "generated-sheets");

function safeName(name: string): string {
  // Prevents a model-supplied name from escaping the output directory.
  const base = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "sheet";
  return `${base.slice(0, 60)}.xlsx`;
}

export interface SheetRow {
  [column: string]: string | number | null;
}

export async function appendToSheet(
  sheetName: string,
  rows: SheetRow[]
): Promise<{ success: boolean; file: string; totalRows: number; error?: string }> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, file: "", totalRows: 0, error: "No rows provided." };
  }

  try {
    await fs.mkdir(SHEETS_DIR, { recursive: true });
    const filePath = path.join(SHEETS_DIR, safeName(sheetName));

    const workbook = new ExcelJS.Workbook();
    let sheet: ExcelJS.Worksheet;

    // Reopen an existing file so runs accumulate instead of overwriting.
    try {
      await fs.access(filePath);
      await workbook.xlsx.readFile(filePath);
      sheet = workbook.worksheets[0] ?? workbook.addWorksheet("Data");
    } catch {
      sheet = workbook.addWorksheet("Data");
    }

    // Union of keys across all rows — the agent won't always produce
    // identically-shaped objects, and dropping a column because row 3
    // happened to omit it would silently lose data.
    const incoming = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const existing = (sheet.getRow(1).values as unknown[]) ?? [];
    const headers = existing.length > 1 ? (existing.slice(1) as string[]) : [];

    for (const key of incoming) {
      if (!headers.includes(key)) headers.push(key);
    }

    sheet.getRow(1).values = headers;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };

    for (const row of rows) {
      sheet.addRow(headers.map((h) => row[h] ?? ""));
    }

    // Width to content so it's readable on open, capped so one long URL
    // doesn't produce a 400-character column.
    headers.forEach((h, i) => {
      const col = sheet.getColumn(i + 1);
      const longest = Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length));
      col.width = Math.min(Math.max(longest + 2, 12), 60);
    });

    sheet.views = [{ state: "frozen", ySplit: 1 }];
    await workbook.xlsx.writeFile(filePath);

    return { success: true, file: path.basename(filePath), totalRows: sheet.rowCount - 1 };
  } catch (err) {
    return {
      success: false,
      file: "",
      totalRows: 0,
      error: err instanceof Error ? err.message : "failed to write spreadsheet",
    };
  }
}

export async function readSheet(sheetName: string): Promise<{ rows: SheetRow[] } | { error: string }> {
  try {
    const filePath = path.join(SHEETS_DIR, safeName(sheetName));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { error: "Sheet is empty." };

    const headers = ((sheet.getRow(1).values as unknown[]) ?? []).slice(1) as string[];
    const rows: SheetRow[] = [];

    sheet.eachRow((row, i) => {
      if (i === 1) return; // header
      const values = (row.values as unknown[]).slice(1);
      const obj: SheetRow = {};
      headers.forEach((h, j) => {
        const v = values[j];
        obj[h] = v == null ? "" : typeof v === "object" ? String((v as { text?: string }).text ?? v) : (v as string | number);
      });
      rows.push(obj);
    });

    // Capped: a 500-row sheet would blow the model's context in one call.
    return { rows: rows.slice(0, 100) };
  } catch {
    return { error: `No sheet named "${sheetName}" yet. It'll be created on the first appendToSheet call.` };
  }
}

export async function listSheets(): Promise<{ sheets: string[] }> {
  try {
    const files = await fs.readdir(SHEETS_DIR);
    return { sheets: files.filter((f) => f.endsWith(".xlsx")) };
  } catch {
    return { sheets: [] };
  }
}
