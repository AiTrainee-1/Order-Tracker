# UK Textiles — Garment Production Management

A production tracking system for garment manufacturing. It replaces the paper order sheet with a
live view of where every order actually is: which of the 20 production stages it has reached, how
much quantity moved on from each one, which lot and which size, who handled it, and how many days
remain before delivery.

Tracking is **PO-first, size-wise, and lot-wise**:

- an order splits into purchase orders, and each PO carries its own **size breakdown** — the base
  every downstream piece count is measured against;
- fabric becomes a **lot** at knitting, and that lot number follows the goods through dyeing,
  cutting, sewing and packing, so a shortage can be located rather than merely observed;
- every stage's input is the previous stage's output, computed once and read everywhere.

Two audiences share one workflow:

- **Admin** — full visibility across every order, user management, work assignment, and the
  end-to-end Output analysis with downloadable reports.
- **Floor / section users** — a focused screen showing only the stages assigned to them, where they
  record what came in, what went out, what was short, and what was rejected.

---

## Contents

- [Tech stack](#tech-stack)
- [The 20-stage workflow](#the-20-stage-workflow)
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
| Reports | SheetJS (`xlsx`), jsPDF + autotable — both loaded on demand |
| Hosting | Vercel (static SPA + `/api` serverless functions) |

---

## The 20-stage workflow

Stages are seeded by `supabase/migrations/011_production_chain.sql` and drive everything else —
routing to the right entry form, unit of measure, and estimated durations.

| # | Stage | Unit | Tracks | Form type |
| --- | --- | --- | --- | --- |
| 1 | Order Confirmation | PCS | PO + size breakdown | `confirmation` |
| 2 | Raw Material Planning | KG | yarn counts, fabric types | `material_planning` |
| 3 | Purchase Order to Suppliers | KG | DC dispatch + receipt | `supplier_dc` |
| 4 | Raw Material Inward | KG | store inward | `material_inward` |
| 5 | **Knitting** | KG | **lot** + knitting unit | `knitting` |
| 6 | Dyeing | KG | lot | `lot_process` |
| 7 | Setting | KG | lot | `lot_process` |
| 8 | Raising | KG | lot | `lot_process` |
| 9 | Compacting | KG | lot | `lot_process` |
| 10 | In-House | KG | lot | `lot_process` |
| 11 | Fabric Inspection | KG | lot, accept/reject | `lot_inspection` |
| 12 | Fabric Store | KG | whole fabric journey | `fabric_store` |
| 13 | Pattern Making & Marker Planning | KG | — | `simple_confirm` |
| 14 | **Cutting** | **PCS** | **lot × size** | `cutting` |
| 15 | Panel Checking | PCS | lot × size | `panel_check` |
| 16 | Embroidery | PCS | lot × size, send + return | `embroidery` |
| 17 | Sewing (Stitching) | PCS | lot × size × line | `sewing` |
| 18 | Checking | PCS | lot × size | `garment_qc` |
| 19 | Ironing | PCS | lot × size | `garment_process` |
| 20 | Packing | PCS | lot × size | `packing` |

Then **OUTPUT** — not a stage, a report page at `/admin/output/:orderId`.

**Two pivots matter.** *Knitting* is where fabric becomes a lot; *Cutting* is where KG becomes PCS.
Everything before Cutting is weighed, everything after is counted, and the lot number is what
survives the transition and ties the two halves together.

---

## Core domain rules

### Two layers, deliberately separated

This is the single most important thing to understand before changing anything.

| Layer | Owns | Lives in |
| --- | --- | --- |
| **Gating** | is a stage open, partially forwarded, or complete; who handled it; what unlocks next | `stage_entries` → [`src/lib/progress.ts`](src/lib/progress.ts) |
| **Quantity** | how much actually moved, per lot, per size, cumulatively | `production_txns` + `material_entries` → [`src/lib/chain.ts`](src/lib/chain.ts) |

Keeping them apart is what lets a figure be corrected — a recount, a late batch, a supplier
short-supplying — without disturbing which stages are unlocked. When a stage is forwarded, the
gating row is written with a **delta** against what earlier rows already logged, so the two layers'
running totals always agree instead of double-counting.

### Every stage's input is the previous stage's output

[`buildProductionChain()`](src/lib/chain.ts) resolves each stage's input in this order:

1. what was physically counted in here (sum of `qty_in`)
2. what the previous comparable stage sent on
3. the stage's own baseline — ordered pieces for PCS stages, the material plan at Knitting

Step 2 is why leaving one stage's form blank doesn't blank out the stages after it. Step 3 only
applies where a real external figure exists, so a KG stage mid-chain can't invent a quantity.

If a stage counts in something different from what arrived, **both figures are kept** and the gap is
flagged for reconciliation rather than one silently overwriting the other.

### One transaction table for fourteen stages

`production_txns` serves Knitting through Packing. Knitting kilos, a dyeing lot, a size-wise cutting
row and a sewing line's hourly output are all the same shape: some quantity in, some out, some
rejected, against a lot and/or a size. One table means the chain calculation is one query and one
code path — which is what actually prevents two screens disagreeing about the same quantity.

A row may carry only `qty_in` (a sewing line feed), only `qty_out` (that line's output later the
same day), or both. Each column sums independently, so repeat entries accumulate rather than
overwrite.

### Nothing is ever overwritten

Every stage offers **+ Add New Entry**, never an edit-in-place of the running total. Existing entries
can be corrected, but a correction requires a written reason and is recorded in `audit_log` with the
before and after values — the original figures are kept, not replaced.

### One shared ledger for procurement

Raw Material Planning, Purchase Order to Suppliers and Raw Material Inward are three screens over
**one** set of rows: a `material_requirement` ("40s — 500 KG") and a ledger of `material_entries`
against it, typed `plan` / `dc` / `receipt` / `inward`. Each screen edits the types it owns and shows
the others read-only.

That is why the Inward screen can show planned → dispatched → received → balance without the
storekeeper re-typing anything the planner or buyer entered, and why the three can never disagree.

Yarn counts and fabric types are **user-defined per order** — added, renamed and removed by the
planner. There is no hard-coded list. Trims and accessories were removed from this stage as not part
of the fabric chain.

### Three ways to move work on

Every stage's form ends with the same three buttons, in the same order, always enabled:

| Action | `is_forwarded` | `is_completed` | Effect |
| --- | --- | --- | --- |
| **Save Plan** | `false` | `false` | Writes pending entries. Moves nothing. Stage reads *in progress*. |
| **Not Complete – Move Forward** | `true` | `false` | Writes entries, forwards. Stage stays **open** — **orange**, balance owed. |
| **Completed – Move Forward** | `true` | `true` | Writes entries, forwards, **closes** the stage (green). |

Those two flags are the whole state machine, and they are set from a single
`StageAction` discriminator rather than two independent booleans — because two
booleans can express a fourth state that doesn't exist, and that bug shipped
once (see below).

Two rules follow from this, and both matter:

**Completing is never a prerequisite.** "Not Complete – Move Forward" unlocks the next stage exactly
as completion does. A stage waiting on a balance must never hold up the line — that's the whole
reason the orange state exists. `useMyWork` gates on `isCompleted || isPartial`, not `isCompleted`.

> **Forwarding is a decision, not a quantity.** This was originally inferred —
> `isPartial = !isCompleted && qtyForwarded > 0` — which broke Raw Material Planning outright: it
> forwards the material *received*, and planning happens before material arrives, so Move Forward
> wrote a row indistinguishable from Save Plan and Purchase Order to Suppliers never unlocked.
> `is_forwarded` (migration 012) records the decision itself. `npm run check:gating` guards it.

**Completing is not a lock.** A completed stage keeps its data-entry form so a late balance, a
recount or a correction can still be recorded. Marking a stage done is a statement about the
handoff, not a door that shuts.

All three buttons commit the ledger before acting, so a typed-but-unsaved row can never be left
behind while the stage forwards a quantity the next stage can't see. That's why `StageLedger` exposes
its save through a ref rather than owning a save button of its own — one place to enter, three ways
to act on it.

**Orange means exactly one thing across the whole app**: moved on, not finished, balance owed. It
appears on the stage path, the work-list cards, the "next stages" strip, the order cards and the
stage header. "Your Turn" is deliberately blue so the two never blur together.

### Stage gating

`useMyWork` resolves each assignment to a `GateStatus`:

- `active` — every earlier stage has completed **or** partially forwarded → your turn
- `locked` — an earlier stage hasn't moved anything on yet
- `completed` — your stage is closed (its form stays open for late entries)

`workBadge()` layers the orange "Not Complete" state on top, because a partially-forwarded stage is
still `active` and showing it as an ordinary "Your Turn" would bury the outstanding balance.

### Assignments

Work reaches a user two ways:

1. **Per-order assignments** (`user_assignments`) — scoped to a specific order, optionally a specific
   PO, with a `can_enter_data` flag (off = monitor-only).
2. **Global stage roles** (`stage_assignments`) — assign someone to a stage *once* and they become
   the default assignee for that stage on **every** order, current and future.

Several users can share one stage. Raw Material Planning is set up this way in the demo data, with
three planners working the same yarn and fabric rows.

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

Optionally, populate example users/orders/movement so there's something to click through
immediately:

```bash
npm run seed:demo
```

```bash
npm run dev
```

The app runs at `http://localhost:5173` (set `PORT` to use another). Sign in with the credentials
from `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`, or — after `seed:demo` — as any example
user; every demo account shares the password `demo123`.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server, with `/api` functions served by Vite middleware |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over the whole project |
| `npm run check:gating` | Regression check on stage unlocking (see [Three ways to move work on](#three-ways-to-move-work-on)) |
| `npm run seed:admin` | One-time: create the default Admin auth user + profile |
| `npm run seed:demo` | Optional: 22 example users, 2 sample orders (4 size-wise POs), and realistic movement through the chain |

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
serverless functions and the seed scripts — never by browser code.

---

## Database setup

1. In the Supabase SQL editor, run **[`supabase/schema.sql`](supabase/schema.sql)**.
2. Run the files in **[`supabase/migrations/`](supabase/migrations)** in numeric order.

   ⚠ **`011_production_chain.sql` clears `stage_entries`, `stage_sub_items`, `user_assignments` and
   `stage_assignments`** — the same mechanic as `010`. Every `workflow_stages` row is deleted and
   re-inserted with new ids, and those four tables hold a foreign key into it. `orders`,
   `purchase_orders` and `app_users` are **not** touched. Read its header comment before running it
   against real data.

   It also backfills a single `TOTAL` size row for every existing PO, so orders that predate
   size tracking stay valid until an admin breaks them out into real sizes.
   `012_explicit_forward_flag.sql` is additive and non-destructive — one column plus a backfill —
   and is safe to run against live data. **It is required**: without it, "Not Complete – Move
   Forward" cannot unlock the next stage.
3. Run `npm run seed:admin` once. Supabase Auth users can't be created via plain SQL.
4. Optionally run `npm run seed:demo` (it checks for exactly 20 `workflow_stages` rows and fails
   loudly if `011` hasn't been applied).

### Tables

**Core**

| Table | Purpose |
| --- | --- |
| `app_users` | Profile mirroring `auth.users` — name, username, role, phone, activity |
| `orders` | IO number + style + colour, total qty, delivery date |
| `purchase_orders` | Sub-batches under an order |
| `po_size_quantities` | **PO × size × quantity — the base for every downstream PCS figure** |
| `workflow_stages` | The 20 stages: sequence, unit type, typical duration, form type |
| `user_assignments` | Per-order, per-PO stage assignment |
| `stage_assignments` | Global stage-role defaults, applying to every order/PO |

**Gating layer**

| Table | Purpose |
| --- | --- |
| `stage_entries` | Is a stage open / partial / complete, and who moved it |

**Quantity layer**

| Table | Purpose |
| --- | --- |
| `production_lots` | Lot register — raised at Knitting, referenced to Packing |
| `material_requirements` | User-defined yarn counts and fabric types + required KG |
| `material_entries` | `plan` / `dc` / `receipt` / `inward` ledger against a requirement |
| `production_txns` | **The universal transaction: lot, size, in, out, rejected, rework** |
| `audit_log` | Append-only history: before → after, user, timestamp, reason |

`stage_sub_items` is retained by the schema but no longer used — the per-material planning it held
is now `material_requirements`, which is per-PO and has a proper entry ledger beneath it.

### A note on stored passwords

`app_users.password_plain` mirrors each user's password in readable form. Real authentication runs
through Supabase Auth with proper hashing — this column exists **only** so an Admin can view a user's
password in the Users screen, which was an explicit product requirement. It is a deliberate
trade-off, not an oversight.

---

## Demo data

`npm run seed:demo` ([`scripts/seed-demo.ts`](scripts/seed-demo.ts)) adds to whatever is already in
the database and never touches orders you created yourself. Re-running it rebuilds only its own two
sample orders, so the result is the same on the first run and the fifth.

- **22 example users** — one per stage, plus two extra planners so Raw Material Planning has the
  three people sharing it that the workflow calls for. All wired up via Stage Roles, so they're
  responsible for their section on *every* order. Password `demo123`.
- **MCKTM 18001-010 (Crew Sweatshirt)** — both POs carried **fully complete through all 20 stages**,
  with the losses a real run accumulates: a few kilos at each fabric process, ~0.5% cutting wastage,
  a small embroidery reject in job-work transit, and sequential QC rejects down the sewing line.
- **MCKTM 18045-022 (Zip Hoodie)** — left **genuinely mid-production**: one PO stalls partway through
  Sewing (the orange "moved on, not completed" state), the other hasn't left Order Confirmation.

---

## Project structure

```
├── api/                          # Vercel serverless functions (service-role only)
├── scripts/
│   ├── seed-admin.ts             # One-time admin bootstrap
│   └── seed-demo.ts              # Optional: example users/orders/movement
├── supabase/
│   ├── schema.sql                # Base DDL + RLS + storage bucket
│   └── migrations/               # Incremental changes; 011 builds the chain
└── src/
    ├── components/
    │   ├── dashboard/            # GameLevelPath, OrderCard, split tables
    │   ├── forms/
    │   │   ├── OrderForm.tsx     # PO × size grid, laid out like the buying sheet
    │   │   └── stage/
    │   │       ├── chainShared.tsx    # ChainStrip, LotSelect, StageLedger — the core UI
    │   │       ├── chainForms.tsx     # 11 stages, one component + a config each
    │   │       ├── MaterialLedger.tsx # Shared by the 3 procurement stages
    │   │       └── …
    │   ├── layout/               # Admin/User shells, ProtectedRoute
    │   └── ui/                   # Button, Card, Table, Modal, FilterTabs…
    ├── context/                  # Auth, Toast, Confirm
    ├── hooks/
    │   ├── useProductionChain.ts # Ledger fetching + every write mutation
    │   ├── useMyWork.ts          # Assignment expansion + gating
    │   └── …
    ├── lib/
    │   ├── chain.ts              # THE CORE — input/output/balance, lot & size
    │   ├── progress.ts           # Gating: open / partial / complete
    │   ├── sizes.ts              # Size helpers
    │   ├── reportExport.ts       # Excel / PDF / CSV
    │   ├── workflow.ts           # Date maths, delivery urgency
    │   └── theme.ts              # Shared glass/gradient surface styles
    └── pages/
        ├── admin/                # Dashboard, Orders, OrderDetail, Output,
        │                         #   Users, AssignWork, StageRoles
        └── user/                 # Home, DataInput
```

---

## Architecture notes

### Sixteen stages, six form components

Knitting through Packing all do the same thing — take a quantity in, send a quantity out, lose a
little — so they share one component driven by a `LedgerConfig` rather than fourteen near-identical
files. What genuinely differs (a lot vs a size, a vendor vs a sewing line, one quantity column vs
three) is exactly what the config expresses. The rules about never overwriting, always allowing
edits and always recording who/when/why are implemented **once**, in `StageLedger`, so a fix there
fixes every stage.

Stages that are genuinely different keep their own component: order confirmation, the three
procurement screens, and Embroidery — which renders two ledgers over one stage, dispatch and return,
each with its own running total.

### Preview runs the real form against memory

Stage Roles → **Preview** renders the genuine stage form — the same
`<StageFormRouter/>` the floor uses — on a sample order that exists only in
memory, so anyone can practise before touching a live order.

The guarantee that nothing is saved is enforced **at each write**, not around
it. `DemoModeProvider` supplies a store; every mutation in
`useProductionChain.ts` and `useStageEntries.ts` calls `useDemoStore()` first and
updates that store instead of Supabase. Reads are disabled the same way, so a
Preview doesn't even fetch the real order. Outside the provider `useDemoStore()`
returns `null` and every hook behaves exactly as before.

Putting the check inside the mutation means anyone reading `useCreateTxns` can
see the protection. A wrapper further out would be one refactor away from being
bypassed in silence.

`useEntryUser()` gives the sandbox a fixed practice identity, so a Preview never
depends on who is signed in — and, on real pages, replaces an `appUser?.id ?? ""`
fallback that would have sent an empty string where a uuid was expected.

### Progress is computed client-side

There are no database triggers or materialised views. `buildProductionChain()` and
`buildOrderProgress()` aggregate the raw ledgers in one place each, so the business rules stay
readable and adjustable in TypeScript rather than scattered across SQL.

### The chain is fetched as one bundle

All the ledgers for an order load together rather than per stage. The calculation is inherently
whole-order — Packing's balance depends on Sewing's output, which depends on Cutting's, back to the
yarn — so fetching piecemeal would let stages render against different snapshots and disagree.

### RLS avoids recursive policies

Policies that need to check another table use `SECURITY DEFINER` helpers (`is_admin()`,
`has_order_assignment()`, `can_view_order()`, `can_enter_section()`, `can_enter_materials()`). A
policy that queries its **own** table re-triggers itself and Postgres raises an infinite-recursion
error; the helper bypasses RLS internally and sidesteps it.

`audit_log` has insert and select policies but deliberately **no update or delete policy at all**, so
history cannot be rewritten through the API — not even by an admin.

### Reports are loaded on demand

`xlsx` and `jsPDF` together are most of a megabyte and only the Output screen needs them, so
`reportExport.ts` imports them dynamically. Both formats are built from the same table definitions,
so the spreadsheet and the PDF can never tell different stories.

### Dates are parsed as local days

Postgres `date` columns arrive as `"YYYY-MM-DD"`. Passing those to `new Date()` parses them as **UTC
midnight**, which read back with local getters lands on the previous day for anyone west of UTC.
`parseDbDate()` in `workflow.ts` builds a local date instead. Use it for anything date-only.

### Gradients live in inline styles

`src/lib/theme.ts` holds the frosted-glass and gradient surface styles as plain inline style objects
rather than Tailwind theme tokens. Vite caches `tailwind.config.ts` and does **not** reload it on
change, so a newly added custom token silently doesn't exist until the dev server restarts.

For the same reason, any arbitrary-value Tailwind class must be spelled out **in full** in source,
including its variant prefix. A class assembled at runtime is invisible to Tailwind's scanner.

### Local `/api` support

Vite doesn't natively run Vercel serverless functions. `vite.config.ts` includes a middleware plugin
that loads and invokes `api/*.ts` handlers with a Vercel-shaped request/response during `npm run
dev`, so admin actions work locally exactly as in production.

---

## Deployment

Deploys to Vercel as a static SPA plus serverless functions; `vercel.json` handles the SPA rewrite
and routes `/api/*` to the functions.

1. Import the repository into Vercel.
2. Add all environment variables in **Project Settings → Environment Variables**. Only the
   `VITE_`-prefixed ones reach the browser.
3. Deploy. Build command and output directory are already configured.

---

## Troubleshooting

**`Uncaught Error: supabaseUrl is required`**
`.env` is missing or empty. Copy `.env.example` to `.env`, fill in your project URL and anon key,
then restart the dev server — Vite only reads env vars at startup.

**`seed:demo` fails with "Expected 20 workflow_stages"**
Migration `011_production_chain.sql` hasn't been applied yet. Apply it first.

**"Move Forward" does nothing and the next stage stays locked**
Migration `012_explicit_forward_flag.sql` hasn't been applied. Without `stage_entries.is_forwarded`,
a stage forwarded with no quantity yet — which Raw Material Planning always is — can't be told apart
from a saved plan, so it never goes orange and never unlocks what follows. Apply 012, then
`npm run check:gating` to confirm.

**Creating a user fails with 400 / 500 on `/api/admin-create-user`**
Read the message in the toast, not the browser console line — the console only shows the status, the
body carries the reason. `SERVER_MISCONFIGURED` means `SUPABASE_SERVICE_ROLE_KEY` (or
`VITE_SUPABASE_URL`) is missing from `.env`; the response names which one. It fails on every attempt,
not intermittently, because `/api/*` cannot create Supabase Auth accounts without it. Add it, then
**restart the dev server** — Vite reads `.env` only at startup. On Vercel, set it in Project Settings
→ Environment Variables and redeploy.

The rest of the app keeps working meanwhile: the browser talks to Supabase with the anon key, and
only admin user management needs the service role.

**403 when saving a production entry**
The RLS policy doesn't recognise your assignment. `production_txns` requires `can_enter_data` on
that order + section, via either a per-order assignment or a global stage role. Editing the yarn or
fabric plan additionally requires an assignment on one of the three procurement stages.

**500 with "infinite recursion detected in policy"**
A policy is querying its own table. Wrap the check in a `SECURITY DEFINER` function, as
`has_order_assignment()` does.

**A stage shows "Input 0" when the previous stage clearly produced something**
The two stages are measured in different units (the KG → PCS switch at Cutting), or the previous
stage recorded output without the current stage recording input and there's no baseline to fall back
on. Check `buildProductionChain()`'s three-step resolution above.

**Cutting has no sizes to enter against**
That PO has no size breakdown — only a total. Edit the order and split its quantity across sizes;
Order Confirmation warns about this before material is committed.

**"Your session has expired" after leaving a tab idle**
Expected when the refresh token itself has expired. Log out and back in. Ordinary token expiry is
handled automatically.

**A style change isn't appearing**
If you edited `tailwind.config.ts`, restart the dev server. If you added an arbitrary-value class,
check it's written out in full rather than assembled from a variable.
