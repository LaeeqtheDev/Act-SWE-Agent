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
