// SPIKE seam four, runtime half: the PSL-emitted contract through the real client.
import postgres from '@prisma/orm-postgres/runtime';
import { zodJsonRuntimeDescriptor } from 'prisma-orm-extension-zod-json/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

const client = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
  extensions: [zodJsonRuntimeDescriptor],
});

const prefs: PrismaJson.Prefs = { theme: 'light', tags: ['psl'] };
const id = crypto.randomUUID();
await client.orm.public.Account.create({ id, email: `${id}@example.test`, prefs } as never);
const row = (await client.orm.public.Account.all()).find((r) => r.id === id);

// Both the emitted type and the value agree: `theme` narrows to the union from the global namespace.
const theme: 'light' | 'dark' | undefined = row?.prefs.theme;
await client.close();

const ok = theme === 'light' && row?.prefs.tags[0] === 'psl';
console.log(ok ? 'seam four runtime: PASS' : `seam four runtime: FAIL ${JSON.stringify(row)}`);
process.exit(ok ? 0 : 1);
