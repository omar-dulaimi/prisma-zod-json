/**
 * Asserts that `contract emit` carried the codec into both contract planes, with the schema intact.
 *
 * Run against the fixture's emitted `contract.json`. Guards the transport bugs that a passing unit
 * suite missed: the emitter walks type params and drops boolean `false`, which once silently stripped
 * `additionalProperties: false` out of the stored schema.
 */
import { readFileSync } from 'node:fs';

const contract = JSON.parse(readFileSync('./src/prisma/contract.json', 'utf8'));

const problems = [];
const check = (ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${detail}`);
  if (!ok) problems.push(detail);
};

const domainField = contract.domain?.namespaces?.public?.models?.Account?.fields?.settings;
check(domainField?.type?.codecId === 'zod/json@1', 'the domain plane records codecId zod/json@1');

const tables = contract.storage?.namespaces?.public?.entries?.table ?? {};
const table = tables[Object.keys(tables)[0]];
const column = table?.columns?.settings;

check(column?.codecId === 'zod/json@1', 'the storage plane records codecId zod/json@1');
check(column?.nativeType === 'jsonb', 'the column is backed by jsonb');

const params = column?.typeParams ?? {};
check(params.version === 1, `type params carry version 1 (got ${params.version})`);
check(
  typeof params.jsonSchema === 'string',
  `the schema is stored as an opaque string, beyond reach of the emitter's walk (got ${typeof params.jsonSchema})`,
);

let schema;
try {
  schema = JSON.parse(params.jsonSchema);
} catch {
  check(false, 'the stored schema parses as JSON');
}

if (schema) {
  check(schema.type === 'object', 'the stored schema survived as an object schema');
  check(
    schema.additionalProperties === false,
    'additionalProperties: false survived — the column still rejects undeclared keys',
  );
  check(
    schema.properties?.notifications?.properties?.digestHour?.maximum === 23,
    'a nested numeric bound survived the round trip',
  );
  check(
    Array.isArray(schema.properties?.theme?.enum) && schema.properties.theme.enum.length === 2,
    'the enum survived with both members',
  );
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) in the emitted contract.`);
  process.exit(1);
}
console.log('\nThe emitted contract carries the codec on both planes, schema intact.');
