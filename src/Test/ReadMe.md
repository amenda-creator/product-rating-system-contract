# Product rating system tests

Integration tests that talk to a running HotPocket instance of the contract.

## Run

1. Build and deploy the contract locally (`npm start` from the project root, which uses `hpdevkit`).
2. From the project root run `npm test`, or from this folder:

```
npm install
node run-tests.js
```

The tests connect to `wss://localhost:8081` by default. Override with `CONTRACT_URL`,
e.g. `CONTRACT_URL=wss://localhost:8082 node run-tests.js`.

Product create/update/delete and review moderation need an admin key. Set `TEST_ADMIN_PRIVATE_KEY`
to the Ed25519 private key hex whose public key is `ADMIN_PUBKEY` (or `MAINTAINER_PUBKEY` when
`ADMIN_PUBKEY` is empty) in `.env`. Without it, the admin-only tests are skipped and the review tests
use the first seeded demo product.

## Structure

- `run-tests.js` - creates two reviewer clients (A, B), the optional admin client and runs every suite.
- `test-utils.js` - `TestClient`, `TestSuite` and assertions (`assertEqual`, `assertTrue`, `assertSuccessResponse`, `assertErrorResponse`).
- `TestCases/HealthTest.js` - Health/HealthCheck response shape.
- `TestCases/UserTest.js` - profile registration (replaces email/password sign-up), GetMe, UpdateProfile, admin checks.
- `TestCases/ProductTest.js` - product lifecycle (create, read, update, delete), validation, search, categories, sorting.
- `TestCases/ReviewTest.js` - review lifecycle, 1-5 rating validation, one review per user per product, helpful votes, permissions.
- `TestCases/ClusterManagementTest.js` - contract version, UNL lookup and rejection of unauthorised upgrades.

Tests run against live state, so re-running them creates additional products and reviews.
