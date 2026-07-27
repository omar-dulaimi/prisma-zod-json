import { defineContract } from '@prisma-next/postgres/contract-builder';
import { arktypeJson } from '@prisma-next/extension-arktype-json/column-types';
import arktypeJsonPack from '@prisma-next/extension-arktype-json/pack';
import { zodJson } from 'prisma-next-zod-json/column-types';
import zodJsonPack from 'prisma-next-zod-json/pack';
import { type } from 'arktype';
import { z } from 'zod';

const Prefs = type({ theme: "'light'|'dark'", locale: 'string' });

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
    extensionPacks: {
      arktypeJson: arktypeJsonPack,
      zodJson: zodJsonPack,
    },
    models: {
      Account: model('Account', {
        fields: {
          id: field.id.uuidv7String(),
          email: field.text().unique(),
          prefs: field.column(arktypeJson(Prefs)),
          settings: field.column(zodJson(Settings)),
        },
      }),
    },
  }),
);
