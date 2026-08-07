# UK Textiles — Garment Order Tracking

A production tracking system for garment manufacturing. It replaces the paper order sheet with a
live view of where every order actually is: which of the 15 production stages it has reached, how
much quantity moved on from each one, who handled it, and how many days remain before delivery.

Tracking is **PO-first**: an order is split into purchase orders, and every stage, quantity, and
assignment is scoped to a specific PO rather than the order as a whole — so "how much of PO 01669678
has reached Cutting" is always a direct question, not something to work out by hand.

Two audiences share one workflow:

- **Admin** — full visibility across every order, plus user management and work assignment.
- **Floor / section users** — a focused screen showing only the stages assigned to them, where they
  record what moved, what was short, and what was rejected.

---

## Contents

- [Tech stack](#tech-stack)
- [The 15-stage workflow](#the-15-stage-workflow)
- [Core domain rules](#core-domain-rules)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Demo data](#demo-data)
- [Project structure](#project-structure)
- [Architecture notes](#architecture-notes)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Build | Vite 5 + TypeScript 5.6 |
| UI | React 18, React Router 6, Tailwind CSS 3 |
| Data | Supabase (Postgres + Auth + Storage), TanStack Query 5 |
| Charts | Recharts |
| Hosting | Vercel (static SPA + `/api` serverless functions) |

---

## The 15-stage workflow

Stages are seeded in `supabase/schema.sql` and drive everything else — routing to the right entry
form, unit of measure, and estimated durations.

| # | Stage | Unit | Form type |
| --- | --- | --- | --- |
| 1 | Order Confirmation (PO) | KG | `confirmation` |
| 2 | Raw Material Planning | KG | `material_planning` |
| 3 | Purchase Order to Suppliers | KG | `simple_confirm` |
| 4 | Raw Material Inward | KG | `material_inward` |
| 5 | Fabric Processing | KG | `fabric_processing` |
| 6 | Fabric Store | KG | `store_check` |
| 7 | Pattern Making & Marker Planning | KG | `simple_confirm` |
| 8 | **Cutting** | **PCS** | `cutting` |
| 9 | Embroidery | PCS | `dispatch_return` |
| 10 | Sewing (Stitching) | PCS | `sub_steps` |
| 11 | Checking | PCS | `simple_confirm` |
| 12 | Ironing | PCS | `simple_confirm` |
| 13 | Packing (interim) | PCS | `simple_confirm` |
| 14 | Finishing | PCS | `sub_steps` |
| 15 | Packing (final) | PCS | `sub_steps` |

Two stages are both labelled "Packing" (13 and 15, keyed `line_packing` and `packing`) — an interim
poly-bag/carton-prep pack right after Ironing, and the final dispatch pack at the end of the line.
Their `key` distinguishes them internally; only the display label is shared. Sewing/Stitching (10)
is the actual garment-assembly step — it keeps the same Line Feeding / Inline QC / End Line QC /
Measurement Check checklist the original combined stage had; Checking (11) is a separate, later
pass/fail inspection checkpoint, not the sewing line's own inline QC.

**Cutting is the pivot.** Everything before it is measured in **KG**; everything from Cutting onward
is measured in **PCS**. Completing Cutting for a PO sets that PO's own `purchase_orders.cut_quantity`
— the fixed baseline every later stage for that PO compares against (see
[PO-first tracking](#po-first-tracking) below).

Each stage renders a different form — `StageFormRouter` picks one of nine specialised components
based on `form_type`, because a fabric-processing screen and a packing screen need genuinely
different fields.

---

## Core domain rules

These are the rules worth understanding before changing anything; most live in
[`src/lib/progress.ts`](src/lib/progress.ts).

### PO-first tracking

Every unit of work is scoped to **(order, PO, section)** — never just (order, section). An assignment
that covers "every PO" (no `po_id` set, whether an explicit `user_assignments` row or a global stage
role) is expanded client-side in `useMyWork` into one work item **per purchase order**, each with its
own progress computed from just that PO's `stage_entries`. An order with zero POs yet falls back to a
single order-level item so nothing disappears from the work list.

Practically, this means:

- A user never sees "the order" as an undifferentiated blob — they pick which PO's card to open (Home
  / Data Input), and everything from then on — quantities, gating, the workflow stepper, the entry
  itself — is scoped to that PO.
- `purchase_orders.cut_quantity` mirrors `orders.cut_quantity` but per PO — Cutting normally
  completes once per PO, not once for the whole order. `CuttingForm` sets whichever one matches the
  assignment's scope.
- The Admin's Order Detail page adds a **Track by Purchase Order** tab strip — "All POs (combined)"
  recomputes the aggregate view exactly as before; each PO tab recomputes `buildOrderProgress()` with
  that PO's own entries and quantities via its optional `qtyBaseline` override.
- Because the combined view merges multiple POs' independent entries into one stream,
  `getCombinedCutQuantity()` sums each PO's own `cut_quantity` (once every PO has one) rather than
  relying on `orders.cut_quantity`, which normally stays `null` once every PO is cut individually.

### Quantity carries over between stages

A stage's inbound quantity is **derived**, not re-typed. Each stage exposes:

- `qtyInherited` — what the previous stage forwarded
- `qtyReceived` — what was actually counted in at this stage
- `qtyAllotted` — the effective figure: counted if recorded, else inherited, else the order baseline

This means leaving one stage's form blank no longer blanks out the stages after it. Carry-over only
applies **across stages sharing a unit** — Cutting converts KG to PCS, so the previous stage's number
means something different and is not inherited.

If a stage counts in a different quantity than the previous stage forwarded, `hasQtyMismatch` flags
it for reconciliation rather than silently overwriting either number.

### Three ways to move work on

Every stage form offers the same three actions:

| Action | Effect |
| --- | --- |
| **Save Plan** | Records progress. Moves nothing. |
| **Not Completed — Move to Next Stage** | Forwards what's ready. Stage stays **open**. |
| **Forward to Next Stage** | Forwards and **closes** the stage. |

A stage that forwarded without completing is `isPartial` — shown **orange** throughout the UI, with
a balance still owed. Crucially, **the next stage unlocks anyway**, so a partial handoff never blocks
the line. It stays flagged until someone completes it, which turns it green.

This exists for the real case where goods arrive in batches: a DC is raised before the material
lands, or only part of a consignment turns up. Send on what's there, come back for the rest.

### Split records

A stage's quantity rarely moves in one piece. `+ Add Record` adds unlimited rows — destination type
(in-house / branch / unit / outside party / **others**), destination name, quantity, rejected — and
each becomes its own `stage_entries` row. The stage totals stay correct because `qty_forwarded` sums
across entries while `qty_received` is a restated max carried on the first row only. "Others" is a
free-text catch-all destination for anything that doesn't fit the three named categories — the name
typed in is saved as `transfer_to` exactly like the other transfer types.

### Stage gating

A user can only enter data once the order has actually reached their stage. `useMyWork` resolves each
assignment to a `GateStatus`:

- `active` — every earlier stage has completed **or** partially forwarded → your turn
- `locked` — an earlier stage hasn't moved anything on yet
- `completed` — your stage is closed

### Assignments

Work reaches a user two ways:

1. **Per-order assignments** (`user_assignments`) — scoped to a specific order, optionally a specific
   PO, with a `can_enter_data` flag (off = monitor-only).
2. **Global stage roles** (`stage_assignments`) — assign someone to a stage *once* and they become the
   default assignee for that stage on **every** order, current and future.

The app expands stage-role defaults into implicit per-order assignments; explicit per-order rows take
precedence and add finer PO-level scope on top.

---

## Getting started

**Prerequisites:** Node 18+ and a Supabase project.

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env` (see below), apply the database schema, then bootstrap the admin account:

```bash
npm run seed:admin
```

Optionally, populate example users/orders/movement so there's something to click through immediately
(see [Database setup](#database-setup) for the required order):

```bash
npm run seed:demo
```

```bash
npm run dev
```

The app runs at `http://localhost:5173`. Sign in with the credentials from `DEFAULT_ADMIN_USERNAME` /
`DEFAULT_ADMIN_PASSWORD`, or (after `seed:demo`) as any example user — see
[`scripts/seed-demo.ts`](scripts/seed-demo.ts) for the full list; every demo account shares the
password `demo123`.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server, with `/api` functions served by Vite middleware |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over the whole project |
| `npm run seed:admin` | One-time: create the default Admin auth user + profile |
| `npm run seed:demo` | Optional: one example user per section, 2 sample orders (4 POs), and mock movement through the workflow |

---

## Environment variables

```ini
# Public — safe to ship in the browser bundle
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key

# Server-only. NEVER prefix with VITE_ — that would bundle it into the browser.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Used once by scripts/seed-admin.ts
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123

# Turns username logins into Supabase Auth email sign-ins (admin -> admin@uktextiles.local)
VITE_AUTH_EMAIL_DOMAIN=uktextiles.local
```

`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security entirely. It is only read by the `/api`
serverless functions and the seed script — never by browser code.

---

## Database setup

1. In the Supabase SQL editor, run **[`supabase/schema.sql`](supabase/schema.sql)**. This creates all
   tables, RLS policies, the storage bucket, the 15 workflow stages, and demo seed data (4 orders
   from the MCKENZIE / JD SPORTS sheet with their POs).
2. Run the files in **[`supabase/migrations/`](supabase/migrations)** in numeric order. They are
   idempotent and safe to re-run — **`010_po_tracking_and_sections.sql` clears `stage_entries`,
   `stage_sub_items`, `user_assignments`, and `stage_assignments`** (every table with a foreign key
   into `workflow_stages`, which it deletes and re-inserts with new rows) but **does not touch
   `orders` or `purchase_orders`** — your 4 original demo orders are untouched. Read its header
   comment before running it against real data.
3. Run `npm run seed:admin` once. Supabase Auth users can't be created via plain SQL, so this script
   creates the auth user and its matching `app_users` profile.
4. Optionally, run `npm run seed:demo` once (after step 2's migrations are fully applied — it checks
   for exactly 15 `workflow_stages` rows and fails loudly if that migration hasn't run yet) to add 2
   new sample orders alongside your existing ones, wire up example users, and walk realistic
   production movement through them — see [Demo data](#demo-data) below for exactly what it seeds.

### Tables

| Table | Purpose |
| --- | --- |
| `app_users` | Profile mirroring `auth.users` — name, username, role, phone, activity |
| `orders` | IO number + style + colour, total qty, `cut_quantity`, delivery date |
| `purchase_orders` | Sub-batches under an order — qty, date, and its own `cut_quantity` |
| `workflow_stages` | The 15 stages: sequence, unit type, typical duration, form type |
| `user_assignments` | Per-order, per-PO stage assignment |
| `stage_assignments` | Global stage-role defaults, applying to every order/PO |
| `stage_entries` | The core movement log — one row per submission, always PO-scoped |
| `stage_sub_items` | Per-material / per-substep planning within a stage (order-level, not per-PO) |

### A note on stored passwords

`app_users.password_plain` mirrors each user's password in readable form. Real authentication runs
through Supabase Auth with proper hashing — this column exists **only** so an Admin can view a user's
password in the Users screen, which was an explicit product requirement. It is a deliberate trade-off,
not an oversight. Remove the column and the reveal UI if that requirement ever goes away.

### Demo data

`npm run seed:demo` ([`scripts/seed-demo.ts`](scripts/seed-demo.ts)) adds to whatever is already in
the database — it never deletes or replaces your existing orders, including the 4 original demo
orders from `schema.sql`:

- **15 example users**, one per section (Merchandiser, Raw Material Planner, Cutting Master, Sewing
  Line Supervisor, QC Checker, …), wired up via Stage Roles so they're automatically responsible for
  that section on *every* order — the 4 originals included. All share the password `demo123`.
- **2 new sample orders**, each with 2 POs, walked through the workflow with movement that mirrors
  exactly what each stage's real form would produce (not placeholder numbers) — fabric consumption
  computed per piece, sequential QC bottlenecks, small realistic losses at Cutting/Embroidery/Stitching,
  and notes a floor supervisor would actually write:
  - **MCKTM 18001-010 (Crew Sweatshirt)** — both POs carried **fully complete through all 15
    stages**, start to finish.
  - **MCKTM 18045-022 (Zip Hoodie)** — left **genuinely partial**: one PO stalls partway through
    Stitching (the app's orange "moved on, not completed" state, from a normal QC bottleneck where
    the four checkpoints — Line Feeding, Inline QC, End Line QC, Measurement Check — are progressing
    at different speeds), the other hasn't moved past Order Confirmation.

---

## Project structure

```
├── api/                          # Vercel serverless functions (service-role only)
│   ├── _supabaseAdmin.ts         # Shared service-role client
│   ├── admin-create-user.ts      # Auth user + profile + assignments
│   ├── admin-update-password.ts  # Password reset
│   └── admin-delete-user.ts
├── public/UKT_Company_Logo.png
├── scripts/
│   ├── seed-admin.ts              # One-time admin bootstrap
│   └── seed-demo.ts               # Optional: example users/orders/mock movement
├── supabase/
│   ├── schema.sql                # Full DDL + RLS + seed data
│   └── migrations/               # Incremental, idempotent changes
└── src/
    ├── components/
    │   ├── dashboard/            # GameLevelPath, OrderCard, split tables
    │   ├── forms/stage/          # 9 specialised stage forms + router + shared
    │   ├── layout/               # Admin/User shells, ProtectedRoute
    │   └── ui/                   # Button, Card, Table, Modal, FilterTabs…
    ├── context/                  # Auth, Toast, Confirm
    ├── hooks/                    # TanStack Query data hooks
    ├── lib/
    │   ├── progress.ts           # Carry-over, partial state, gating — the core
    │   ├── orderQty.ts           # KG/PCS baselines and comparisons
    │   ├── workflow.ts           # Date maths, delivery urgency
    │   ├── theme.ts              # Shared glass/gradient surface styles
    │   └── stageConfig.ts        # Per-stage sub-item definitions
    └── pages/
        ├── admin/                # Dashboard, Orders, OrderDetail, Users,
        │                         #   AssignWork, StageRoles
        └── user/                 # Home, DataInput
```

---

## Architecture notes

### Progress is computed client-side

There are no database triggers or materialised views for progress. `buildOrderProgress()` aggregates
the raw `stage_entries` log into the whole per-stage and per-order model in one place, so the
business rules stay readable and adjustable in TypeScript rather than scattered across SQL.

### RLS avoids recursive policies

Policies that need to check another table use `SECURITY DEFINER` helper functions (`is_admin()`,
`has_order_assignment()`). A policy that queries its **own** table re-triggers itself and Postgres
raises an infinite-recursion error — the helper bypasses RLS internally and sidesteps it.

### Dates are parsed as local days

Postgres `date` columns arrive as `"YYYY-MM-DD"`. Passing those to `new Date()` parses them as **UTC
midnight**, which read back with local getters lands on the previous day for anyone west of UTC —
shifting every delivery countdown by one. `parseDbDate()` in `workflow.ts` splits the parts and builds
a local date instead. Use it for anything date-only.

### Gradients live in inline styles

`src/lib/theme.ts` holds the frosted-glass and gradient surface styles as plain inline style objects
rather than Tailwind theme tokens. Vite caches `tailwind.config.ts` and does **not** reload it on
change, so a newly added custom token silently doesn't exist until the dev server restarts. Nothing
that affects whether text is readable should depend on that.

For the same reason, any arbitrary-value Tailwind class must be spelled out **in full** in source —
including its variant prefix. A class assembled at runtime (`` `hover:${SHADOW}` ``) is invisible to
Tailwind's scanner and will never be generated.

### Local `/api` support

Vite doesn't natively run Vercel serverless functions. `vite.config.ts` includes a small middleware
plugin that loads and invokes `api/*.ts` handlers with a Vercel-shaped request/response during
`npm run dev`, so admin actions work locally exactly as they do in production.

---

## Deployment

Deploys to Vercel as a static SPA plus serverless functions; `vercel.json` handles the SPA rewrite
and routes `/api/*` to the functions.

1. Import the repository into Vercel.
2. Add all four environment variables in **Project Settings → Environment Variables**. Only the
   `VITE_`-prefixed ones reach the browser.
3. Deploy. Build command and output directory are already configured.

---

## Troubleshooting

**403 on `stage_entries` when forwarding a stage**
The RLS policy doesn't recognise your assignment. If the user works that stage via a *global stage
role* rather than a per-order assignment, make sure migration `009_stage_defaults_rls_fix.sql` has
been applied — earlier policies only checked `user_assignments`.

**`seed:demo` fails with "Expected 15 workflow_stages"**
Migration `010_po_tracking_and_sections.sql` hasn't been applied yet (or an older schema is still in
place) — the demo data depends on the reshaped 15-stage workflow. Apply it first.

**500 with "infinite recursion detected in policy"**
A policy is querying its own table. Wrap the check in a `SECURITY DEFINER` function, as
`has_order_assignment()` does.

**"Your session has expired" after leaving a tab idle**
Expected when the refresh token itself has expired. Log out and back in. Ordinary token expiry is
handled automatically — `authedFetch` proactively refreshes and retries once on a 401.

**A style change isn't appearing**
If you edited `tailwind.config.ts`, restart the dev server — Vite caches that config. If you added an
arbitrary-value class, check it's written out in full rather than assembled from a variable.

**Delivery dates off by one day**
Use `parseDbDate()` from `src/lib/workflow.ts` instead of `new Date()` on any date-only string.
