import 'dotenv/config';
import postgres from '@prisma-next/postgres/runtime';
import { zodJsonRuntimeDescriptor } from 'prisma-next-zod-json/runtime';
import { arktypeJsonRuntimeDescriptor } from '@prisma-next/extension-arktype-json/runtime';
import contractJson from './src/prisma/contract.json' with { type: 'json' };

const db = postgres({
  contractJson,
  url: process.env['DATABASE_URL']!,
  extensions: [arktypeJsonRuntimeDescriptor, zodJsonRuntimeDescriptor],
} as never) as never as {
  orm: {
    public: {
      Account: {
        create(a: unknown): Promise<unknown>;
        all(): Promise<unknown[]>;
      };
    };
  };
  close(): Promise<void>;
};

const good = {
  theme: 'dark',
  locale: 'en-GB',
  notifications: { email: true, digestHour: 9 },
  tags: ['a'],
};

const step = async (label: string, fn: () => Promise<unknown>) => {
  try {
    const r = await fn();
    console.log(`${label.padEnd(46)} OK    ${JSON.stringify(r).slice(0, 90)}`);
  } catch (e) {
    console.log(`${label.padEnd(46)} THREW ${(e as Error).message.split('\n')[0].slice(0, 110)}`);
  }
};

await step('write a valid settings object', () =>
  db.orm.public.Account.create({ id: 'a'.repeat(36), email: 'a@b.co', prefs: { theme: 'dark', locale: 'en' }, settings: good }));

await step('write a bad enum member (theme: "neon")', () =>
  db.orm.public.Account.create({ id: 'b'.repeat(36), email: 'b@b.co', prefs: { theme: 'dark', locale: 'en' }, settings: { ...good, theme: 'neon' } }));

await step('write digestHour out of range (99)', () =>
  db.orm.public.Account.create({ id: 'c'.repeat(36), email: 'c@b.co', prefs: { theme: 'dark', locale: 'en' }, settings: { ...good, notifications: { email: true, digestHour: 99 } } }));

await step('write too many tags (6 > max 5)', () =>
  db.orm.public.Account.create({ id: 'd'.repeat(36), email: 'd@b.co', prefs: { theme: 'dark', locale: 'en' }, settings: { ...good, tags: ['1','2','3','4','5','6'] } }));

await step('write a missing required field', () =>
  db.orm.public.Account.create({ id: 'e'.repeat(36), email: 'e@b.co', prefs: { theme: 'dark', locale: 'en' }, settings: { theme: 'dark', locale: 'en' } }));

await step('read back', () => db.orm.public.Account.all());

await db.close();
