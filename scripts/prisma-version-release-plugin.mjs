/**
 * A local semantic-release plugin that makes the published version track the Prisma version this
 * package targets, instead of an independently-computed semver line.
 *
 * `@prisma/orm-extension-arktype-json` (the reference this package mirrors) is versioned exactly as
 * its Prisma release, e.g. `8.0.0-rc.4` - not an independent history of its own feature/fix commits.
 * A consumer reading the version knows immediately what Prisma release it targets.
 *
 * `@semantic-release/commit-analyzer` still decides whether commit *content* alone would trigger a
 * release (docs/chore/test-only changes still release nothing) - `analyzeCommits` below only adds a
 * second, independent trigger: release whenever the tracked Prisma version changed, even if the
 * commit that changed it was typed in a way commit-analyzer ignores (a plain `chore:` dependency
 * bump, for instance). Whichever trigger fires, `verifyRelease` overwrites the version semver.inc
 * would have produced with the Prisma-tracked one.
 *
 * Own-repo changes shipped without a Prisma version bump (fixing our own bug while still on the same
 * Prisma release) get a trailing counter appended: `8.0.0-rc.4.1`, `.2`, ... This sorts correctly under
 * semver's own rule for prerelease identifiers (rule 11.4.4: a longer, otherwise-equal identifier list
 * has higher precedence), and correctly falls behind whatever comes with the next Prisma bump, since
 * that comparison is decided by the differing `rc.N` identifier before the trailing counter is ever
 * reached.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = join(import.meta.dirname, '..');

function targetPrismaVersion() {
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  const version = pkg.peerDependencies?.['@prisma/orm-target-postgres'];
  if (!version) {
    throw new Error('peerDependencies["@prisma/orm-target-postgres"] not found in package.json');
  }
  return version;
}

export function computeVersion(target, lastVersion) {
  if (!lastVersion) return target;
  if (lastVersion === target) return `${target}.1`;
  if (lastVersion.startsWith(`${target}.`)) {
    const n = Number(lastVersion.slice(target.length + 1));
    if (Number.isInteger(n) && n > 0) return `${target}.${n + 1}`;
  }
  return target;
}

export async function analyzeCommits(pluginConfig, context) {
  const target = targetPrismaVersion();
  const last = context.lastRelease?.version;
  // Still tracking the same Prisma base (exactly, or with a trailing own-fix counter)? Leave the
  // release decision to commit-analyzer alone - don't force one just because a run happened.
  const stillTrackingTarget = last === target || last?.startsWith(`${target}.`);
  return stillTrackingTarget ? null : 'patch';
}

export async function verifyRelease(pluginConfig, context) {
  const target = targetPrismaVersion();
  const version = computeVersion(target, context.lastRelease?.version);

  context.nextRelease.version = version;
  context.nextRelease.gitTag = context.options.tagFormat.replace('${version}', version);
  context.nextRelease.name = context.nextRelease.gitTag;

  context.logger.log(`Overriding computed version with the Prisma-tracked version ${version}`);
}
