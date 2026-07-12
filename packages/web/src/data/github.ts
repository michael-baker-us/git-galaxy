import {
  type Author,
  type Commit,
  type GalaxySnapshot,
  type TreeEntry,
  type UniverseSnapshot,
  buildTree,
} from "@git-galaxy/shared";

/**
 * Browser-side RepoSource for the static (GitHub Pages) deployment: fetches
 * any public repo — or a whole account's repos as a universe — straight from
 * api.github.com (CORS-enabled).
 *
 * Constraints vs the local CLI:
 *  - unauthenticated rate limit is 60 requests/hour, so commits default to
 *    1,000 for a single repo and 200/repo in owner mode; an optional token
 *    raises the limit to 5,000/hr
 *  - the commits list API carries no insertion/deletion stats, so star
 *    sizes are uniform on the web (stats stay zeroed, never fabricated)
 */

const API = "https://api.github.com";
export const WEB_MAX_COMMITS = 1000;
/** Owner mode fans out across repos, so each one gets a leaner budget. */
export const OWNER_MAX_REPOS = 8;
export const OWNER_MAX_COMMITS = 200;
const PER_PAGE = 100;
const CACHE_PREFIX = "gg:snapshot:";
const CACHE_TTL_MS = 60 * 60 * 1000;

export class GitHubFetchError extends Error {}

export type ProgressFn = (message: string) => void;

interface CommitItem {
  sha: string;
  parents: { sha: string }[];
  commit: {
    message: string;
    author: { name?: string; email?: string; date?: string } | null;
  };
}

interface RepoItem {
  name: string;
  default_branch: string;
  fork: boolean;
  size: number;
  pushed_at: string;
}

async function api(path: string, token: string | undefined): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.ok) return res;
  if (res.status === 404)
    throw new GitHubFetchError("not found on GitHub (private repos need a token)");
  if (res.status === 401) throw new GitHubFetchError("token was rejected by GitHub");
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
    const wait = reset > Date.now() ? ` — resets ${new Date(reset).toLocaleTimeString()}` : "";
    throw new GitHubFetchError(
      `GitHub rate limit hit${wait}. Add a token below for 5,000 requests/hour.`,
    );
  }
  if (res.status === 409) return res; // empty repository — handled by callers
  throw new GitHubFetchError(`GitHub API error ${res.status}`);
}

export async function fetchGitHubUniverse(
  input: string,
  token: string | undefined,
  onProgress: ProgressFn,
): Promise<UniverseSnapshot> {
  const ref = input
    .trim()
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\/+$/, "");

  const cached = readCache(ref);
  if (cached) {
    onProgress("loaded from cache");
    return cached;
  }

  let universe: UniverseSnapshot;
  if (/^[\w.-]+$/.test(ref)) {
    universe = await fetchOwnerUniverse(ref, token, onProgress);
  } else if (/^[\w.-]+\/[\w.-]+$/.test(ref)) {
    universe = {
      generatedAt: Date.now(),
      galaxies: [await fetchGalaxy(ref, null, WEB_MAX_COMMITS, token, onProgress)],
    };
  } else {
    throw new GitHubFetchError(`"${input}" doesn't look like an owner or owner/repo`);
  }
  writeCache(ref, universe);
  return universe;
}

/** A whole account as a universe: its most recently active source repos. */
async function fetchOwnerUniverse(
  owner: string,
  token: string | undefined,
  onProgress: ProgressFn,
): Promise<UniverseSnapshot> {
  onProgress(`listing ${owner}'s repositories …`);
  const res = await api(`/users/${owner}/repos?per_page=100&sort=pushed`, token);
  const all = (await res.json()) as RepoItem[];
  const repos = all.filter((r) => !r.fork && r.size > 0).slice(0, OWNER_MAX_REPOS);
  if (repos.length === 0) {
    throw new GitHubFetchError(`${owner} has no non-fork repositories to render`);
  }

  const galaxies: GalaxySnapshot[] = [];
  for (const repo of repos) {
    const label = `${galaxies.length + 1}/${repos.length} ${repo.name}`;
    galaxies.push(
      await fetchGalaxy(
        `${owner}/${repo.name}`,
        repo.default_branch,
        OWNER_MAX_COMMITS,
        token,
        (m) => onProgress(`${label}: ${m}`),
      ),
    );
  }
  return { generatedAt: Date.now(), galaxies };
}

async function fetchGalaxy(
  ref: string,
  knownBranch: string | null,
  maxCommits: number,
  token: string | undefined,
  onProgress: ProgressFn,
): Promise<GalaxySnapshot> {
  let branch = knownBranch;
  let name = ref.split("/")[1] ?? ref;
  if (!branch) {
    onProgress(`looking up ${ref} …`);
    const repoRes = await api(`/repos/${ref}`, token);
    const repo = (await repoRes.json()) as { name: string; default_branch: string };
    branch = repo.default_branch;
    name = repo.name;
  }

  // Total commit count via the Link header trick: per_page=1, read last page.
  let totalCommits = 0;
  const countRes = await api(`/repos/${ref}/commits?per_page=1`, token);
  if (countRes.status !== 409) {
    const link = countRes.headers.get("link");
    const last = link?.match(/[?&]page=(\d+)>; rel="last"/);
    totalCommits = last?.[1] ? Number(last[1]) : (await countRes.json()).length > 0 ? 1 : 0;
  }

  const authors: Author[] = [];
  const authorIds = new Map<string, number>();
  const commits: Commit[] = [];
  const pages = Math.ceil(Math.min(totalCommits, maxCommits) / PER_PAGE);
  for (let page = 1; page <= pages; page++) {
    onProgress(`fetching commits ${commits.length}/${Math.min(totalCommits, maxCommits)} …`);
    const res = await api(`/repos/${ref}/commits?per_page=${PER_PAGE}&page=${page}`, token);
    if (res.status === 409) break;
    const items = (await res.json()) as CommitItem[];
    for (const item of items) {
      const authorName = item.commit.author?.name ?? "unknown";
      const email = item.commit.author?.email ?? "";
      const key = `${authorName}\x00${email}`;
      let authorId = authorIds.get(key);
      if (authorId === undefined) {
        authorId = authors.length;
        authorIds.set(key, authorId);
        authors.push({ name: authorName, email, commitCount: 0 });
      }
      const author = authors[authorId];
      if (author) author.commitCount++;
      commits.push({
        hash: item.sha.slice(0, 12),
        parents: item.parents.map((p) => p.sha.slice(0, 12)),
        authorId,
        timestamp: Math.floor(new Date(item.commit.author?.date ?? 0).getTime() / 1000),
        subject: (item.commit.message.split("\n")[0] ?? "").slice(0, 80),
        // The list API has no churn stats; zeros are honest (tooltips omit them).
        stats: { filesChanged: 0, insertions: 0, deletions: 0 },
      });
    }
    if (items.length < PER_PAGE) break;
  }

  onProgress(`fetching ${name}'s file tree …`);
  let entries: TreeEntry[] = [];
  if (commits.length > 0) {
    const treeRes = await api(`/repos/${ref}/git/trees/${branch}?recursive=1`, token);
    if (treeRes.status !== 409) {
      const tree = (await treeRes.json()) as {
        tree: { path: string; type: string; size?: number }[];
      };
      entries = tree.tree
        .filter((e) => e.type === "blob")
        .map((e) => ({ path: e.path, bytes: e.size ?? 0 }));
    }
  }

  return {
    meta: {
      repoName: name,
      headRef: branch ?? "HEAD",
      generatedAt: Date.now(),
      totalCommits,
      truncated: commits.length < totalCommits,
    },
    authors,
    commits,
    tree: buildTree(entries),
  };
}

function readCache(ref: string): UniverseSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + ref);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UniverseSnapshot;
    if (Date.now() - parsed.generatedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(ref: string, universe: UniverseSnapshot): void {
  try {
    localStorage.setItem(CACHE_PREFIX + ref, JSON.stringify(universe));
  } catch {
    // quota exceeded or storage disabled — cache is best-effort
  }
}
