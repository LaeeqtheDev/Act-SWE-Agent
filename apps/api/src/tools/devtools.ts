import { readFile as fsReadFile, readdir, writeFile as fsWriteFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

// Local "computer use" tools — the agent reading/editing files and running
// commands on YOUR machine. Entirely opt-in: unless ENABLE_LOCAL_DEV_TOOLS=true
// is set, these aren't even offered to the model (see tools/index.ts), and
// this is never meant to run inside a hosted/cloud deployment — it's a local
// dev-assistant mode only. Reads execute immediately; edits and commands are
// always routed through proposeAction, same as every other write action.

const PROJECT_ROOT = path.resolve(process.env.PROJECT_ROOT || process.cwd());

function resolveInsideProject(relativePath: string): string {
  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error("path escapes the project root — refused");
  }
  return resolved;
}

export async function readProjectFile(relativePath: string): Promise<{ content: string } | { error: string }> {
  try {
    const full = resolveInsideProject(relativePath);
    const content = await fsReadFile(full, "utf-8");
    return { content: content.slice(0, 8000) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "failed to read file" };
  }
}

export async function listProjectDirectory(relativePath: string): Promise<{ entries: string[] } | { error: string }> {
  try {
    const full = resolveInsideProject(relativePath || ".");
    const entries = await readdir(full, { withFileTypes: true });
    return { entries: entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "failed to list directory" };
  }
}

export async function openInEditor(relativePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const full = resolveInsideProject(relativePath || ".");
    spawn("code", [full], { detached: true, stdio: "ignore" }).unref();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "failed to open editor" };
  }
}

export interface FileEditPayload {
  path: string;
  content: string;
}

export async function performFileEdit(payload: FileEditPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const full = resolveInsideProject(payload.path);
    await fsWriteFile(full, payload.content, "utf-8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "failed to write file" };
  }
}

export interface ShellCommandPayload {
  command: string;
}

export async function performShellCommand(payload: ShellCommandPayload): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(payload.command, { shell: true, cwd: PROJECT_ROOT, timeout: 30_000 });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 2000), code }));
  });
}

// Searching across files is how you actually navigate a codebase — "where
// is this function defined", "what calls this". Without it the agent could
// only read files it already knew the path of, which meant guessing at
// paths one at a time and burning steps on misses.
export async function searchProjectFiles(
  query: string,
  opts: { extensions?: string[]; maxResults?: number } = {}
): Promise<{ matches: { file: string; line: number; text: string }[] } | { error: string }> {
  const { extensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".py", ".go", ".rs"], maxResults = 30 } = opts;
  const matches: { file: string; line: number; text: string }[] = [];
  const lowered = query.toLowerCase();

  const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", "coverage", ".pnpm-store"]);

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 8 || matches.length >= maxResults) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= maxResults) return;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      if (SKIP.has(entry.name)) continue;

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!extensions.some((e) => entry.name.endsWith(e))) continue;

      try {
        const content = await fsReadFile(full, "utf-8");
        // Skip minified or generated files — one 40,000-char line is never
        // a useful search result and would blow the response size.
        if (content.length > 400_000) continue;

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].toLowerCase().includes(lowered)) continue;
          matches.push({
            file: path.relative(PROJECT_ROOT, full),
            line: i + 1,
            text: lines[i].trim().slice(0, 160),
          });
          if (matches.length >= maxResults) return;
        }
      } catch {
        // unreadable file — skip rather than fail the whole search
      }
    }
  }

  try {
    await walk(PROJECT_ROOT);
    if (matches.length === 0) return { error: `No matches for "${query}" in the project.` };
    return { matches };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "search failed" };
  }
}
