# Mtazamo Votes — Project Specification

Mtazamo is an election-day agent management platform for Kenyan political campaigns. An **aspirant** (the candidate) owns a workspace scoped to their race. They invite a **campaign manager** (CM) who runs operations. The CM recruits and manages **agents** at every tier of the result-form chain.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Laravel (PHP), PostgreSQL + PostGIS |
| Frontend | Vite + React (TypeScript), React Router |
| Auth | Bearer token (custom `api_tokens` table) |
| Dev tunnel | ngrok → Vite proxy at `/api` |
| DB port | 5433 (host) |

---

## 2. Workspace Scopes

A workspace is created by an aspirant for a specific seat. The `scope` field drives geography cascades.

| Seat | `scope` | Geographic anchor |
|---|---|---|
| President | `national` | All 47 counties |
| Governor | `county` | `county_id` |
| Senator | `county` | `county_id` |
| MP | `constituency` | `constituency_id` |
| MCA | `ward` | `ward_id` |

---

## 3. Roles, Tiers and Form Numbers

Each seat has a fixed tier chain. Roles outside the chain for that seat **must not appear** anywhere in the UI.

### Role definitions

| Role ID | Label | Geo scope | Portal |
|---|---|---|---|
| `campaign_manager` | Campaign manager | Full workspace | Full (CM portal) |
| `national` | National agent | National tally centre | Scoped portal |
| `county` | County agent | One county | Scoped portal |
| `constituency` | Constituency agent | One constituency | Scoped portal |
| `ward` | Ward admin | One ward | Scoped portal |
| `agent` | Polling agent | One station | Simple (form upload) |
| `volunteer` | Volunteer | Ward | None (SMS/app only) |

### Tier chain per seat

```
president:  campaign_manager → national → county → constituency → ward → agent
governor:   campaign_manager → county → constituency → ward → agent
senator:    campaign_manager → county → constituency → ward → agent
mp:         campaign_manager → constituency → ward → agent
mca:        campaign_manager → constituency → ward → agent
```

Volunteers sit outside the chain on every seat — they never get verification rights.

### Form numbers per seat

| Seat | Polling agent | Ward admin (verifies) | Constituency agent | County agent | National agent |
|---|---|---|---|---|---|
| President | Form 34A | verifies all 34As in ward | Form 34B | Form 34C | Form 34D |
| Governor | Form 37A | verifies all 37As in ward | Form 37B | Form 37C | — |
| Senator | Form 38A | verifies all 38As in ward | Form 38B | Form 38C | — |
| MP | Form 35A | verifies all 35As in ward | Form 35B | — | — |
| MCA | Form 36A | verifies all 36As in ward | Form 36B reconciliation | — | — |

**These form numbers must appear verbatim in role description blurbs** anywhere roles are listed (recruitment link config, targeted invite, agent-apply page, setup step).

### Role blurb template (use these strings exactly)

```
agent      → "Sits at one polling station on election day. Captures Form {X}A and submits via the app."
ward       → "Sees every station in the ward. Verifies or queries Form {X}A submissions."
constituency → "Reconciles the constituency tallying centre. Form {X}B reconciliation."
county     → "Top of the {seat} chain. Form {X}C reconciliation across all constituencies."
national   → "Sits at the national tallying centre. Form 34C/34D reconciliation. Presidential chain only."
volunteer  → "Mobilisation support. No station assignment, no verification rights."
```

Where `{X}` is the form letter for the seat (3→president, 7→governor, 8→senator, 5→MP, 6→MCA) and `{seat}` is the seat name.

---

## 4. Accounts — Everyone Gets One

**All roles including polling agents and volunteers get a user account.** Polling agents and volunteers get a simplified interface (form upload + status view only). Tier officers (ward admin and above) get a scoped portal.

Account creation flow (same pattern for all roles):
1. Receive invite link (targeted) or complete application (public link)
2. OTP-verify their phone
3. Set up account (name, email, password) — Step 2 of 2
4. Signed in automatically, lands on their scoped portal

Public-link applicants (polling agents / volunteers) sit in the **pending queue** until approved by the CM or an authorised tier officer. Approval triggers account creation automatically (or sends them a link to complete setup).

---

## 5. Recruitment Links

### Public application link — one per ward

Each ward gets its own public link. The CM configures which wards are open for applications. Settings stored in `recruitment_links` table (one row per ward per workspace):

| Field | Description |
|---|---|
| `workspace_id` | |
| `ward_id` | One link per ward |
| `token` | Regeneratable slug in the URL |
| `open_roles` | JSON: which roles are open (`agent`, `volunteer`) |
| `require_preferred_station` | Boolean |
| `show_walkthrough` | Boolean |
| `close_when_full` | Boolean — auto-close when all stations in ward have a confirmed agent |
| `is_active` | Boolean |

URL pattern: `/apply/{token}`

Tier officers are **never** recruitable via the public link. They are always targeted invites.

### Targeted invite

Sent by SMS to a named person for a specific role and geographic scope. Stored in `agent_invites` table:

| Field | Description |
|---|---|
| `workspace_id` | |
| `invited_by_user_id` | The user who sent the invite |
| `role` | One of the role IDs above |
| `name`, `phone` | Recipient details |
| `station_id` | For `agent` role only |
| `ward_id` | For `ward` role |
| `constituency_id` | For `constituency` role |
| `county_id` | For `county` role |
| `invite_token` | URL token |
| `expires_at` | |
| `status` | `pending` \| `accepted` \| `declined` \| `expired` |

URL pattern: `/join/agent/{token}` (distinct from the CM invite at `/join/{token}`)

---

## 6. Agents Table

All recruited people (approved or pending) live in `workspace_agents`:

| Field | Description |
|---|---|
| `id` | UUID |
| `workspace_id` | |
| `user_id` | Nullable until account is set up |
| `role` | Role ID |
| `status` | `pending` \| `approved` \| `rejected` \| `removed` |
| `station_id` | Nullable — for polling agents |
| `ward_id` | |
| `constituency_id` | |
| `county_id` | |
| `source` | `public_link` \| `targeted_invite` |
| `invite_id` | FK to `agent_invites` if targeted |
| `first_name`, `last_name`, `national_id`, `phone`, `age`, `email`, `photo_path` | |
| `approved_by_user_id`, `approved_at` | |

**A user can hold multiple roles** — one row per role. A polling agent can also be a ward admin (two rows, same `user_id`).

---

## 7. Permission System

### Two permission types

1. **Invite permission** — can this role send targeted invites to roles below them in the chain?
2. **Assignment permission** — can this role approve applications and assign stations to agents below them?

### How permissions work

- **Default**: only the CM and aspirant have both permissions on all tiers below them.
- **Granting**: a tier officer can grant either permission to the tier immediately below them. The CM can grant to any tier.
- **Cascade rule**: permissions granted by a higher authority **cannot be revoked by an intermediate tier**. Example: if the CM grants a ward admin invite permission, the constituency agent above that ward admin cannot remove it. Only the CM (or the aspirant) can revoke.
- **Seat-scoped**: permission settings only show tiers that exist in the seat's chain. An MP workspace never shows county agent permission settings.

### Permission storage (`workspace_agent_permissions` table)

| Field | Description |
|---|---|
| `workspace_id` | |
| `grantee_role` | The role receiving the permission |
| `grantee_geo_id` | Specific ward/constituency/county UUID (or null = all) |
| `permission` | `invite` \| `assign` |
| `granted_by_user_id` | The user who granted it |
| `granted_at` | |

### Settings UI location

Permission settings live in the workspace **Settings** page (aspirant + CM only). The CM sees only the tiers in their seat's chain. Each tier row has two toggles: "Can invite" and "Can assign" for the tier below.

---

## 8. Portal Scopes (per role)

When a tier officer logs in, their portal is filtered to their geographic scope:

| Role | Sees |
|---|---|
| Campaign manager | All agents, all wards, all tiers in the workspace |
| County agent | All agents, wards, constituencies in their county |
| Constituency agent | All agents and wards in their constituency |
| Ward admin | All agents in their ward |
| Polling agent | Their station only (form upload + confirmation) |
| Volunteer | Their ward (mobilisation tasks) |

The portal header shows the role badge (e.g. "Constituency agent") and the geo scope (e.g. "Westlands · Nairobi County").

---

## 9. Agent-Apply Page (`/apply/{token}` and `/join/agent/{token}`)

The same page handles both sources, detected from the link type:

**Public link flow:**
1. Landing: choose role (agent / volunteer), pick preferred station if agent
2. Details: photo, first name, last name, age, email, phone
3. OTP: verify phone
4. Done: "Application received — the campaign will review within a day or two."

Applicant lands in the pending queue. **No account created yet.** On approval, a setup link is sent.

**Targeted invite flow:**
1. Landing: shows role and geo scope from the invite, phone masked
2. Details: same form but phone pre-filled and locked
3. OTP: verify phone
4. Account setup (step 2 of 2): set password → account created, signed in

---

## 10. Subsection Build Order

Recommended order (each depends on the previous):

1. ✅ Geography (3.3) — done
2. ✅ Account & Workspace (aspirant sign-up, login, create workspace) — done
3. ✅ Campaign managers (invite, accept, setup) — done
4. **Recruitment** — CM creates public link per ward + targeted invites
5. **Agent apply** — public-link and targeted-invite flows
6. **Agent review queue** — CM/authorised tier approves applications
7. **Ward coverage board** — assign approved agents to stations
8. **Tier officer portals** — scoped portals for ward admin, constituency agent, etc.
9. **CM Home** — aggregates data from all subsections above
10. **War room** — election-night real-time

---

## 11. Existing Routes Reference

```
GET    /api/join/{token}                   Public invite card (CM invite)
POST   /api/join/{token}/request-otp       Send OTP to invite phone
POST   /api/join/{token}/accept            Verify OTP → issue verified_token
POST   /api/join/{token}/setup             Create account → issue auth token
POST   /api/join/{token}/decline           Decline invite

GET    /api/auth/me
POST   /api/auth/login
POST   /api/auth/verify-otp
POST   /api/workspaces
GET    /api/workspaces/{id}
GET    /api/workspaces/{id}/managers
POST   /api/workspaces/{id}/managers
POST   /api/workspaces/{id}/managers/{mid}/resend
DELETE /api/workspaces/{id}/managers/{mid}

GET    /api/geography/counties
GET    /api/geography/counties/{id}/tree
GET    /api/geography/wards/{id}/stations
POST   /api/geography/wards/{id}/stations
```

---

## 12. Frontend Routes Reference

```
/create-account              Aspirant sign-up
/login                       Aspirant + any user login
/verify                      Phone OTP (aspirant login)
/verify-email                Email verification link
/account                     Aspirant home
/account/settings            Aspirant settings
/account/verify-email        Email verification page
/workspaces                  Workspace list
/workspaces/new              Create workspace
/workspaces/:id              Workspace overview
/workspaces/:id/managers     Campaign managers list
/workspaces/:id/managers/invite   Invite CM

/join/:token                 CM invite card (public)
/join/:token/verify          CM phone OTP (step 1 of 2)
/join/:token/setup           CM account setup (step 2 of 2)

/apply/:token                Agent public-link apply (TBD)
/join/agent/:token           Agent targeted-invite accept (TBD)
```

---

## 13. Key Conventions

- Phone numbers stored normalised as `+2547xxxxxxxx`
- UUIDs for all primary keys (workspace, geography, agents)
- Bearer tokens hashed with SHA-256 in DB, plaintext returned once
- OTPs hashed with bcrypt, 10-min TTL, 5-attempt lockout
- `APP_DEBUG=true` → OTPs and invite tokens echoed as `dev_otp` / `dev_token` in API responses
- All invite/agent tokens are uppercase 6-char strings (short) or 40-char random strings (long)
- Form numbers follow IEBC Kenya naming: 34x (President), 35x (MP), 36x (MCA), 37x (Governor), 38x (Senator)
