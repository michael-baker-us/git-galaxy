import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Large histories produce large logs; 256 MiB covers ~1M-commit repos. */
const MAX_BUFFER = 256 * 1024 * 1024;

export class GitError extends Error {
  constructor(
    message: string,
    readonly stderr = "",
  ) {
    super(message);
    this.name = "GitError";
  }
}

export class GitNotInstalledError extends GitError {
  constructor() {
    super("git is not installed or not on PATH");
    this.name = "GitNotInstalledError";
  }
}

/**
 * Run a git command in the given repo. Uses execFile (no shell) so paths and
 * arguments are never interpreted.
 */
export async function runGit(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoPath,
      maxBuffer: MAX_BUFFER,
      encoding: "utf8",
    });
    return stdout;
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === "ENOENT") throw new GitNotInstalledError();
    throw new GitError(`git ${args[0]} failed: ${e.stderr?.trim() || e.message}`, e.stderr ?? "");
  }
}
