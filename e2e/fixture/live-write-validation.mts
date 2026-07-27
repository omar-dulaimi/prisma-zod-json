/**
 * The claim this package makes over validating on read alone: an invalid write is rejected before it
 * reaches the database, naming the offending field.
 *
 * Unit tests cannot prove that — they never go through `contract emit`, the DDL planner or the query
 * path. This does. Exits non-zero on the first broken expectation.
 */
import 'dotenv/config';
import postgres from '@prisma-next/postgres/runtime';
// Registration 3 of 3 — the runtime plane. Without it, constructing the client fails with
// "no contributor registered a codec descriptor for that codecId".
import { zodJsonRuntimeDescriptor } from 'prisma-next-zod-json/runtime';
import contractJson from './src/prisma/contract.json' with { type: 'json' };

type Account = { create(data: unknown): Promise<unknown>; all(): Promise<unknown[]> };

const client = postgres({
  contractJson,
  url: process.env['DATABASE_URL']!,
  extensions: [zodJsonRuntimeDescriptor],
} as never) as never as {
  // Models hang off the namespace facet, not the client root.
  orm: { public: { Account: Account } };
  close(): Promise<void>;
};

const accounts = client.orm.public.Account;

const valid = {
  theme: 'dark',
  locale: 'en-GB',
  notifications: { email: true, digestHour: 9 },
  tags: ['a'],
};

const failures: string[] = [];
let checks = 0;

function record(ok: boolean, detail: string): void {
  checks += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${detail}`);
  if (!ok) failures.push(detail);
}

const idFor = (n: number) => String(n).padStart(36, '0');

async function expectAccepted(label: string, settings: unknown, n: number): Promise<void> {
  try {
    await accounts.create({ id: idFor(n), email: `user${n}@example.test`, settings });
    record(true, label);
  } catch (error) {
    record(false, `${label} — rejected a valid value: ${(error as Error).message.split('\n')[0]}`);
  }
}

/** Rejection alone is not enough: the message must name the path, or the caller cannot act on it. */
async function expectRejectedAt(label: string, settings: unknown, path: string, n: number): Promise<void> {
  try {
    await accounts.create({ id: idFor(n), email: `user${n}@example.test`, settings });
    record(false, `${label} — the write was ACCEPTED; invalid data reached the database`);
  } catch (error) {
    const message = (error as Error).message;
    const named = message.includes(path);
    const onWrite = message.includes('encode');
    record(
      named && onWrite,
      named && onWrite
        ? `${label} — rejected on write, naming \`${path}\``
        : `${label} — rejected, but ${named ? 'not on the write path' : `did not name \`${path}\``}: ${message.split('\n')[0]}`,
    );
  }
}

await expectAccepted('a valid settings object is stored', valid, 1);

await expectRejectedAt('a bad enum member', { ...valid, theme: 'neon' }, 'theme', 2);
await expectRejectedAt(
  'an out-of-range nested integer',
  { ...valid, notifications: { email: true, digestHour: 99 } },
  'notifications.digestHour',
  3,
);
await expectRejectedAt('too many array items', { ...valid, tags: ['1', '2', '3', '4', '5', '6'] }, 'tags', 4);
await expectRejectedAt('a missing required object', { theme: 'dark', locale: 'en' }, 'notifications', 5);
await expectRejectedAt('a too-short string', { ...valid, locale: 'e' }, 'locale', 6);

// Regression: the emitter strips boolean `false` from type params, which once removed
// `additionalProperties: false` from the stored schema and left the column silently accepting — and
// persisting — undeclared keys. Storing the schema as a string fixed it; this keeps it fixed.
await expectRejectedAt('an undeclared key', { ...valid, sneaky: 'value' }, 'sneaky', 7);

// The whole point of validating on write: the rejected rows must not be in the table.
const rows = await accounts.all();
record(rows.length === 1, `exactly one row committed (found ${rows.length}) — rejected writes never landed`);

// And what did land must survive a read, proving decode accepts what encode produced.
const [row] = rows as { settings?: { theme?: string } }[];
record(row?.settings?.theme === 'dark', 'the stored row reads back through decode intact');

await client.close();

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
