import { defineContract } from '@prisma-next/postgres/contract-builder';
import { zodJson } from 'prisma-next-zod-json/column-types';
import zodJsonPack from 'prisma-next-zod-json/pack';
import { z } from 'zod';

/**
 * Deliberately nests, so the write-validation assertions can check that a failure names its path at
 * more than one depth, `notifications.digestHour`, not just `notifications`.
 */
const Settings = z.object({
  theme: z.enum(['light', 'dark']),
  locale: z.string().min(2),
  notifications: z.object({
    email: z.boolean(),
    digestHour: z.number().int().min(0).max(23).optional(),
  }),
  tags: z.array(z.string()).max(5),
});

export const contract = defineContract(
  {},
  ({ field, model }) => ({
    // Registration 1 of 3: the contract plane. Belongs in the object this callback returns;
    // `defineConfig` accepts an `extensionPacks` key and silently ignores it.
    extensionPacks: {
      zodJson: zodJsonPack,
    },
    models: {
      Account: model('Account', {
        fields: {
          id: field.id.uuidv7String(),
          email: field.text().unique(),
          settings: field.column(zodJson(Settings)),
        },
      }),
    },
  }),
);
