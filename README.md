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
