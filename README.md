# Mtazamo Votes — Election-Day Agent & Tally Management Platform

> A command centre for Kenyan political campaigns to recruit field agents, capture polling-station results on election day, reconcile them up the IEBC form chain (34A → 34B → 34C → 34D and the governor/senator/MP/MCA equivalents), and watch the count roll in live from a real-time war room.

Mtazamo lets a candidate (an **aspirant**) spin up a workspace scoped to the exact seat they are contesting — President, Governor, Senator, MP or MCA. The seat drives everything: which geographic tiers exist, which agent roles can be recruited, which IEBC forms get filled, and how results aggregate. Their **campaign manager** runs operations and recruits a chain of agents down to a polling agent at every stream.

---

## Table of Contents

- [Why it exists](#why-it-exists)
- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Core domain model](#core-domain-model)
  - [Seats, scopes & the tier chain](#seats-scopes--the-tier-chain)
  - [IEBC form numbers](#iebc-form-numbers)
  - [Roles & portals](#roles--portals)
  - [Permissions (invite / assign)](#permissions-invite--assign)
  - [Election runs](#election-runs)
  - [The result → tally pipeline](#the-result--tally-pipeline)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
  - [Quick start with Docker](#quick-start-with-docker)
  - [Loading the geography data](#loading-the-geography-data)
  - [Running without Docker](#running-without-docker)
  - [Exposing a public tunnel (ngrok)](#exposing-a-public-tunnel-ngrok)
- [API surface](#api-surface)
- [Frontend routes](#frontend-routes)
- [Deployment](#deployment)
- [Conventions](#conventions)
- [Further reading](#further-reading)

---

## Why it exists

In a Kenyan general election, results flow up a fixed chain of IEBC statutory forms. A polling agent at a single station records **Form 34A** (for the presidential race) or its sibling for the seat being contested. Those are tallied into the constituency **34B**, the county **34C**, and finally the national **34D**. A campaign that wants an independent, real-time parallel tally needs a person at every rung, each one capturing and verifying the form at their level.

Mtazamo is that parallel tally system. It handles the whole lifecycle:

1. **Recruit** agents for every tier — via public per-ward application links or targeted SMS invites.
2. **Review & assign** applicants to specific polling stations.
3. **Capture** Form `_A` results at the station, OTP-locked and photo-backed.
4. **Reconcile & verify** them up the chain, flagging discrepancies against each officer's own observed figures.
5. **Visualise** the count live in a war room with a candidate leaderboard, coverage bar, and geographic drill-down — all isolated per **election run** so a rehearsal never contaminates the live count.

---

## Key features

- **Seat-aware everything** — create a workspace for President/Governor/Senator/MP/MCA and the app automatically shows only the geographic tiers, agent roles, and IEBC forms that exist for that seat. An MP workspace never mentions a county agent.
- **Full recruitment pipeline** — one regeneratable public application link per ward (`/apply/{token}`) plus targeted SMS invites for tier officers (`/join/agent/{token}`). Applicants land in a pending queue for review.
- **Delegated permissions** — the CM can grant *invite* and *assign* rights down the chain; grants from a higher authority can't be revoked by an intermediate tier.
- **Accounts for everyone** — every role, down to polling agent and volunteer, gets an account. Officers get a scoped portal; polling agents get a simplified form-upload view.
- **Form 34A / 35A / 36A / 37A / 38A capture** — a faithful on-screen replica of the physical form: candidate vote table with live totals, registered-voter arithmetic checks, rejected/disputed ballot fields, form-photo upload, and a 6-digit OTP lock before submission.
- **Ward reconciliation** — ward admins verify, query, or amend-with-note each station submission; verification feeds the aggregate upward in real time.
- **Tier form entry (34B/34C/34D)** — constituency, county, and national officers enter their own observed figures and the system highlights any discrepancy against the sum of the forms below them.
- **Real-time war room** — candidate leaderboard, coverage progress bar, geo drill-down tree, and a station grid colour-coded by status, all filtered by the selected election run.
- **Election runs** — isolate the live count from rehearsals; only one run is `open`/`tallying` at a time.
- **Audit trail** — security-sensitive actions are logged and viewable per workspace.
- **SMS-OTP auth** — bearer tokens (SHA-256 hashed at rest), bcrypt-hashed OTPs with TTL and lockout, session management, and email verification.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Laravel 13 (PHP 8.3), custom bearer-token auth |
| Database | PostgreSQL 16 + PostGIS 3.4 (geography stored as geometries) |
| Frontend | Vite + React 18 (TypeScript), React Router 6 |
| Maps / drill-down | `d3-geo` for county/constituency GeoJSON rendering |
| Dev orchestration | Docker Compose (db + backend + frontend) |
| Prod delivery | GitHub Actions → GHCR images → SSH deploy to a VM, nginx-served frontend |
| Dev tunnel | ngrok → Vite proxy at `/api` (single origin) |

---

## Architecture

```
                         ┌──────────────────────────────────────┐
   Browser / phone  ───▶ │  Frontend (Vite + React, TS)          │
                         │  • aspirant & workspace portal        │
                         │  • scoped tier-officer portals        │
                         │  • polling-agent form upload          │
                         │  • war room                           │
                         └───────────────┬──────────────────────┘
                                         │  /api  (Vite proxy in dev,
                                         │         nginx in prod)
                         ┌───────────────▼──────────────────────┐
                         │  Backend (Laravel 13, PHP 8.3)        │
                         │  • bearer-token auth middleware       │
                         │  • per-subsection controllers         │
                         │  • seat-aware role/form logic         │
                         │  • on-demand tally aggregation        │
                         │  • audit service                      │
                         └───────────────┬──────────────────────┘
                                         │  PDO / pgsql
                         ┌───────────────▼──────────────────────┐
                         │  PostgreSQL 16 + PostGIS              │
                         │  • 47 counties / 290 const. / 1450    │
                         │    wards / polling stations (geo)     │
                         │  • workspaces, agents, results,       │
                         │    runs, tallies, audit               │
                         └───────────────────────────────────────┘
```

The frontend always talks to the backend through a relative `/api` path. In development Vite proxies `/api` to the backend container; in production nginx does the same. This keeps everything single-origin so an ngrok tunnel or a bare VM IP works without CORS gymnastics.

Tally aggregation is computed **on demand** in `WarRoomController` by summing the JSONB `candidates` column of verified/submitted `station_results` joined against the geography tables, scoped by run and geo node — rather than from a pre-materialised table. Officer-entered form figures (34B/34C/34D) are stored separately in `tier_form_submissions` and compared against that live sum to surface discrepancies.

---

## Core domain model

### Seats, scopes & the tier chain

A workspace is created for one seat. The seat fixes the geographic anchor and the chain of agent tiers (defined in `backend/app/Support/SeatRoles.php`):

| Seat | Scope | Tier chain (CM at top) |
|---|---|---|
| President | `national` | national → county → constituency → ward → agent |
| Governor | `county` | county → constituency → ward → agent |
| Senator | `county` | county → constituency → ward → agent |
| MP | `constituency` | constituency → ward → agent |
| MCA | `ward` | constituency → ward → agent |

Volunteers sit outside the chain on every seat and never get verification rights.

### IEBC form numbers

Form letters follow IEBC naming — `34x` President, `35x` MP, `36x` MCA, `37x` Governor, `38x` Senator:

| Seat | Polling agent | Ward admin | Constituency | County | National |
|---|---|---|---|---|---|
| President | 34A | verifies all 34As | 34B | 34C | 34D |
| Governor | 37A | verifies all 37As | 37B | 37C | — |
| Senator | 38A | verifies all 38As | 38B | 38C | — |
| MP | 35A | verifies all 35As | 35B | — | — |
| MCA | 36A | verifies all 36As | 36B recon. | — | — |

### Roles & portals

| Role | Sees |
|---|---|
| Campaign manager | Everything in the workspace |
| County agent | Agents/wards/constituencies in their county |
| Constituency agent | Agents and wards in their constituency |
| Ward admin | All agents in their ward (+ verifies station results) |
| Polling agent | Their station only (simplified form upload) |
| Volunteer | Their ward (mobilisation; no verification) |

A single user can hold multiple roles — one `workspace_agents` row per role.

### Permissions (invite / assign)

Two delegated permissions, stored in `workspace_agent_permissions`:

- **invite** — may this role send targeted invites to the tier below it?
- **assign** — may this role approve applicants and assign them to stations?

Defaults give the CM and aspirant both permissions across all tiers. A tier officer may grant either permission to the tier immediately below. The cascade rule: a grant from a higher authority **cannot be revoked by an intermediate tier** — only the CM or aspirant can revoke it. Settings only show the tiers that exist in the seat's chain.

### Election runs

Every result, tally, and verification belongs to an **election run** (`election_runs`): a first-class record (`live` or `rehearsal`) that isolates what is being counted. Only one run can be `open`/`tallying` at a time. A run selector in the workspace header drives the `run_id` carried in `WorkspaceContext`, and every result/tally query is filtered by it — so a rehearsal never pollutes the live count.

### The result → tally pipeline

```
 polling agent        ward admin            const. agent     county agent    national
 ───────────          ──────────            ────────────     ────────────    ────────
 Form _A              verify / query /      Form _B          Form _C         Form _D
 (station_results)    amend each _A         (tier_form_      (tier_form_     (president
  • candidate JSONB    • status: verified    submissions)      submissions)    only)
  • reg. voters        • feeds aggregate    enters observed   observed vs     rolls up
  • rejected/disputed   upward in real time  figures; system  sum of _Bs      34Cs
  • photo + OTP lock                         flags gaps vs
                                             sum of _As
                              │
                              ▼
                   War room reads the live aggregate (summed JSONB,
                   scoped by run + geo node) → leaderboard, coverage,
                   geo drill-down, colour-coded station grid.
```

`station_results.status` moves through `draft → submitted → queried → verified`. Verifying a result recomputes the aggregate that every tier portal and the war room read.

---

## Project structure

```
mtazamo-vms/
├── backend/                     Laravel 13 API (PHP 8.3)
│   ├── app/
│   │   ├── Http/Controllers/    One controller per subsection (Auth, Workspace,
│   │   │                        Recruitment, AgentApply, WarRoom, TierForm, …)
│   │   ├── Http/Middleware/      AuthenticateToken (bearer-token guard)
│   │   ├── Models/               Eloquent models (Workspace, WorkspaceAgent, …)
│   │   ├── Services/             AuditService
│   │   ├── Support/              SeatRoles — seat→roles/forms/blurbs logic
│   │   └── Console/Commands/     ImportPollingStations (geo:import-stations)
│   ├── database/migrations/      Schema (users, workspaces, agents, runs, results…)
│   ├── routes/api.php            All API routes
│   ├── Dockerfile / .prod        Dev (artisan serve) and prod images
│   └── composer.json
│
├── frontend/                    Vite + React (TypeScript)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── account/          Aspirant & CM workspace pages
│   │   │   ├── apply/            Public apply + targeted-invite accept
│   │   │   ├── join/             CM invite accept flow
│   │   │   ├── station/          Polling-agent Form _A capture
│   │   │   └── warroom/          War room
│   │   ├── components/portal/    Shell, layout, toasts, notifications, UI kit
│   │   ├── contexts/             WorkspaceContext (carries run_id)
│   │   ├── api.ts, auth.tsx      API client + auth provider
│   │   └── App.tsx               Route table
│   ├── vite.config.ts            /api proxy + ngrok host allowlist
│   ├── nginx.conf                Prod static serving + /api + /storage proxy
│   └── Dockerfile / .prod
│
├── exports/geo/                 Per-table PostGIS dumps (loaded by scripts/)  [gitignored]
├── data/                        geo_dump.sql (full dump) + ROV spreadsheet + imports/
├── scripts/load-geo.sh          Loads geo dumps into the db container
│
├── docs/                        Design & reference material (not code)
│   ├── SPECIFICATION.md          Full project specification (source of truth)
│   ├── mockups/                  HTML design mockups per screen
│   │   ├── tier-officer/         Tier-officer portal mockups
│   │   └── war-room/             War room design iterations
│   └── reference/                FRD PDF + original portal export
│
├── docker-compose.yml           Local dev (builds images, bind-mounts source)
├── docker-compose.vm.yml        VM deploy (pulls GHCR images)
├── docker-compose.prod.yml      Prod reference compose
├── .github/workflows/deploy.yml CI: build → push to GHCR → SSH deploy
└── README.md
```

---

## Getting started

### Prerequisites

- Docker + Docker Compose, **or** PHP 8.3 + Composer + Node 22 + PostgreSQL 16/PostGIS.
- The geography dumps (`exports/geo/*.sql`) — these are large and distributed separately (see below).

### Quick start with Docker

```bash
# 1. Configure environment
cp .env.example .env            # defaults are fine for local dev

# 2. Start Postgres, backend and frontend
docker compose up -d --build

# 3. Create the Laravel app key and run migrations
docker compose exec backend php artisan key:generate
docker compose exec backend php artisan migrate

# 4. Load geography + import polling stations (see next section)
./scripts/load-geo.sh
docker compose exec backend php artisan geo:import-stations
```

Services come up on:

| Service | URL |
|---|---|
| Frontend (Vite) | http://localhost:5173 |
| Backend (Laravel) | http://localhost:4000 |
| PostgreSQL | localhost:5433 |

> With `APP_DEBUG=true`, OTPs and invite tokens are echoed back in API responses as `dev_otp` / `dev_token` so you can complete flows without a real SMS gateway.

### Loading the geography data

Kenya's electoral geography (47 counties → 290 constituencies → 1,450 wards → polling stations) lives in PostGIS. Load order matters because of foreign keys:

```bash
# Loads counties → constituencies → wards → polling_centres → polling_stations
# and installs the ward/county consistency trigger function.
./scripts/load-geo.sh

# Projects polling stations into the app's working tables.
docker compose exec backend php artisan geo:import-stations
```

The per-table dumps live in `exports/geo/` (gitignored); a full combined dump is at `data/geo_dump.sql`.

### Running without Docker

```bash
# Backend
cd backend
composer install
cp .env.example .env            # point DB_* at your local Postgres (port 5433)
php artisan key:generate
php artisan migrate
php artisan serve --host=0.0.0.0 --port=4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

`composer setup` runs the install → key:generate → migrate → build chain in one step.

### Exposing a public tunnel (ngrok)

The frontend proxies `/api` to the backend, so you only tunnel the Vite port and everything stays single-origin:

```bash
ngrok http 5173
```

`vite.config.ts` already allows `*.ngrok-free.app` / `*.ngrok.app` / `*.ngrok.io` hosts. Leave `VITE_API_URL` empty so the client uses the relative `/api` path.

---

## API surface

All authenticated routes require an `Authorization: Bearer <token>` header and run behind the `auth.token` middleware. Public flows (invite accept, agent apply, geography reads) are unauthenticated.

**Auth & sessions**
```
POST   /api/auth/register | login | verify-otp | resend-otp | refresh
POST   /api/auth/email/verify
GET    /api/auth/me                         POST /api/auth/logout
POST   /api/auth/email/send | email/change
GET    /api/auth/sessions                   DELETE /api/auth/sessions/{tokenId}
POST   /api/auth/sessions/revoke-all        GET  /api/auth/activity
```

**Workspaces, managers, candidates, settings**
```
GET/POST  /api/workspaces                   GET /api/workspaces/{id}
GET       /api/workspaces/{id}/stats | /geography
GET/POST  /api/workspaces/{id}/managers     POST .../{mid}/resend   DELETE .../{mid}
GET/PUT   /api/workspaces/{id}/candidates    POST .../candidates/publish
GET/PUT   /api/workspaces/{id}/settings/delegation
GET       /api/workspaces/{id}/audit
```

**Recruitment, invites & agent review**
```
GET       /api/workspaces/{id}/recruitment | /stats
GET/PATCH /api/workspaces/{id}/recruitment/wards/{wardId}
POST      /api/workspaces/{id}/recruitment/wards/{wardId}/regenerate
GET/POST  /api/workspaces/{id}/recruitment/invites
GET       /api/workspaces/{id}/agents/pending | /assigned
POST      /api/workspaces/{id}/agents/bulk-approve
POST      /api/workspaces/{id}/agents/{agentId}/approve | reject | deploy | reassign
```

**Election runs, results, tiers & war room**
```
GET/POST  /api/workspaces/{id}/runs         PATCH .../runs/{runId}
GET       /api/workspaces/{id}/station/context
POST      /api/workspaces/{id}/station/result-otp | /station/results
GET       /api/workspaces/{id}/warroom/summary
POST      .../runs/{runId}/results/{resultId}/verify | query | amend
GET       .../runs/{runId}/tier-form        POST .../tier-form/save | submit
POST      /api/workspaces/{id}/tier-form/upload-image
```

**Public (no auth)**
```
GET/POST  /api/join/{token}...              CM invite accept
GET/POST  /api/join/agent/{token}...        Targeted agent invite accept
GET/POST  /api/apply/{token}...             Public per-ward application
GET       /api/geography/counties | /counties/geojson | /counties/{id}/tree | /{id}/geojson
GET       /api/geography/constituencies/{id}/wards | /{id}/geojson
GET/POST  /api/geography/wards/{id}/stations        GET .../stations.csv
```

See `backend/routes/api.php` for the authoritative list.

---

## Frontend routes

```
# Public
/create-account  /login  /verify  /verify-email
/join/:token  /join/:token/verify  /join/:token/setup      # CM invite accept
/join/agent/:token                                          # targeted agent invite
/apply/:token                                               # public ward application

# Aspirant portal
/account  /account/settings  /account/verify-email
/workspaces  /workspaces/:id

# Workspace (nested under /workspaces/:id)
  (index) overview   candidates   managers   recruitment
  geography   settings   agents   agents/pending   warroom   audit

# Polling agent
/workspaces/:id/station/results                             # Form _A capture
```

Route guards: `RequireAuth` gates any signed-in user; `RequireAspirant` restricts aspirant-only pages and bounces officers/agents to their scoped destination (polling agents land straight on their station results page).

---

## Deployment

CI/CD lives in `.github/workflows/deploy.yml`:

1. **Detect changes** — `dorny/paths-filter` checks whether `backend/**` or `frontend/**` changed.
2. **Build & push** — only the changed service is rebuilt (`Dockerfile.prod`) and pushed to GHCR (`ghcr.io/aberison-investments/mtazamo-{backend,frontend}:latest`).
3. **Deploy** — SSH into the VM, `git reset --hard origin/main`, `docker compose -f docker-compose.vm.yml pull`, `up -d`, and prune old images.

On the VM, `docker-compose.vm.yml` runs Postgres + the two pulled images. The frontend container serves the built SPA via nginx and proxies `/api` to the backend and `/storage/` for uploaded form photos (persisted in an `uploads` volume). Copy `.env.prod.example` to `.env` on the VM and fill in `APP_KEY`, a strong `POSTGRES_PASSWORD`, and the public `APP_URL` / `APP_FRONTEND_URL`.

---

## Conventions

- Phone numbers stored normalised as `+2547xxxxxxxx`.
- UUID primary keys for workspaces, geography, agents, runs, results.
- Bearer tokens hashed with SHA-256 in the DB; the plaintext is returned exactly once.
- OTPs bcrypt-hashed, 10-minute TTL, 5-attempt lockout.
- Tokens are uppercase 6-char (short) or 40-char random (long) strings.
- Form numbers follow IEBC naming: 34x President · 35x MP · 36x MCA · 37x Governor · 38x Senator.
- `APP_DEBUG=true` echoes `dev_otp` / `dev_token` in responses for local flows.
- Build proceeds **one subsection at a time**, in the order laid out in `docs/SPECIFICATION.md` §10 / §19.

---

## Further reading

- **`docs/SPECIFICATION.md`** — the full, authoritative project specification: data tables, build order, UI layouts for every form screen, and the war-room design. Start here for deep detail.
- **`docs/reference/`** — the original Functional Requirements Document (PDF) and portal export.
- **`docs/mockups/`** — per-screen HTML design mockups, including the tier-officer portal and the war-room design iterations.

---

*Mtazamo Votes — built for transparent, real-time, parallel vote tallying in Kenyan elections.*
