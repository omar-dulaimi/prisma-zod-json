import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { zodJsonExtensionDescriptor } from 'prisma-orm-extension-zod-json/control';

export default definePrismaConfig({
  orm: ormConfig({
    contract: './src/prisma/contract.ts',
    // Registration 2 of 3: the control plane. Without it, `db init` fails with
    // "no expandNativeType hook is registered for codecId zod/json@1".
    extensions: [zodJsonExtensionDescriptor],
    db: {
      connection: process.env['DATABASE_URL']!,
    },
  }),
});
