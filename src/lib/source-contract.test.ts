import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_MODES, CANONICAL_OBJECT_STORES, generateConfiguration, type StorageEngine } from './config-generator';

// The Enterprise source is not vendored or fetched by this public project.
// Opt in with INFLUXDB3_SOURCE_DIR=/path/to/influxdb_pro npm test.
const sourceDir = process.env.INFLUXDB3_SOURCE_DIR;
describe.skipIf(!sourceDir)('local InfluxDB 3 CLI contract', () => {
  it('emits only documented canonical flags and environment names', () => {
    const help = readFileSync(join(sourceDir!, 'ent/influxdb3/src/help/serve_all.txt'), 'utf8');
    const runtime = readFileSync(join(sourceDir!, 'ent/influxdb3_clap_blocks/src/tokio.rs'), 'utf8');
    const objectStore = readFileSync(join(sourceDir!, 'oss/influxdb3_clap_blocks/src/object_store.rs'), 'utf8');
    const flags = new Set([
      ...Array.from(help.matchAll(/^\s+--([a-z0-9-]+)/gm), (match) => match[1]),
      ...Array.from(runtime.matchAll(/num_threads_arg = "([^"]+)"/g), (match) => match[1])
    ]);
    const envNames = new Set([
      ...Array.from(help.matchAll(/\[env: ([A-Z0-9_]+)=/g), (match) => match[1]),
      ...Array.from(objectStore.matchAll(/env = "([^"]+)"/g), (match) => match[1]),
      ...Array.from(runtime.matchAll(/num_threads_env = "([^"]+)"/g), (match) => match[1])
    ]);
    for (const storageEngine of ['pacha-tree', 'parquet'] as StorageEngine[]) {
      for (const mode of CANONICAL_MODES) {
        for (const objectStore of CANONICAL_OBJECT_STORES) {
          const configuration = generateConfiguration({
            cpus: 16, ramGb: 32, mode, objectStore, storageEngine, includeEnvVars: true
          });
          const text = [configuration.command, ...configuration.recommendations].join('\n');
          for (const match of text.matchAll(/--([a-z0-9-]+)/g)) {
            // This hidden Parquet count knob is intentionally absent from help-all.
            if (match[1] === 'wal-max-buffered-writes') {
              const serve = readFileSync(join(sourceDir!, 'ent/influxdb3/src/commands/serve.rs'), 'utf8');
              expect(serve).toContain('long = "wal-max-buffered-writes"');
            } else {
              expect(flags.has(match[1]), `Unknown/deprecated flag: ${match[1]}`).toBe(true);
            }
          }
          for (const line of configuration.envVarSections.flatMap((section) => section.lines)) {
            const name = line.match(/^export ([A-Z0-9_]+)=/)![1];
            expect(envNames.has(name), `Unknown/deprecated env: ${name}`).toBe(true);
          }
        }
      }
    }
  });
});
