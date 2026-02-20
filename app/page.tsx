import DashboardClient from "@/app/dashboard-client";
import { fetchDashboardPullRequests } from "@/lib/github-prs";

export const dynamic = "force-dynamic";

export default async function Home() {
  let dashboardData:
    | Awaited<ReturnType<typeof fetchDashboardPullRequests>>
    | undefined;
  let loadError: string | undefined;

  try {
    dashboardData = await fetchDashboardPullRequests();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  return <DashboardClient dashboardData={dashboardData} loadError={loadError} />;
}
