# Quickstart Validation: Evolução da Biblioteca de Mensagens

## Prerequisites

- Node.js 24.x and npm 10.x.
- Docker Desktop running.
- Supabase CLI installed by `npm ci` from the lockfile.
- Chromium installed for Playwright.
- No command in this guide targets the production project.

## 1. Install deterministic tooling

```powershell
npm ci
npx playwright install chromium
```

Expected: dependencies match `package-lock.json`; Chromium installation exits with code 0.

## 2. Recreate the local backend

```powershell
npx supabase start
npx supabase db reset
```

Expected: the local stack starts, every migration applies in order and `supabase/seed.sql` completes.
`db reset` is destructive only to the local stack. Never add `--linked` to this validation command.

Confirm the local URL and publishable key are the same values documented in `config.local.js`.

## 3. Run logic and database tests

```powershell
npm run test:unit
npm run test:db
```

Expected:

- all search, permission, archive filtering, request-state and clipboard fallback unit tests pass;
- all pgTAP files pass;
- the permission matrix denies anonymous access and collaborator writes;
- archive/restore preserves identifiers and associations;
- two approvals of the same request apply one change;
- duplicate idempotency keys produce one request;
- activity records cannot be mutated by a client.

## 4. Start the static frontend

```powershell
npm run serve
```

Expected: `http://127.0.0.1:4173` serves the login shell and uses the local backend configuration.
Keep this process running in a separate terminal for browser checks.

## 5. Run browser and accessibility journeys

```powershell
npm run test:e2e
npm run test:a11y
```

Expected:

- collaborator lands in Library, sees only linked active accesses and cannot open Administration;
- search finds title/content/tag matches and copy confirmation appears within 1 second;
- collaborator creation/edit/archive becomes pending and does not publish;
- superadministrator approves once, rejects with reason and manages accounts/accesses;
- archived messages disappear, restore with the same ID and recover favorite/recent associations;
- category archive is blocked while active messages remain;
- keyboard journeys contain focus in modals and restore focus on close;
- the 360 px project has no horizontal page overflow;
- axe reports no critical or serious WCAG 2.2 A/AA violations in exercised states.

## 6. Validate performance budgets

Seed the 100-account, 10-access and 1,000-message fixture, then run:

```powershell
npm run seed:scale
npm run test:perf
```

Expected across five authenticated Playwright performance runs, with Lighthouse validating the
public shell and transfer budgets:

- the configured 75th-percentile library usability measurement is at most 2,000 ms under the mobile
  3G profile;
- no regression exceeds the JavaScript and total-transfer budgets in `lighthouserc.cjs`;
- search p95 is at most 500 ms in the Playwright performance scenario;
- clipboard confirmation p95 is at most 1,000 ms.

## 7. Collect moderated usability evidence

Run the primary find-and-copy journey with 20 representative collaborators who did not implement
the feature. Record only aggregate completion, elapsed time and the post-task ease rating.

Expected:

- at least 19 of 20 participants find and copy the requested message within 30 seconds (SC-001);
- at least 18 of 20 rate the main task as easy or very easy (SC-010);
- no temporary password, customer content or participant-identifying data appears in the record.

## 8. Validate security and indexing headers

```powershell
node --test tests/security-headers.test.mjs
```

Expected locally: the versioned Vercel configuration and the HTML robots directive pass. The simple
`npm run serve` server does not interpret `vercel.json`. On the Vercel preview, run:

```powershell
$response = Invoke-WebRequest -Uri $previewUrl -Method Head
$response.Headers['X-Robots-Tag']
$response.Headers['X-Content-Type-Options']
$response.Headers['Content-Security-Policy']
```

Expected: `X-Robots-Tag` contains `noindex, nofollow, noarchive`, content type is protected with
`nosniff`, and CSP restricts scripts/connections to the configured application origins.

Also confirm `index.html` contains a robots meta directive and no authenticated content.

## 9. Preview release gate

Before production:

```powershell
npx supabase migration list --local
npx supabase db push --local --dry-run
npm run test:all
```

Expected locally: the migration history is aligned, the dry-run reports no unexpected pending
migrations and the complete suite exits with zero failures. Remote comparison is a separate,
explicitly authorized release action recorded in the release checklist.

On the Vercel preview, repeat the collaborator and superadministrator smoke paths and inspect response
headers. Do not use production credentials or production customer content in automated tests.

## 10. Production rollout and rollback evidence

The release record must contain:

1. confirmed database backup timestamp;
2. reviewed migration dry-run output;
3. previous frontend deployment identifier;
4. migration application result;
5. production smoke results for login, search, copy, request and approval;
6. rollback decision owner and observation window.

If a critical check fails, restore the previous frontend immediately and apply the reviewed
compensating migration or database recovery procedure. Never improvise destructive SQL in production.

## 11. Stop local services

```powershell
npx supabase stop
```

Expected: local containers stop without changing production.
