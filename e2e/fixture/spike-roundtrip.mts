// SPIKE seam three: the passthrough codec on a real jsonb column through the real v8 client.
import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import { zodJsonRuntimeDescriptor } from 'prisma-orm-extension-zod-json/runtime';
import type { Contract } from './src/prisma/contract.d';
import contractJson from './src/prisma/contract.json' with { type: 'json' };

const client = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
  extensions: [zodJsonRuntimeDescriptor],
});
const accounts = client.orm.public.Account;

const settings = { theme: 'dark', locale: 'en-GB', notifications: { email: true }, tags: ['a'] };
const run = String(Date.now());
const idFor = (n: number) => `${run}-${n}`.padStart(36, '0').slice(-36);
let failures = 0;
// jsonb canonicalises key order (shorter keys first), so compare structurally, not byte-for-byte.
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}`);
  if (!ok) failures += 1;
};

// 1. A well-typed value round-trips byte-for-byte.
const prefs: PrismaJson.Prefs = { theme: 'dark', digestHour: 9, tags: ['x', 'y'] };
await accounts.create({ id: idFor(1), email: `a.${run}@example.test`, settings, prefs } as never);
const rows = await accounts.all();
const r1 = rows.find((r) => r.id === idFor(1));
check(canon(r1?.prefs) === canon(prefs), 'typed value round-trips unchanged');

// 2. The type is compile-time only: a value the TS type forbids still commits and reads back
//    untouched. That is the PJTG contract (no runtime validation), and the no-behaviour-change
//    guarantee for rows that predate any type annotation.
const untyped = { theme: 'neon', legacy: true };
await accounts.create({ id: idFor(2), email: `b.${run}@example.test`, settings, prefs: untyped } as never);
const r2 = (await accounts.all()).find((r) => r.id === idFor(2));
check(canon(r2?.prefs) === canon(untyped), 'an off-type value passes through with no validation');

// 3. The zod-json column next to it still validates on write (the spike did not disturb it).
let rejected = false;
try {
  await accounts.create({ id: idFor(3), email: `c.${run}@example.test`, settings: { ...settings, theme: 'neon' }, prefs } as never);
} catch (error) {
  rejected = /encode/.test((error as Error).message);
}
check(rejected, 'the neighbouring zod-json column still rejects on write');

await client.close();
console.log(failures === 0 ? '\nseam three: PASS' : `\nseam three: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
