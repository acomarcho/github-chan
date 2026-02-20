# GitHub Open PR Dashboard

Simple Next.js dashboard that lists all open pull requests across multiple
GitHub organizations and multiple PATs.

## Features

- Multi-account support (multiple PAT tokens)
- Organization-level filtering through config
- Two tabs:
  - Pull Requests
  - Repositories
- PR views:
  - All PRs
  - Grouped by organization
- PR sort:
  - Newest
  - Oldest

## 1) Configure tokens

Copy env example:

```bash
cp .env.example .env.local
```

Set token values in `.env.local`:

```bash
GITHUB_TOKEN_A=ghp_xxx
GITHUB_TOKEN_B=ghp_yyy
```

## 2) Configure accounts/orgs

Copy example config:

```bash
cp github-dashboard.example.yml github-dashboard.yml
```

Edit `github-dashboard.yml`:

```yaml
accounts:
  - name: Personal
    tokenEnv: GITHUB_TOKEN_A
    organizations:
      - organizationA
      - organizationB

  - name: Work
    tokenEnv: GITHUB_TOKEN_B
    organizations:
      - organizationC
```

Notes:

- `tokenEnv` must match an env var name from `.env.local`.
- Add/remove accounts by editing this YAML only.

Optional custom config path:

```bash
GITHUB_DASHBOARD_CONFIG=./my-config.yml
```

## 3) Run

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Token permissions

Your PAT needs read access to repositories and pull requests for the target orgs.
If org SSO is enabled, authorize the token for that org.
