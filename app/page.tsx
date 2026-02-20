import Link from "next/link";

import {
  type DashboardPullRequest,
  fetchDashboardPullRequests,
} from "@/lib/github-prs";

export const dynamic = "force-dynamic";

type SortMode = "newest" | "oldest";
type ViewMode = "all" | "org";

type PageSearchParams = {
  sort?: string;
  view?: string;
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

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const sortMode = getSortMode(resolvedSearchParams.sort);
  const viewMode = getViewMode(resolvedSearchParams.view);

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
  const grouped = groupByOrganization(sortedPullRequests);
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
            Open pull requests across configured organizations.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">
              View
            </span>
            <LinkPill
              href={`/?view=all&sort=${sortMode}`}
              active={viewMode === "all"}
            >
              All PRs
            </LinkPill>
            <LinkPill
              href={`/?view=org&sort=${sortMode}`}
              active={viewMode === "org"}
            >
              Grouped by Org
            </LinkPill>
            <span className="ml-4 text-xs uppercase tracking-wide text-slate-500">
              Sort
            </span>
            <LinkPill
              href={`/?view=${viewMode}&sort=newest`}
              active={sortMode === "newest"}
            >
              Newest
            </LinkPill>
            <LinkPill
              href={`/?view=${viewMode}&sort=oldest`}
              active={sortMode === "oldest"}
            >
              Oldest
            </LinkPill>
          </div>
          {dashboardData && (
            <div className="mt-4 text-sm text-slate-600">
              <p>
                Loaded <strong>{sortedPullRequests.length}</strong> open PRs
                from config <code>{dashboardData.configPath}</code>.
              </p>
            </div>
          )}
        </header>

        {loadError && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <p className="font-semibold">Failed to load dashboard</p>
            <p className="mt-1">{loadError}</p>
            <p className="mt-3">
              Create <code>github-dashboard.yml</code> and set the referenced
              token env vars.
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

        {dashboardData && viewMode === "all" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">All Open Pull Requests</h2>
            <PullRequestTable pullRequests={sortedPullRequests} />
          </section>
        )}

        {dashboardData && viewMode === "org" && (
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
          </section>
        )}
      </div>
    </main>
  );
}
