import 'dotenv/config';
import { defineConfig } from '@prisma-next/postgres/config';
import { arktypeJsonExtensionDescriptor } from '@prisma-next/extension-arktype-json/control';
import { zodJsonExtensionDescriptor } from 'prisma-next-zod-json/control';

export default defineConfig({
  contract: "./src/prisma/contract.ts",
  extensions: [arktypeJsonExtensionDescriptor, zodJsonExtensionDescriptor],
  db: {
    connection: process.env['DATABASE_URL']!,
  },
});
