import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { zodJsonExtensionDescriptor } from 'prisma-orm-extension-zod-json/control';

export default definePrismaConfig({
  orm: ormConfig({
    contract: './psl/contract.prisma',
    extensions: [zodJsonExtensionDescriptor],
    db: {
      connection: process.env['DATABASE_URL']!,
    },
  }),
});
