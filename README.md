# Product Rating System - Evernode smart contract

A HotPocket (Evernode) smart contract converted from the RateIt Web2 app (Express + better-sqlite3 + JWT).
It keeps the product catalogue, Bayesian "top rated" ranking, one review per user per product, helpful
votes and admin moderation. The state is a replicated SQLite database that every node in the cluster
updates through consensus.

## What changed from the Web2 app

| Web2 | Evernode |
| --- | --- |
| Express routes under `/api` | JSON contract inputs `{ Service, Action, Data, promiseId }` routed by `src/controller.js` |
| `POST /api/auth/register` (name, email, password) | `User/Register { name }` - the HotPocket Ed25519 key is the identity |
| `POST /api/auth/login`, JWT, scrypt passwords | Removed: every HotPocket connection is already signed by the user's key |
| `GET /api/auth/me` | `User/GetMe` |
| Admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` | Admin from `ADMIN_PUBKEY` (falls back to `MAINTAINER_PUBKEY`); `User/SetUserRole` manages more admins |
| `datetime('now')` | Consensus time (`ctx.timestamp`) |
| HTTP status codes | `{ error: { code, message, details? } }` with the same codes (400/401/403/404/409) |
| Rate limiting, security headers, static frontend | Not applicable to a contract (HotPocket handles connections) |

Email addresses are no longer stored: the state is replicated to every node, and the public key
already identifies the user.

## Services and actions

Send writes with `submitContractInput` and reads with `submitContractReadRequest`
(write actions sent as read requests are rejected with `ReadOnlyRequest`).

| Service | Action | Data | Who |
| --- | --- | --- | --- |
| Health | HealthCheck | `{}` | anyone |
| User | Register | `{ name }` | any key (once) |
| User | GetMe | `{}` | registered |
| User | UpdateProfile | `{ name }` | registered |
| User | GetUsers | `{ role?, page?, limit? }` | admin |
| User | SetUserRole | `{ publicKey, role: "user" \| "admin" }` | admin |
| Product | ListProducts | `{ q?, category?, minRating?, sort?, page?, limit? }` | anyone |
| Product | GetCategories | `{}` | anyone |
| Product | GetProduct | `{ id }` | anyone |
| Product | CreateProduct | `{ name, category, price, description?, imageUrl? }` | admin |
| Product | UpdateProduct | `{ id, ...partial fields }` | admin |
| Product | DeleteProduct | `{ id }` | admin |
| Review | ListReviews | `{ productId, sort?, rating?, page?, limit? }` | anyone |
| Review | GetReview | `{ id }` | anyone |
| Review | CreateReview | `{ productId, rating (1-5), title?, body? }` | registered |
| Review | UpdateReview | `{ id, rating?, title?, body? }` | author |
| Review | DeleteReview | `{ id }` | author or admin |
| Review | VoteHelpful / UnvoteHelpful | `{ id }` | registered, not the author |
| Upgrade | UpgradeContract | `{ zipBase64, zipSignatureHex, version, description? }` | maintainer |
| Cluster | GetContractVersion, GetClusterUnl, UpdateClusterConfig, UpdateClusterDetails | see service | node operators |

Product sorts: `rating` (Bayesian score, default), `reviews`, `newest`, `price_asc`, `price_desc`, `name`.
Review sorts: `newest` (default), `helpful`, `highest`, `lowest`. Page size defaults to 12 products /
10 reviews and is capped at 50.

## Configuration

`.env`:

- `MAINTAINER_PUBKEY` - **replace** with your maintainer key (upgrades are signed with it).
- `ADMIN_PUBKEY` - first admin; empty means `MAINTAINER_PUBKEY`.
- `SEED_DEMO_DATA` - seed the 12 demo products and demo reviews on first start (`true`/`false`).
- `DB_PATH` - SQLite file (default `ratings.db`).

## Build and run

```
npm install
npm run build      # Docker build (Windows) -> dist/
npm start          # build and deploy locally with hpdevkit
npm test           # integration tests against wss://localhost:8081 (see src/Test/ReadMe.md)
```

Upgrades: zip the new `dist/` and run
`node upgrade-client/index.js wss://host:port new.zip <maintainerPrivateKey> <version> "<description>"`.
