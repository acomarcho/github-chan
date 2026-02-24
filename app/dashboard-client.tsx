"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  type DashboardPullRequest,
  type DashboardRepository,
  type PullRequestDashboardData,
} from "@/lib/github-prs";

type SortMode = "newest" | "oldest";
type ViewMode = "all" | "org";
type TabMode = "pulls" | "repos";

const ITEMS_PER_PAGE = 10;

type DashboardClientProps = {
  dashboardData?: PullRequestDashboardData;
  loadError?: string;
};

type PaginationResult<T> = {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startItem: number;
  endItem: number;
};

function sortPullRequests(
  pullRequests: DashboardPullRequest[],
  sortMode: SortMode,
): DashboardPullRequest[] {
  return [...pullRequests].toSorted((a, b) => {
    const left = Date.parse(a.createdAt);
    const right = Date.parse(b.createdAt);
    return sortMode === "oldest" ? left - right : right - left;
  });
}

function sortRepositories(
  repositories: DashboardRepository[],
): DashboardRepository[] {
  return [...repositories].toSorted((a, b) => {
    const left = Date.parse(a.updatedAt);
    const right = Date.parse(b.updatedAt);

    if (left !== right) {
      return right - left;
    }

    return a.fullName.localeCompare(b.fullName);
  });
}

function groupPullRequestsByOrganization(
  pullRequests: DashboardPullRequest[],
): Record<string, DashboardPullRequest[]> {
  return pullRequests.reduce<Record<string, DashboardPullRequest[]>>(
    (groups, pullRequest) => {
      if (!groups[pullRequest.organization]) {
        groups[pullRequest.organization] = [];
      }
      groups[pullRequest.organization].push(pullRequest);
      return groups;
    },
    {},
  );
}

function groupRepositoriesByOrganization(
  repositories: DashboardRepository[],
): Record<string, DashboardRepository[]> {
  return repositories.reduce<Record<string, DashboardRepository[]>>(
    (groups, repository) => {
      if (!groups[repository.organization]) {
        groups[repository.organization] = [];
      }
      groups[repository.organization].push(repository);
      return groups;
    },
    {},
  );
}

function paginate<T>(
  items: T[],
  requestedPage: number,
  pageSize: number,
): PaginationResult<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndexExclusive = Math.min(startIndex + pageSize, totalItems);

  return {
    items: items.slice(startIndex, endIndexExclusive),
    currentPage,
    totalPages,
    totalItems,
    startItem: totalItems === 0 ? 0 : startIndex + 1,
    endItem: endIndexExclusive,
  };
}

function relativeAge(isoDate: string): string {
  const createdAtMs = Date.parse(isoDate);
  const diffMs = Date.now() - createdAtMs;
  const hours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d`;
  }

  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

function parseTabMode(value: string | null): TabMode | null {
  return value === "pulls" || value === "repos" ? value : null;
}

function parseViewMode(value: string | null): ViewMode | null {
  return value === "all" || value === "org" ? value : null;
}

function parseSortMode(value: string | null): SortMode | null {
  return value === "newest" || value === "oldest" ? value : null;
}

function ButtonPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

function PullRequestTable({
  pullRequests,
}: {
  pullRequests: DashboardPullRequest[];
}) {
  if (pullRequests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
        No open pull requests in this scope.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">PR</th>
            <th className="px-4 py-3">Repository</th>
            <th className="px-4 py-3">Author</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Age</th>
            <th className="px-4 py-3">Account</th>
          </tr>
        </thead>
        <tbody>
          {pullRequests.map((pullRequest) => (
            <tr key={pullRequest.id} className="border-t border-slate-100">
              <td className="px-4 py-3 align-top">
                <a
                  href={pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-slate-900 hover:underline"
                >
                  #{pullRequest.number} {pullRequest.title}
                </a>
                {pullRequest.draft && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    draft
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {pullRequest.repositoryFullName}
              </td>
              <td className="px-4 py-3 text-slate-700">{pullRequest.author}</td>
              <td className="px-4 py-3 text-slate-700">
                {formatDate(pullRequest.createdAt)}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {relativeAge(pullRequest.createdAt)}
              </td>
              <td className="px-4 py-3 text-slate-700">{pullRequest.account}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RepositoryTable({
  repositories,
}: {
  repositories: DashboardRepository[];
}) {
  if (repositories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
        No repositories found for configured accounts.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Repository</th>
            <th className="px-4 py-3">Organization</th>
            <th className="px-4 py-3">Visibility</th>
            <th className="px-4 py-3">Archived</th>
            <th className="px-4 py-3">Open PRs</th>
            <th className="px-4 py-3">Open Issues</th>
            <th className="px-4 py-3">Updated</th>
            <th className="px-4 py-3">Accounts</th>
          </tr>
        </thead>
        <tbody>
          {repositories.map((repository) => (
            <tr key={repository.id} className="border-t border-slate-100">
              <td className="px-4 py-3">
                <a
                  href={repository.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-slate-900 hover:underline"
                >
                  {repository.fullName}
                </a>
              </td>
              <td className="px-4 py-3 text-slate-700">{repository.organization}</td>
              <td className="px-4 py-3 text-slate-700">{repository.visibility}</td>
              <td className="px-4 py-3 text-slate-700">
                {repository.archived ? "yes" : "no"}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {repository.openPullRequestCount}
              </td>
              <td className="px-4 py-3 text-slate-700">{repository.openIssuesCount}</td>
              <td className="px-4 py-3 text-slate-700">
                {formatDate(repository.updatedAt)}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {repository.accounts.join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {currentPage > 1 ? (
        <ButtonPill active={false} onClick={() => onChange(previousPage)}>
          Previous
        </ButtonPill>
      ) : (
        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">
          Previous
        </span>
      )}

      <span className="px-2 text-sm text-slate-600">
        Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <ButtonPill active={false} onClick={() => onChange(nextPage)}>
          Next
        </ButtonPill>
      ) : (
        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">
          Next
        </span>
      )}
    </div>
  );
}

export default function DashboardClient({
  dashboardData,
  loadError,
}: DashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tabMode, setTabMode] = useState<TabMode>(
    () => parseTabMode(searchParams.get("tab")) ?? "repos",
  );
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => parseViewMode(searchParams.get("view")) ?? "org",
  );
  const [sortMode, setSortMode] = useState<SortMode>(
    () => parseSortMode(searchParams.get("sort")) ?? "newest",
  );
  const [allPullPage, setAllPullPage] = useState(1);
  const [pullOrgPages, setPullOrgPages] = useState<Record<string, number>>({});
  const [repoOrgPages, setRepoOrgPages] = useState<Record<string, number>>({});
  const [isPending, startTransition] = useTransition();
  const lastSyncedSearchRef = useRef<string | null>(null);

  const sortedPullRequests = useMemo(
    () => (dashboardData ? sortPullRequests(dashboardData.pullRequests, sortMode) : []),
    [dashboardData, sortMode],
  );
  const sortedRepositories = useMemo(
    () => (dashboardData ? sortRepositories(dashboardData.repositories) : []),
    [dashboardData],
  );
  const groupedPullEntries = useMemo(
    () =>
      Object.entries(groupPullRequestsByOrganization(sortedPullRequests)).toSorted(
        (a, b) => a[0].localeCompare(b[0]),
      ),
    [sortedPullRequests],
  );
  const groupedRepositoryEntries = useMemo(
    () =>
      Object.entries(groupRepositoriesByOrganization(sortedRepositories)).toSorted(
        (a, b) => a[0].localeCompare(b[0]),
      ),
    [sortedRepositories],
  );

  const allPullPagination = paginate(sortedPullRequests, allPullPage, ITEMS_PER_PAGE);

  const withTransition = (fn: () => void) => startTransition(fn);
  const refreshData = () => withTransition(() => router.refresh());

  useEffect(() => {
    const currentSearch = searchParams.toString();
    const params = new URLSearchParams(searchParams);
    params.set("tab", tabMode);
    params.set("view", viewMode);
    params.set("sort", sortMode);
    const nextSearch = params.toString();

    if (
      nextSearch !== currentSearch &&
      lastSyncedSearchRef.current !== nextSearch
    ) {
      lastSyncedSearchRef.current = nextSearch;
      router.replace(`${pathname}?${nextSearch}`, { scroll: false });
    }
  }, [pathname, router, searchParams, sortMode, tabMode, viewMode]);

  const switchTab = (nextTab: TabMode) =>
    withTransition(() => {
      setTabMode(nextTab);
    });

  const switchView = (nextView: ViewMode) =>
    withTransition(() => {
      setViewMode(nextView);
      setAllPullPage(1);
    });

  const switchSort = (nextSort: SortMode) =>
    withTransition(() => {
      setSortMode(nextSort);
      setAllPullPage(1);
      setPullOrgPages({});
    });

  if (loadError) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <p className="font-semibold">Failed to load dashboard</p>
            <p className="mt-1">{loadError}</p>
            <p className="mt-3">
              Check your PAT or OAuth token permissions, organization policies,
              and <code>github-dashboard.yml</code> config.
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (!dashboardData) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            No dashboard data available.
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                GitHub Open PR Dashboard
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Open pull requests and repositories across configured
                organizations.
              </p>
            </div>
            {isPending && (
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                Updating view...
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Tab</span>
            <ButtonPill active={tabMode === "repos"} onClick={() => switchTab("repos")}>
              Repositories
            </ButtonPill>
            <ButtonPill active={tabMode === "pulls"} onClick={() => switchTab("pulls")}>
              Pull Requests
            </ButtonPill>
            <ButtonPill active={false} onClick={refreshData}>
              Refresh
            </ButtonPill>

            {tabMode === "pulls" && (
              <>
                <span className="ml-4 text-xs uppercase tracking-wide text-slate-500">
                  View
                </span>
                <ButtonPill active={viewMode === "org"} onClick={() => switchView("org")}>
                  Grouped by Org
                </ButtonPill>
                <ButtonPill active={viewMode === "all"} onClick={() => switchView("all")}>
                  All PRs
                </ButtonPill>

                <span className="ml-4 text-xs uppercase tracking-wide text-slate-500">
                  Sort
                </span>
                <ButtonPill
                  active={sortMode === "newest"}
                  onClick={() => switchSort("newest")}
                >
                  Newest
                </ButtonPill>
                <ButtonPill
                  active={sortMode === "oldest"}
                  onClick={() => switchSort("oldest")}
                >
                  Oldest
                </ButtonPill>
              </>
            )}
          </div>

          <div className="mt-4 text-sm text-slate-600">
            <p>
              Loaded <strong>{sortedRepositories.length}</strong> repositories and{" "}
              <strong>{sortedPullRequests.length}</strong> open PRs from config{" "}
              <code>{dashboardData.configPath}</code>.
            </p>
            <p className="mt-1">Pagination is fully client-side (10 per page).</p>
          </div>
        </header>

        {dashboardData.warnings.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Config warnings</p>
            <ul className="mt-2 list-disc pl-5">
              {dashboardData.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

        {tabMode === "pulls" && viewMode === "all" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">All Open Pull Requests</h2>
            <p className="text-sm text-slate-600">
              Showing {allPullPagination.startItem}-{allPullPagination.endItem} of{" "}
              {allPullPagination.totalItems}.
            </p>
            <PullRequestTable pullRequests={allPullPagination.items} />
            <PaginationControls
              currentPage={allPullPagination.currentPage}
              totalPages={allPullPagination.totalPages}
              onChange={(page) => withTransition(() => setAllPullPage(page))}
            />
          </section>
        )}

        {tabMode === "pulls" && viewMode === "org" && (
          <section className="flex flex-col gap-6">
            {groupedPullEntries.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
                No open pull requests.
              </div>
            )}

            {groupedPullEntries.map(([organization, pullRequests]) => {
              const requestedPage = pullOrgPages[organization] ?? 1;
              const pagination = paginate(pullRequests, requestedPage, ITEMS_PER_PAGE);

              return (
                <article
                  key={organization}
                  className="flex flex-col gap-3 rounded-2xl"
                >
                  <h2 className="text-lg font-semibold">
                    {organization}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      ({pagination.totalItems})
                    </span>
                  </h2>
                  <p className="text-sm text-slate-600">
                    Showing {pagination.startItem}-{pagination.endItem} of{" "}
                    {pagination.totalItems}.
                  </p>
                  <PullRequestTable pullRequests={pagination.items} />
                  <PaginationControls
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onChange={(page) =>
                      withTransition(() =>
                        setPullOrgPages((current) => ({
                          ...current,
                          [organization]: page,
                        })),
                      )
                    }
                  />
                </article>
              );
            })}
          </section>
        )}

        {tabMode === "repos" && (
          <section className="flex flex-col gap-6">
            <h2 className="text-lg font-semibold">Repositories by Organization</h2>
            {groupedRepositoryEntries.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
                No repositories found for configured accounts.
              </div>
            )}

            {groupedRepositoryEntries.map(([organization, repositories]) => {
              const requestedPage = repoOrgPages[organization] ?? 1;
              const pagination = paginate(repositories, requestedPage, ITEMS_PER_PAGE);

              return (
                <article
                  key={organization}
                  className="flex flex-col gap-3 rounded-2xl"
                >
                  <h3 className="text-lg font-semibold">
                    {organization}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      ({pagination.totalItems})
                    </span>
                  </h3>
                  <p className="text-sm text-slate-600">
                    Showing {pagination.startItem}-{pagination.endItem} of{" "}
                    {pagination.totalItems}.
                  </p>
                  <RepositoryTable repositories={pagination.items} />
                  <PaginationControls
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onChange={(page) =>
                      withTransition(() =>
                        setRepoOrgPages((current) => ({
                          ...current,
                          [organization]: page,
                        })),
                      )
                    }
                  />
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
