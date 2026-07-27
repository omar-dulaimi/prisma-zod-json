import 'dotenv/config';
import { defineConfig } from '@prisma-next/postgres/config';
import { zodJsonExtensionDescriptor } from 'prisma-next-zod-json/control';

export default defineConfig({
  contract: './src/prisma/contract.ts',
  // Registration 2 of 3: the control plane. Without it, `db init` fails with
  // "no expandNativeType hook is registered for codecId zod/json@1".
  extensions: [zodJsonExtensionDescriptor],
  db: {
    connection: process.env['DATABASE_URL']!,
  },
});
