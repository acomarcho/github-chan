import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

const DEFAULT_CONFIG_PATH = "github-dashboard.yml";

type RawAccountConfig = {
  name?: string;
  tokenEnv?: string;
  organizations?: string[];
};

type RawDashboardConfig = {
  accounts?: RawAccountConfig[];
};

export type DashboardAccount = {
  name: string;
  organizations: string[];
  tokenEnv: string;
  token: string;
};

export type DashboardConfigLoadResult = {
  configPath: string;
  accounts: DashboardAccount[];
  warnings: string[];
};

function toAbsoluteConfigPath(relativeOrAbsolutePath: string): string {
  if (path.isAbsolute(relativeOrAbsolutePath)) {
    return relativeOrAbsolutePath;
  }
  return path.join(process.cwd(), relativeOrAbsolutePath);
}

function normalizeOrganizations(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

export async function loadDashboardConfig(): Promise<DashboardConfigLoadResult> {
  const requestedPath =
    process.env.GITHUB_DASHBOARD_CONFIG ?? DEFAULT_CONFIG_PATH;
  const configPath = toAbsoluteConfigPath(requestedPath);
  let fileContent: string;
  try {
    fileContent = await readFile(configPath, "utf8");
  } catch {
    throw new Error(
      `Could not read config file "${requestedPath}". Create it from github-dashboard.example.yml or set GITHUB_DASHBOARD_CONFIG.`,
    );
  }

  let parsed: RawDashboardConfig;
  try {
    parsed = parse(fileContent) as RawDashboardConfig;
  } catch {
    throw new Error(
      `Config file "${requestedPath}" is not valid YAML. Please fix the syntax.`,
    );
  }

  if (!Array.isArray(parsed?.accounts) || parsed.accounts.length === 0) {
    throw new Error(
      `Invalid config at ${requestedPath}: expected "accounts" with at least one account entry.`,
    );
  }

  const warnings: string[] = [];
  const accounts: DashboardAccount[] = [];

  parsed.accounts.forEach((account, index) => {
    const tokenEnv = account.tokenEnv?.trim();
    const organizations = normalizeOrganizations(account.organizations);

    if (!tokenEnv) {
      warnings.push(
        `Skipped account #${index + 1}: missing "tokenEnv" in config.`,
      );
      return;
    }

    if (organizations.length === 0) {
      warnings.push(
        `Skipped account "${tokenEnv}": no organizations configured.`,
      );
      return;
    }

    const token = process.env[tokenEnv]?.trim();
    if (!token) {
      warnings.push(
        `Skipped account "${tokenEnv}": environment variable ${tokenEnv} is empty or missing.`,
      );
      return;
    }

    accounts.push({
      name: account.name?.trim() || tokenEnv,
      organizations,
      tokenEnv,
      token,
    });
  });

  if (accounts.length === 0) {
    throw new Error(
      `No valid accounts found in ${requestedPath}. Check token env vars and organizations.`,
    );
  }

  return { configPath: requestedPath, accounts, warnings };
}
