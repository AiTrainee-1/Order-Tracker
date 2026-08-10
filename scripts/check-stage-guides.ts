import { readFileSync } from "node:fs";
import { STAGE_GUIDE } from "../src/lib/stageGuide";

// Source of truth: the stage keys migration 011 actually inserts.
const sql = readFileSync("./supabase/migrations/011_production_chain.sql", "utf8");
const block = sql.split("insert into public.workflow_stages")[1].split(";")[0];
const keys = [...block.matchAll(/\('([a-z_]+)',\s*'/g)].map((m) => m[1]);

console.log(`workflow_stages inserts ${keys.length} stages`);
const missing = keys.filter((k) => !STAGE_GUIDE[k]);
const extra = Object.keys(STAGE_GUIDE).filter((k) => !keys.includes(k));

let fails = 0;
if (keys.length !== 20) { console.log(`FAIL  expected 20 stages, parsed ${keys.length}`); fails++; }
if (missing.length) { console.log(`FAIL  no guide for: ${missing.join(", ")}`); fails++; }
else console.log("PASS  every stage has a guide");
if (extra.length) { console.log(`FAIL  guide for non-existent stage: ${extra.join(", ")}`); fails++; }
else console.log("PASS  no orphan guides");

for (const k of keys) {
  const g = STAGE_GUIDE[k];
  if (!g) continue;
  const problems: string[] = [];
  if (!g.owns?.trim()) problems.push("owns empty");
  if (!g.records?.length) problems.push("no records");
  if (!g.maintains?.length) problems.push("no maintains");
  if (g.steps?.length < 3) problems.push(`only ${g.steps?.length ?? 0} steps`);
  if (!g.receives?.trim()) problems.push("receives empty");
  if (!g.handsTo?.trim()) problems.push("handsTo empty");
  if (problems.length) { console.log(`FAIL  ${k}: ${problems.join("; ")}`); fails++; }
}
if (!fails) console.log("PASS  every guide is fully populated");

console.log(`\n${fails === 0 ? "ALL PASSED" : fails + " FAILURE(S)"}`);
process.exit(fails ? 1 : 0);
