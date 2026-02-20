import Link from "next/link";

import {
  type DashboardPullRequest,
  type DashboardRepository,
  fetchDashboardPullRequests,
} from "@/lib/github-prs";

export const dynamic = "force-dynamic";

type SortMode = "newest" | "oldest";
type ViewMode = "all" | "org";
type TabMode = "pulls" | "repos";
const ITEMS_PER_PAGE = 10;

type PageSearchParams = {
  sort?: string;
  view?: string;
  tab?: string;
  page?: string;
};

type HomePageProps = {
  searchParams?: Promise<PageSearchParams>;
};

function getSortMode(value: string | undefined): SortMode {
  return value === "oldest" ? "oldest" : "newest";
}

function getViewMode(value: string | undefined): ViewMode {
  return value === "org" ? "org" : "all";
}

function getTabMode(value: string | undefined): TabMode {
  return value === "pulls" ? "pulls" : "repos";
}

function getPageNumber(value: string | undefined): number {
  if (!value) {
    return 1;
  }

  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return page;
}

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

function groupByOrganization(
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

type PaginationResult<T> = {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startItem: number;
  endItem: number;
};

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
  const paginatedItems = items.slice(startIndex, endIndexExclusive);

  return {
    items: paginatedItems,
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

function LinkPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
      }`}
    >
      {children}
    </Link>
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
  getPageHref,
}: {
  currentPage: number;
  totalPages: number;
  getPageHref: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {currentPage > 1 ? (
        <LinkPill href={getPageHref(previousPage)} active={false}>
          Previous
        </LinkPill>
      ) : (
        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">
          Previous
        </span>
      )}

      <span className="px-2 text-sm text-slate-600">
        Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <LinkPill href={getPageHref(nextPage)} active={false}>
          Next
        </LinkPill>
      ) : (
        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">
          Next
        </span>
      )}
    </div>
  );
}

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const sortMode = getSortMode(resolvedSearchParams.sort);
  const viewMode = getViewMode(resolvedSearchParams.view);
  const tabMode = getTabMode(resolvedSearchParams.tab);
  const requestedPage = getPageNumber(resolvedSearchParams.page);

  let dashboardData:
    | Awaited<ReturnType<typeof fetchDashboardPullRequests>>
    | undefined;
  let loadError: string | undefined;

  try {
    dashboardData = await fetchDashboardPullRequests();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  const sortedPullRequests = dashboardData
    ? sortPullRequests(dashboardData.pullRequests, sortMode)
    : [];
  const sortedRepositories = dashboardData
    ? sortRepositories(dashboardData.repositories)
    : [];
  const pullPagination = paginate(
    sortedPullRequests,
    requestedPage,
    ITEMS_PER_PAGE,
  );
  const repositoryPagination = paginate(
    sortedRepositories,
    requestedPage,
    ITEMS_PER_PAGE,
  );
  const activePagination =
    tabMode === "repos" ? repositoryPagination : pullPagination;

  const buildHref = ({
    tab,
    page,
    view,
    sort,
  }: {
    tab: TabMode;
    page: number;
    view: ViewMode;
    sort: SortMode;
  }) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (tab === "pulls") {
      params.set("view", view);
      params.set("sort", sort);
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    return `/?${params.toString()}`;
  };
  const activePageHref = (page: number) =>
    buildHref({
      tab: tabMode,
      view: viewMode,
      sort: sortMode,
      page,
    });

  const grouped = groupByOrganization(pullPagination.items);
  const groupedEntries = Object.entries(grouped).toSorted((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">
            GitHub Open PR Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Open pull requests and repositories across configured organizations.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">
              Tab
            </span>
            <LinkPill
              href={buildHref({
                tab: "repos",
                view: viewMode,
                sort: sortMode,
                page: 1,
              })}
              active={tabMode === "repos"}
            >
              Repositories
            </LinkPill>
            <LinkPill
              href={buildHref({
                tab: "pulls",
                view: viewMode,
                sort: sortMode,
                page: 1,
              })}
              active={tabMode === "pulls"}
            >
              Pull Requests
            </LinkPill>

            {tabMode === "pulls" && (
              <>
                <span className="ml-4 text-xs uppercase tracking-wide text-slate-500">
                  View
                </span>
                <LinkPill
                  href={buildHref({
                    tab: "pulls",
                    view: "all",
                    sort: sortMode,
                    page: 1,
                  })}
                  active={viewMode === "all"}
                >
                  All PRs
                </LinkPill>
                <LinkPill
                  href={buildHref({
                    tab: "pulls",
                    view: "org",
                    sort: sortMode,
                    page: 1,
                  })}
                  active={viewMode === "org"}
                >
                  Grouped by Org
                </LinkPill>

                <span className="ml-4 text-xs uppercase tracking-wide text-slate-500">
                  Sort
                </span>
                <LinkPill
                  href={buildHref({
                    tab: "pulls",
                    view: viewMode,
                    sort: "newest",
                    page: 1,
                  })}
                  active={sortMode === "newest"}
                >
                  Newest
                </LinkPill>
                <LinkPill
                  href={buildHref({
                    tab: "pulls",
                    view: viewMode,
                    sort: "oldest",
                    page: 1,
                  })}
                  active={sortMode === "oldest"}
                >
                  Oldest
                </LinkPill>
              </>
            )}
          </div>

          {dashboardData && (
            <div className="mt-4 text-sm text-slate-600">
              <p>
                Loaded <strong>{sortedRepositories.length}</strong> repositories
                and <strong> {sortedPullRequests.length}</strong> open PRs from
                config <code>{dashboardData.configPath}</code>.
              </p>
              <p className="mt-1">
                Showing {activePagination.startItem}-{activePagination.endItem}{" "}
                of {activePagination.totalItems} (10 per page).
              </p>
            </div>
          )}
        </header>

        {loadError && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <p className="font-semibold">Failed to load dashboard</p>
            <p className="mt-1">{loadError}</p>
            <p className="mt-3">
              Check your PAT permissions, organization policies, and
              <code> github-dashboard.yml</code> config.
            </p>
          </section>
        )}

        {dashboardData && dashboardData.warnings.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Config warnings</p>
            <ul className="mt-2 list-disc pl-5">
              {dashboardData.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

        {dashboardData && tabMode === "pulls" && viewMode === "all" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">All Open Pull Requests</h2>
            <PullRequestTable pullRequests={pullPagination.items} />
            <PaginationControls
              currentPage={pullPagination.currentPage}
              totalPages={pullPagination.totalPages}
              getPageHref={activePageHref}
            />
          </section>
        )}

        {dashboardData && tabMode === "pulls" && viewMode === "org" && (
          <section className="flex flex-col gap-6">
            {groupedEntries.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
                No open pull requests.
              </div>
            )}

            {groupedEntries.map(([organization, pullRequests]) => (
              <article
                key={organization}
                className="flex flex-col gap-3 rounded-2xl"
              >
                <h2 className="text-lg font-semibold">
                  {organization}{" "}
                  <span className="text-sm font-normal text-slate-500">
                    ({pullRequests.length})
                  </span>
                </h2>
                <PullRequestTable pullRequests={pullRequests} />
              </article>
            ))}
            <PaginationControls
              currentPage={pullPagination.currentPage}
              totalPages={pullPagination.totalPages}
              getPageHref={activePageHref}
            />
          </section>
        )}

        {dashboardData && tabMode === "repos" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">All Repositories</h2>
            <RepositoryTable repositories={repositoryPagination.items} />
            <PaginationControls
              currentPage={repositoryPagination.currentPage}
              totalPages={repositoryPagination.totalPages}
              getPageHref={activePageHref}
            />
          </section>
        )}
      </div>
    </main>
  );
}
