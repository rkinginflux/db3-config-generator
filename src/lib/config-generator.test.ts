import {
  buildQuickReference,
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
        '  --datafusion-num-threads=12 \\',
        '  --exec-mem-pool-bytes=90% \\',
        '  --parquet-mem-cache-size=4GB \\',
        '  --checkpoint-interval=1h \\',
        '  --wal-replay-concurrency-limit=16 \\',
        '  --force-snapshot-mem-threshold=60% \\',
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
    expect(configuration.command).not.toContain('--parquet-mem-cache-size');
    expect(configuration.envVarSections.find((section) => section.title === 'Memory configuration')?.lines).toEqual([
      'export INFLUXDB3_EXEC_MEM_POOL_BYTES=75%',
      'export INFLUXDB3_FORCE_SNAPSHOT_MEM_THRESHOLD=40%'
    ]);
  });

  it('adds compaction and process specific sections only when required', () => {
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

    expect(compactConfiguration.command).toContain('--compaction-gen2-duration=24h');
    expect(compactConfiguration.envVarSections.some((section) => section.title === 'Compaction settings')).toBe(true);
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
