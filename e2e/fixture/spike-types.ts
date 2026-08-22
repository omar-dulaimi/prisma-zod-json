// SPIKE seam two: does the emitted contract.d.ts resolve a user-declared global namespace type,
// and is it a real type (negative controls must fail to compile, which @ts-expect-error enforces:
// an unused @ts-expect-error is itself an error, so an `any`/`unknown` leak fails this file).
import type { Contract, FieldOutputTypes } from './src/prisma/contract.d';

type Prefs = FieldOutputTypes['public']['Account']['prefs'];

const ok: Prefs = { theme: 'dark', tags: ['a'] };

// @ts-expect-error 'neon' is not a member of the theme union
const badTheme: Prefs = { theme: 'neon', tags: [] };

// @ts-expect-error tags is required
const missingTags: Prefs = { theme: 'light' };

// The emitted type and the user's global declaration are the same type, both directions.
const viaNamespace: PrismaJson.Prefs = ok;
const backAgain: Prefs = viaNamespace;

// The settings column (zod-json) is untouched by the spike.
type Settings = FieldOutputTypes['public']['Account']['settings'];
const settings: Settings = { theme: 'light', locale: 'en', notifications: { email: true }, tags: [] };

type ContractStillResolves = Contract['storage'];

export { ok, badTheme, missingTags, viaNamespace, backAgain, settings };
export type { ContractStillResolves };
