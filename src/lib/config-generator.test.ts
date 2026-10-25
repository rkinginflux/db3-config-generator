import {
  buildQuickReference,
  buildRecommendations,
  CANONICAL_MODES,
  calculateThreads,
  generateConfiguration,
  normalizeMode,
  normalizeObjectStore
} from './config-generator';

describe('normalizeMode', () => {
  it('normalizes supported aliases', () => {
    expect(normalizeMode('ingest-query')).toBe('ingest,query');
    expect(normalizeMode('ingest_query')).toBe('ingest,query');
    expect(normalizeMode('query-compact')).toBe('query,compact');
    expect(normalizeMode('query_compact')).toBe('query,compact');
  });
});

describe('normalizeObjectStore', () => {
  it('normalizes gcs to google', () => {
    expect(normalizeObjectStore('gcs')).toBe('google');
    expect(normalizeObjectStore('google')).toBe('google');
  });
});

describe('generateConfiguration', () => {
  it('explains single-node all mode and the legacy single-compactor restriction', () => {
    expect(buildRecommendations('all').join(' ')).toContain('single-node');
    const legacy = buildRecommendations('compact', 'parquet').join(' ');
    expect(legacy).toContain('only one running compactor');
    expect(legacy).not.toContain('add nodes');
  });

  it('keeps upgraded-engine guidance free of legacy and removed tuning flags', () => {
    for (const mode of CANONICAL_MODES) {
      const guidance = buildRecommendations(mode).join(' ');
      expect(guidance).not.toMatch(/checkpoint|--wal-max-write-buffer-size|--parquet-mem-cache-size|--compaction-multipliers|--compaction-max-num-files-per-plan/);
      expect(guidance).toContain('heuristics');
    }
    expect(buildRecommendations('ingest').join(' ')).toContain('--wal-buffer-size');
    expect(buildRecommendations('compact').join(' ')).toContain('--compactor-input-size-budget');
  });

  it('retains legacy-only settings only when the Parquet engine is selected', () => {
    const configuration = generateConfiguration({
      cpus: 16, ramGb: 32, mode: 'query,compact', objectStore: 'file',
      includeEnvVars: true, storageEngine: 'parquet'
    });
    expect(configuration.inputs.storageEngine).toBe('parquet');
    expect(configuration.command).toContain('--checkpoint-interval=1h');
    expect(configuration.command).toContain('--wal-replay-concurrency-limit=16');
    expect(configuration.command).toContain('--force-snapshot-mem-size=60%');
    expect(configuration.command).toContain('--compaction-gen2-duration=24h');
    const lines = configuration.envVarSections.flatMap((section) => section.lines);
    expect(lines).toContain('export INFLUXDB3_FORCE_SNAPSHOT_MEM_SIZE=60%');
    expect(lines).toContain('export INFLUXDB3_COMPACTION_GEN2_DURATION=24h');
    expect(lines).toContain('export INFLUXDB3_COMPACTION_CHECK_INTERVAL=5m');
    expect(configuration.recommendations.join(' ')).toContain('checkpoint');
  });

  it('uses canonical environment names for identity, runtime, licensing, and local storage', () => {
    const configuration = generateConfiguration({
      cpus: 16, ramGb: 32, mode: 'all', objectStore: 'file', includeEnvVars: true
    });
    const lines = configuration.envVarSections.flatMap((section) => section.lines);
    expect(lines).toContain('export INFLUXDB3_MODE=all');
    expect(lines).toContain('export INFLUXDB3_NODE_ID=<YOUR_NODE_ID>');
    expect(lines).toContain('export INFLUXDB3_CLUSTER_ID=<YOUR_CLUSTER_ID>');
    expect(lines).toContain('export INFLUXDB3_NUM_DATAFUSION_THREADS=13');
    expect(lines).toContain('export INFLUXDB3_LICENSE_EMAIL=<YOUR_EMAIL>');
    expect(lines).toContain('export INFLUXDB3_DATA_DIR=/var/lib/influxdb3');
  });

  it('clamps minimum CPU and RAM and reports warnings', () => {
    const configuration = generateConfiguration({
      cpus: 1,
      ramGb: 1,
      mode: 'query',
      objectStore: 'file',
      includeEnvVars: true
    });

    expect(configuration.inputs.cpus).toBe(2);
    expect(configuration.inputs.ramGb).toBe(2);
    expect(configuration.warnings.map((warning) => warning.message)).toEqual([
      'Minimum 2 CPUs required. The value was clamped to 2.',
      'Minimum 2GB RAM recommended. The value was clamped to 2GB.'
    ]);
  });

  it('matches the query + google sample output structure', () => {
    const configuration = generateConfiguration({
      cpus: 16,
      ramGb: 32,
      mode: 'query',
      objectStore: 'google',
      includeEnvVars: true
    });

    expect(configuration.command).toBe(
      [
        'influxdb3 --num-io-threads=4 serve \\',
        '  --mode=query \\',
        '  --node-id=<YOUR_NODE_ID> \\',
        '  --cluster-id=<YOUR_CLUSTER_ID> \\',
        '  --object-store=google \\',
        '  --bucket=<YOUR_BUCKET> \\',
        '  --google-service-account=<PATH_TO_CREDENTIALS> \\',
        '  --num-datafusion-threads=12 \\',
        '  --exec-mem-pool-size=90% \\',
        '  --file-cache-size=4GB \\',
        '  --object-store-connection-limit=48 \\',
        '  --license-email=<YOUR_EMAIL>'
      ].join('\n')
    );

    expect(configuration.envVarSections.find((section) => section.title === 'Object store')?.lines).toEqual([
      'export INFLUXDB3_OBJECT_STORE=google',
      'export INFLUXDB3_BUCKET=<YOUR_BUCKET>',
      'export GOOGLE_SERVICE_ACCOUNT=<PATH_TO_CREDENTIALS>',
      'export INFLUXDB3_OBJECT_STORE_CONNECTION_LIMIT=48'
    ]);
  });

  it('omits parquet cache for low-memory ingest-query file nodes', () => {
    const configuration = generateConfiguration({
      cpus: 6,
      ramGb: 8,
      mode: 'ingest-query',
      objectStore: 'file',
      includeEnvVars: true
    });

    expect(configuration.inputs.mode).toBe('ingest,query');
    expect(configuration.command).not.toContain('--file-cache-size');
    expect(configuration.envVarSections.find((section) => section.title === 'Memory configuration')?.lines).toEqual([
      'export INFLUXDB3_EXEC_MEM_POOL_SIZE=75%'
    ]);
  });

  it('omits legacy compaction settings but keeps processing settings on new clusters', () => {
    const compactConfiguration = generateConfiguration({
      cpus: 12,
      ramGb: 64,
      mode: 'query,compact',
      objectStore: 's3',
      includeEnvVars: true
    });
    const processConfiguration = generateConfiguration({
      cpus: 12,
      ramGb: 64,
      mode: 'process',
      objectStore: 'azure',
      includeEnvVars: true
    });

    expect(compactConfiguration.command).not.toContain('--compaction-gen2-duration');
    expect(compactConfiguration.envVarSections.some((section) => section.title === 'Compaction settings')).toBe(false);
    expect(processConfiguration.command).toContain('--plugin-dir=/var/lib/influxdb3/plugins');
    expect(processConfiguration.envVarSections.some((section) => section.title === 'Processing engine')).toBe(true);
  });
});

describe('buildQuickReference', () => {
  it('matches the shell calculations for 16 CPUs and 32GB RAM', () => {
    expect(buildQuickReference(16, 32)).toEqual([
      { mode: 'all', ioThreads: 3, datafusionThreads: 13, memPoolPercent: '70%', cache: '3GB' },
      { mode: 'ingest', ioThreads: 5, datafusionThreads: 11, memPoolPercent: '60%', cache: '-' },
      { mode: 'query', ioThreads: 4, datafusionThreads: 12, memPoolPercent: '90%', cache: '4GB' },
      { mode: 'compact', ioThreads: 2, datafusionThreads: 14, memPoolPercent: '80%', cache: '-' },
      { mode: 'process', ioThreads: 4, datafusionThreads: 12, memPoolPercent: '70%', cache: '3GB' },
      { mode: 'ingest,query', ioThreads: 4, datafusionThreads: 12, memPoolPercent: '75%', cache: '3GB' },
      { mode: 'query,compact', ioThreads: 4, datafusionThreads: 12, memPoolPercent: '85%', cache: '3GB' }
    ]);
  });

  it('respects the query minimum parquet cache floor', () => {
    expect(calculateThreads('query', 2, 2).parquetCacheGb).toBe(1);
  });
});
