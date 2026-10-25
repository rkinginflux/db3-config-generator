import { execFileSync } from 'node:child_process';
import { CANONICAL_MODES, CANONICAL_OBJECT_STORES, generateConfiguration, type StorageEngine } from './config-generator';

// Run the actual shell entry point, not a second copy of its calculations.
describe('shell and web output parity', () => {
  for (const storageEngine of ['pacha-tree', 'parquet'] as StorageEngine[]) {
    for (const mode of CANONICAL_MODES) {
      for (const objectStore of CANONICAL_OBJECT_STORES) {
        it(`${storageEngine} / ${mode} / ${objectStore}`, () => {
          const configuration = generateConfiguration({
            cpus: 16, ramGb: 32, mode, objectStore, storageEngine, includeEnvVars: true
          });
          const output = execFileSync('bash', [
            'influxdb3-config-generator.sh', '--cpus', '16', '--ram', '32',
            '--mode', mode, '--object-store', objectStore, '--storage-engine', storageEngine, '--env-vars'
          ], { encoding: 'utf8' }).replace(/\x1b\[[0-9;]*m/g, '');
          expect(output).toContain(configuration.command);
          expect(output.split('\n').filter((line) => line.startsWith('export '))).toEqual(
            configuration.envVarSections.flatMap((section) => section.lines)
          );
          for (const recommendation of configuration.recommendations) {
            expect(output).toContain(recommendation);
          }
        });
      }
    }
  }
});
