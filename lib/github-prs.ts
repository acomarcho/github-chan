import { loadDashboardConfig } from "@/lib/dashboard-config";

const GITHUB_API_BASE = "https://api.github.com";
const PAGE_SIZE = 100;
const REPO_FETCH_CONCURRENCY = 8;

type OrgRepo = {
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  archived: boolean;
  has_issues: boolean;
  open_issues_count: number;
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

async function listOrgRepos(org: string, token: string): Promise<OrgRepo[]> {
  const repositories: OrgRepo[] = [];

  for (let page = 1; ; page += 1) {
    const batch = await fetchGitHub<OrgRepo[]>(
      `/orgs/${org}/repos?type=all&per_page=${PAGE_SIZE}&page=${page}`,
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

export type PullRequestDashboardData = {
  configPath: string;
  warnings: string[];
  pullRequests: DashboardPullRequest[];
};

export async function fetchDashboardPullRequests(): Promise<PullRequestDashboardData> {
  const { accounts, warnings, configPath } = await loadDashboardConfig();
  const pullRequests: DashboardPullRequest[] = [];

  for (const account of accounts) {
    for (const organization of account.organizations) {
      const repositories = await listOrgRepos(organization, account.token);

      const candidateRepos = repositories.filter(
        (repo) =>
          !repo.archived && repo.has_issues && repo.open_issues_count > 0,
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

          return repoPullRequests.map((pullRequest) => ({
            id: `${repo.full_name}#${pullRequest.number}`,
            organization,
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

      repoPullRequestBatches.forEach((batch) => pullRequests.push(...batch));
    }
  }

  return { configPath, warnings, pullRequests };
}
