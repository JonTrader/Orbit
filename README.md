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

Playwright specs live in `e2e/` and drive the real app (`npm run dev`). They create throwaway users and Spaces, so they should use the same dedicated Neon branch as the Vitest suite.

Configure `DATABASE_URL_TEST` and `DATABASE_URL_TEST_CONFIRMATION` in `.env.test` or `.env` (see above). `npm run test:e2e` bootstraps `DATABASE_URL` from that test branch automatically and starts a fresh dev server when the test branch differs from your dev `DATABASE_URL`. Stop any existing `npm run dev` on the dev branch before running E2E if you rely on `reuseExistingServer` without `DATABASE_URL_TEST` set.

```bash
npm run test:e2e
```
