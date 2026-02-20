import { loadDashboardConfig } from "@/lib/dashboard-config";

const GITHUB_API_BASE = "https://api.github.com";
const PAGE_SIZE = 100;
const REPO_FETCH_CONCURRENCY = 8;

type OrgRepo = {
  name: string;
  full_name: string;
  html_url: string;
  owner: {
    login: string;
  };
  private: boolean;
  visibility: string;
  archived: boolean;
  has_issues: boolean;
  open_issues_count: number;
  updated_at: string;
  default_branch: string;
};

type RepoPullRequest = {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  created_at: string;
  user: {
    login: string;
  } | null;
};

export type DashboardPullRequest = {
  id: string;
  organization: string;
  repository: string;
  repositoryFullName: string;
  number: number;
  title: string;
  url: string;
  author: string;
  draft: boolean;
  createdAt: string;
  account: string;
};

export type DashboardRepository = {
  id: string;
  organization: string;
  name: string;
  fullName: string;
  url: string;
  private: boolean;
  visibility: string;
  archived: boolean;
  openIssuesCount: number;
  openPullRequestCount: number;
  updatedAt: string;
  defaultBranch: string;
  accounts: string[];
};

type GitHubResponseError = {
  message?: string;
};

async function fetchGitHub<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | GitHubResponseError
      | null;
    const message = errorBody?.message ?? "Unknown GitHub API error";
    throw new Error(`GitHub API ${response.status} for "${path}": ${message}`);
  }

  return (await response.json()) as T;
}

async function listAccessibleRepos(token: string): Promise<OrgRepo[]> {
  const repositories: OrgRepo[] = [];

  for (let page = 1; ; page += 1) {
    const batch = await fetchGitHub<OrgRepo[]>(
      `/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=${PAGE_SIZE}&page=${page}`,
      token,
    );

    repositories.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return repositories;
}

async function listRepoOpenPullRequests(
  owner: string,
  repo: string,
  token: string,
): Promise<RepoPullRequest[]> {
  const pullRequests: RepoPullRequest[] = [];

  for (let page = 1; ; page += 1) {
    const batch = await fetchGitHub<RepoPullRequest[]>(
      `/repos/${owner}/${repo}/pulls?state=open&sort=created&direction=desc&per_page=${PAGE_SIZE}&page=${page}`,
      token,
    );

    pullRequests.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return pullRequests;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  };

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}

type MutableDashboardRepository = Omit<DashboardRepository, "accounts"> & {
  accounts: Set<string>;
};

export type PullRequestDashboardData = {
  configPath: string;
  warnings: string[];
  pullRequests: DashboardPullRequest[];
  repositories: DashboardRepository[];
};

export async function fetchDashboardPullRequests(): Promise<PullRequestDashboardData> {
  const { accounts, warnings, configPath } = await loadDashboardConfig();
  const pullRequestById = new Map<string, DashboardPullRequest>();
  const repositoryById = new Map<string, MutableDashboardRepository>();

  for (const account of accounts) {
    const allowedOrgs = new Set(
      account.organizations.map((organization) => organization.toLowerCase()),
    );
    const repositories = (await listAccessibleRepos(account.token)).filter(
      (repo) => allowedOrgs.has(repo.owner.login.toLowerCase()),
    );

    repositories.forEach((repo) => {
      const existing = repositoryById.get(repo.full_name);
      if (existing) {
        existing.accounts.add(account.name);
        return;
      }

      repositoryById.set(repo.full_name, {
        id: repo.full_name,
        organization: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        private: repo.private,
        visibility: repo.visibility,
        archived: repo.archived,
        openIssuesCount: repo.open_issues_count,
        openPullRequestCount: 0,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch,
        accounts: new Set([account.name]),
      });
    });

    const candidateRepos = repositories.filter(
      (repo) => !repo.archived && repo.has_issues && repo.open_issues_count > 0,
    );

    const repoPullRequestBatches = await mapWithConcurrency(
      candidateRepos,
      REPO_FETCH_CONCURRENCY,
      async (repo) => {
        const repoPullRequests = await listRepoOpenPullRequests(
          repo.owner.login,
          repo.name,
          account.token,
        );

        const repository = repositoryById.get(repo.full_name);
        if (repository) {
          repository.openPullRequestCount = Math.max(
            repository.openPullRequestCount,
            repoPullRequests.length,
          );
        }

        return repoPullRequests.map((pullRequest) => ({
          id: `${repo.full_name}#${pullRequest.number}`,
          organization: repo.owner.login,
          repository: repo.name,
          repositoryFullName: repo.full_name,
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.html_url,
          author: pullRequest.user?.login ?? "unknown",
          draft: pullRequest.draft,
          createdAt: pullRequest.created_at,
          account: account.name,
        }));
      },
    );

    repoPullRequestBatches.forEach((batch) => {
      batch.forEach((pullRequest) => {
        if (!pullRequestById.has(pullRequest.id)) {
          pullRequestById.set(pullRequest.id, pullRequest);
        }
      });
    });
  }

  const pullRequests = Array.from(pullRequestById.values());
  const allRepositories = Array.from(repositoryById.values()).map((repo) => ({
    ...repo,
    accounts: Array.from(repo.accounts).toSorted((a, b) => a.localeCompare(b)),
  }));

  return {
    configPath,
    warnings,
    pullRequests,
    repositories: allRepositories,
  };
}
