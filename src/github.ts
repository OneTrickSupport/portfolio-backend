import type { FastifyInstance } from "fastify";

const username = process.env.GITHUB_USERNAME ?? "OneTrickSupport";
const token = process.env.GITHUB_TOKEN;
const CACHE_TTL_MS = 10 * 60_000;
// How many commits to pull into the cache. The search API caps per_page at 100.
const SEARCH_SIZE = 50;
// Public events don't include PR titles, so we look them up — but bound how many
// extra calls that costs.
const MAX_PR_ENRICH = 10;

export type ActivityItem = {
  id: string;
  kind: "commit" | "pull_request" | "release" | "repo";
  title: string;
  ref?: string; // short sha, "#701", or a release tag — shown as a mono accent
  repo: string;
  repoName: string;
  repoUrl: string;
  url: string;
  date: string;
};

// Shape of an item from GET /search/commits.
type CommitSearchItem = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null };
  repository: { name: string; full_name: string };
};

type CommitSearchResult = { items: CommitSearchItem[] };

// Public events return a redacted payload — only the fields below are reliable.
type GithubEvent = {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: {
    action?: string;
    ref_type?: string;
    pull_request?: { number: number };
    release?: { tag_name: string; name: string | null; html_url: string };
  };
};

const gh = (path: string) =>
  fetch(`https://api.github.com${path}`, {
    headers: {
      "User-Agent": "portfolio-backend",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
    return res.json();
  });

let cache: { items: ActivityItem[]; expires: number } | null = null;
let inflight: Promise<ActivityItem[]> | null = null;

async function fetchCommits(): Promise<ActivityItem[]> {
  // Search across all of GitHub for commits authored by the user — this catches
  // contributions to repos the user doesn't own, not just their own repos.
  // Note: only default-branch commits are indexed by the search API.
  const q = encodeURIComponent(`author:${username}`);
  const result = (await gh(
    `/search/commits?q=${q}&sort=author-date&order=desc&per_page=${SEARCH_SIZE}`,
  )) as CommitSearchResult;

  return result.items.map(
    (c): ActivityItem => ({
      id: `commit-${c.sha}`,
      kind: "commit",
      title: c.commit.message.split("\n")[0] ?? c.commit.message,
      ref: c.sha.slice(0, 7),
      repo: c.repository.full_name,
      repoName: c.repository.name,
      repoUrl: `https://github.com/${c.repository.full_name}`,
      url: c.html_url,
      date: c.commit.author?.date ?? "",
    }),
  );
}

async function fetchEvents(): Promise<ActivityItem[]> {
  // The activity feed adds the "verbs" commits can't express: opened PRs (incl.
  // to repos you don't own), published releases, new repos. Pushes are omitted
  // on purpose — their commits already come from the search above.
  const events = (await gh(
    `/users/${username}/events/public?per_page=100`,
  )) as GithubEvent[];

  const items: ActivityItem[] = [];
  for (const e of events) {
    const repo = e.repo.name;
    const repoName = repo.split("/")[1] ?? repo;
    const repoUrl = `https://github.com/${repo}`;

    if (
      e.type === "PullRequestEvent" &&
      e.payload.action === "opened" &&
      e.payload.pull_request
    ) {
      const num = e.payload.pull_request.number;
      items.push({
        id: `pr-${e.id}`,
        kind: "pull_request",
        title: `Pull request #${num}`, // enriched with the real title below
        ref: `#${num}`,
        repo,
        repoName,
        repoUrl,
        url: `${repoUrl}/pull/${num}`,
        date: e.created_at,
      });
    } else if (
      e.type === "ReleaseEvent" &&
      e.payload.action === "published" &&
      e.payload.release
    ) {
      const rel = e.payload.release;
      items.push({
        id: `release-${e.id}`,
        kind: "release",
        title: rel.name || `Released ${rel.tag_name}`,
        ref: rel.tag_name,
        repo,
        repoName,
        repoUrl,
        url: rel.html_url,
        date: e.created_at,
      });
    } else if (e.type === "CreateEvent" && e.payload.ref_type === "repository") {
      items.push({
        id: `repo-${e.id}`,
        kind: "repo",
        title: "Created a new repository",
        repo,
        repoName,
        repoUrl,
        url: repoUrl,
        date: e.created_at,
      });
    }
  }

  // Public events omit PR titles/links, so fetch them for the few we kept.
  await Promise.all(
    items
      .filter((i) => i.kind === "pull_request")
      .slice(0, MAX_PR_ENRICH)
      .map(async (item) => {
        try {
          const num = item.ref!.replace("#", "");
          const pr = (await gh(`/repos/${item.repo}/pulls/${num}`)) as {
            title: string;
            html_url: string;
          };
          item.title = pr.title;
          item.url = pr.html_url;
        } catch {
          // Keep the "#<num>" fallback title if the lookup fails.
        }
      }),
  );

  return items;
}

async function fetchActivity(): Promise<ActivityItem[]> {
  // Fetch both sources independently so one failing (e.g. a rate-limited events
  // feed) still lets the other populate the timeline.
  const [commits, events] = await Promise.allSettled([
    fetchCommits(),
    fetchEvents(),
  ]);

  if (commits.status === "rejected" && events.status === "rejected") {
    throw commits.reason;
  }

  const merged = [
    ...(commits.status === "fulfilled" ? commits.value : []),
    ...(events.status === "fulfilled" ? events.value : []),
  ];

  // De-dupe by id, then order newest-first.
  const byId = new Map(merged.map((i) => [i.id, i]));
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
}

async function getActivity(): Promise<ActivityItem[]> {
  if (cache && cache.expires > Date.now()) return cache.items;
  if (inflight) return inflight;

  inflight = fetchActivity()
    .then((items) => {
      cache = { items, expires: Date.now() + CACHE_TTL_MS };
      return items;
    })
    .finally(() => {
      inflight = null;
    });

  try {
    return await inflight;
  } catch (err) {
    // Serve stale data if we have any rather than failing the request.
    if (cache) return cache.items;
    throw err;
  }
}

export async function registerGithub(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string } }>(
    "/github/activity",
    async (req, reply) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      try {
        const items = await getActivity();
        return { user: username, items: items.slice(0, limit) };
      } catch (err) {
        req.log.error({ err }, "failed to fetch GitHub activity");
        return reply
          .code(502)
          .send({ error: "Failed to fetch GitHub activity" });
      }
    },
  );
}
