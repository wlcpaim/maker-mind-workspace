// Minimal GitHub REST client used only on the server.
import { b64DecodeUtf8, b64EncodeUtf8 } from "./base64";
import { redactSecrets } from "./crypto.server";

const API = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function encPath(path: string) {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

export async function gh<T = unknown>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dev-studio",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      msg = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      /* keep text */
    }
    throw new GitHubError(res.status, redactSecrets(`GitHub ${res.status}: ${msg}`.slice(0, 500)));
  }
  const data = res.status === 204 ? (null as T) : ((await res.json()) as T);
  return { data, headers: res.headers };
}

type RawRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
  updated_at: string;
  pushed_at: string | null;
};

export type RepoDTO = {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
  updated_at: string;
};

const toRepo = (r: RawRepo): RepoDTO => ({
  full_name: r.full_name,
  name: r.name,
  owner: r.owner.login,
  private: r.private,
  default_branch: r.default_branch,
  html_url: r.html_url,
  description: r.description,
  updated_at: r.pushed_at ?? r.updated_at,
});

export async function getAuthenticatedUser(token: string) {
  const { data, headers } = await gh<{ login: string; name: string | null; avatar_url: string }>(token, "/user");
  return {
    login: data.login,
    name: data.name,
    avatar_url: data.avatar_url,
    scopes: headers.get("x-oauth-scopes") ?? "fine-grained",
  };
}

export async function listRepos(token: string, page = 1): Promise<RepoDTO[]> {
  const { data } = await gh<RawRepo[]>(
    token,
    `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
  );
  return data.map(toRepo);
}

export async function getRepo(token: string, full: string): Promise<RepoDTO> {
  const { data } = await gh<RawRepo>(token, `/repos/${full}`);
  return toRepo(data);
}

export async function createRepo(
  token: string,
  input: { name: string; description?: string; private: boolean },
): Promise<RepoDTO> {
  const { data } = await gh<RawRepo>(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({ ...input, auto_init: true }),
  });
  return toRepo(data);
}

export async function getBranchHead(token: string, full: string, branch: string): Promise<string> {
  const { data } = await gh<{ commit: { sha: string } }>(token, `/repos/${full}/branches/${encodeURIComponent(branch)}`);
  return data.commit.sha;
}

export type TreeItem = { path: string; type: "blob" | "tree"; size?: number; sha: string };

export async function getTree(token: string, full: string, sha: string) {
  const { data } = await gh<{ tree: TreeItem[]; truncated: boolean }>(
    token,
    `/repos/${full}/git/trees/${sha}?recursive=1`,
  );
  return { items: data.tree.map(({ path, type, size, sha }) => ({ path, type, size, sha })), truncated: data.truncated };
}

export async function getFile(token: string, full: string, path: string, ref?: string) {
  try {
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const { data } = await gh<{ type: string; content?: string; encoding?: string; sha: string; size: number }>(
      token,
      `/repos/${full}/contents/${encPath(path)}${q}`,
    );
    if (Array.isArray(data)) throw new GitHubError(400, `${path} é um diretório`);
    if (data.type !== "file") throw new GitHubError(400, `${path} não é um arquivo`);
    const content = data.encoding === "base64" && data.content ? b64DecodeUtf8(data.content) : "";
    return { path, sha: data.sha, size: data.size, content };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
}

export async function putFile(
  token: string,
  full: string,
  input: { path: string; content: string; message: string; branch: string; sha?: string },
) {
  const { data } = await gh<{ content: { sha: string; html_url: string }; commit: { sha: string; html_url: string } }>(
    token,
    `/repos/${full}/contents/${encPath(input.path)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: input.message,
        content: b64EncodeUtf8(input.content),
        branch: input.branch,
        ...(input.sha ? { sha: input.sha } : {}),
      }),
    },
  );
  return {
    blobSha: data.content.sha,
    fileUrl: data.content.html_url,
    commitSha: data.commit.sha,
    commitUrl: data.commit.html_url,
  };
}

export async function deleteFile(
  token: string,
  full: string,
  input: { path: string; message: string; branch: string; sha: string },
) {
  const { data } = await gh<{ commit: { sha: string; html_url: string } }>(
    token,
    `/repos/${full}/contents/${encPath(input.path)}`,
    { method: "DELETE", body: JSON.stringify(input) },
  );
  return { commitSha: data.commit.sha, commitUrl: data.commit.html_url };
}

export type CommitDTO = { sha: string; message: string; author: string; date: string; html_url: string };

export async function listCommits(token: string, full: string, branch: string, perPage = 20): Promise<CommitDTO[]> {
  const { data } = await gh<
    { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } } }[]
  >(token, `/repos/${full}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`);
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author.name,
    date: c.commit.author.date,
    html_url: c.html_url,
  }));
}

export async function getCommit(token: string, full: string, sha: string) {
  const { data } = await gh<{
    sha: string;
    html_url: string;
    commit: { message: string };
    files?: { filename: string; status: string; additions: number; deletions: number }[];
  }>(token, `/repos/${full}/commits/${sha}`);
  return {
    sha: data.sha,
    html_url: data.html_url,
    message: data.commit.message,
    files: (data.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
  };
}

export async function listBranches(token: string, full: string) {
  const { data } = await gh<{ name: string; commit: { sha: string }; protected: boolean }[]>(
    token,
    `/repos/${full}/branches?per_page=100`,
  );
  return data.map((b) => ({ name: b.name, sha: b.commit.sha, protected: b.protected }));
}

export async function createBranch(token: string, full: string, name: string, fromSha: string) {
  await gh(token, `/repos/${full}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${name}`, sha: fromSha }),
  });
  return { name, sha: fromSha };
}

export async function compare(token: string, full: string, base: string, head: string) {
  const { data } = await gh<{
    status: string;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    files?: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
  }>(token, `/repos/${full}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  return {
    status: data.status,
    ahead_by: data.ahead_by,
    behind_by: data.behind_by,
    total_commits: data.total_commits,
    files: (data.files ?? []).slice(0, 100).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ? f.patch.slice(0, 4000) : null,
    })),
  };
}

export type ChecksSummary = {
  state: "success" | "failure" | "pending" | "none";
  runs: { name: string; status: string; conclusion: string | null; url: string | null }[];
};

/** Real CI results (GitHub Actions check runs + commit statuses) for a commit. */
export async function getChecks(token: string, full: string, sha: string): Promise<ChecksSummary> {
  const [checks, status] = await Promise.all([
    gh<{ check_runs: { name: string; status: string; conclusion: string | null; html_url: string | null }[] }>(
      token,
      `/repos/${full}/commits/${sha}/check-runs?per_page=50`,
    ).catch(() => ({ data: { check_runs: [] } })),
    gh<{ statuses: { context: string; state: string; target_url: string | null }[] }>(
      token,
      `/repos/${full}/commits/${sha}/status`,
    ).catch(() => ({ data: { statuses: [] } })),
  ]);
  const runs = [
    ...checks.data.check_runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url })),
    ...status.data.statuses.map((s) => ({
      name: s.context,
      status: s.state === "pending" ? "in_progress" : "completed",
      conclusion: s.state === "pending" ? null : s.state,
      url: s.target_url,
    })),
  ];
  if (runs.length === 0) return { state: "none", runs };
  if (runs.some((r) => r.conclusion && ["failure", "error", "timed_out", "cancelled", "action_required"].includes(r.conclusion)))
    return { state: "failure", runs };
  if (runs.some((r) => r.status !== "completed")) return { state: "pending", runs };
  return { state: "success", runs };
}
