# Orbit

Orbit is a household-first coordination app for Daily Tasks, Monthlies, Notes, and shared Spaces.

## Development

```bash
npm install
npm run dev
```

Set the application variables in `.env`. The required variables are documented in `.env.example`.

## Database tests

The test suite uses a dedicated Neon branch and is destructive: each run drops and recreates the `public` schema, then applies all migrations. Never point it at production or at the database used by the running app.

### Create a Neon test branch

1. In the [Neon console](https://console.neon.tech), open the Orbit project.
2. Create a child branch from your primary/dev branch (name it something like `orbit-test`). Throwaway branches can use a short TTL.
3. Copy that branch's connection string into `DATABASE_URL_TEST`. Do not reuse the primary connection string or the same host as `DATABASE_URL`.

Configure these variables in `.env.test` or `.env`:

```dotenv
DATABASE_URL_TEST=postgresql://...dedicated-test-branch...
DATABASE_URL_TEST_CONFIRMATION=dedicated-neon-branch
```

`DATABASE_URL_TEST_CONFIRMATION` is an intentional safety acknowledgement. The test setup refuses to run without the exact value above, refuses a URL equal to `DATABASE_URL`, and refuses a test URL using the same database host as `DATABASE_URL`.

Run the suite with:

```bash
npm test
npm run test:db
```

CI must provide the `DATABASE_URL_TEST` secret for a dedicated Neon branch. The confirmation marker is configured in the workflow and is not a substitute for isolating the branch.

## E2E tests

Playwright specs live in `e2e/` and drive the real app (`npm run dev`). They create throwaway users and Spaces on a **second** dedicated Neon branch, not the Vitest branch.

### Create a Neon e2e branch

1. In the [Neon console](https://console.neon.tech), open the Orbit project.
2. Create another child branch from your primary/dev branch (name it something like `orbit-e2e`). Do not reuse the Vitest `orbit-test` branch.
3. Copy that branch's connection string into `DATABASE_URL_E2E`. Do not reuse `DATABASE_URL` or the same host as `DATABASE_URL`.

Configure these variables in `.env.test` or `.env`:

```dotenv
DATABASE_URL_E2E=postgresql://...dedicated-e2e-branch...
DATABASE_URL_E2E_CONFIRMATION=dedicated-neon-branch
```

`DATABASE_URL_E2E_CONFIRMATION` is the same class of safety acknowledgement as the Vitest marker. Playwright refuses to run without the exact value above, refuses a URL equal to `DATABASE_URL`, and refuses an e2e URL using the same database host as `DATABASE_URL`. It does not fall back to `DATABASE_URL_TEST`.

Apply migrations to the e2e branch before the first Playwright run (and after schema changes) by setting `DRIZZLE_DATABASE_URL` to the same connection string as `DATABASE_URL_E2E` and running `npm run db:migrate`. CI does this automatically.

`npm run test:e2e` bootstraps `DATABASE_URL` from that e2e branch and starts a fresh dev server pointed at it.

```bash
npm run test:e2e
```

CI must provide the `DATABASE_URL_E2E` secret for that dedicated Neon branch. The confirmation marker is configured in the workflow.
