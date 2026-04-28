export const CANONICAL_MODES = [
  'all',
  'ingest',
  'query',
  'compact',
  'process',
  'ingest,query',
  'query,compact'
] as const;

export const CANONICAL_OBJECT_STORES = ['file', 's3', 'google', 'azure'] as const;

export type CanonicalMode = (typeof CANONICAL_MODES)[number];
export type ModeInput = CanonicalMode | 'ingest-query' | 'ingest_query' | 'query-compact' | 'query_compact';
export type CanonicalObjectStore = (typeof CANONICAL_OBJECT_STORES)[number];
export type ObjectStoreInput = CanonicalObjectStore | 'gcs';

export interface GeneratorInput {
  cpus: number;
  ramGb: number;
  mode: ModeInput;
  objectStore: ObjectStoreInput;
  includeEnvVars: boolean;
}

export interface GeneratorWarning {
  field: 'cpus' | 'ramGb';
  message: string;
}

export interface ThreadAllocation {
  ioThreads: number;
  datafusionThreads: number;
  memPoolPercent: number;
  parquetCacheGb: number;
  description: string;
}

export interface AdditionalSettings {
  walReplayConcurrency: number;
  snapshotMemThreshold: string;
  objectStoreConnections: number;
}

export interface SummaryMetric {
  label: string;
  value: string;
  note?: string;
}

export interface EnvVarSection {
  title: string;
  lines: string[];
}

export interface QuickReferenceRow {
  mode: CanonicalMode;
  ioThreads: number;
  datafusionThreads: number;
  memPoolPercent: string;
  cache: string;
}

export interface GeneratedConfiguration {
  inputs: {
    requestedCpus: number;
    requestedRamGb: number;
    cpus: number;
    ramGb: number;
    mode: CanonicalMode;
    objectStore: CanonicalObjectStore;
    includeEnvVars: boolean;
  };
  warnings: GeneratorWarning[];
  summary: SummaryMetric[];
  command: string;
  envVarSections: EnvVarSection[];
  recommendations: string[];
  quickReference: QuickReferenceRow[];
}

export function normalizeMode(mode: ModeInput): CanonicalMode {
  if (mode === 'ingest-query' || mode === 'ingest_query') {
    return 'ingest,query';
  }

  if (mode === 'query-compact' || mode === 'query_compact') {
    return 'query,compact';
  }

  if (
    mode === 'all' ||
    mode === 'ingest' ||
    mode === 'query' ||
    mode === 'compact' ||
    mode === 'process' ||
    mode === 'ingest,query' ||
    mode === 'query,compact'
  ) {
    return mode;
  }

  return 'ingest,query';
}

export function normalizeObjectStore(objectStore: ObjectStoreInput): CanonicalObjectStore {
  if (objectStore === 'gcs') {
    return 'google';
  }

  if (
    objectStore === 'file' ||
    objectStore === 's3' ||
    objectStore === 'google' ||
    objectStore === 'azure'
  ) {
    return objectStore;
  }

  return 'file';
}

export function clampResources(cpus: number, ramGb: number): {
  cpus: number;
  ramGb: number;
  warnings: GeneratorWarning[];
} {
  const warnings: GeneratorWarning[] = [];
  let normalizedCpus = Math.floor(cpus);
  let normalizedRamGb = Math.floor(ramGb);

  if (normalizedCpus < 2) {
    warnings.push({ field: 'cpus', message: 'Minimum 2 CPUs required. The value was clamped to 2.' });
    normalizedCpus = 2;
  }

  if (normalizedRamGb < 2) {
    warnings.push({ field: 'ramGb', message: 'Minimum 2GB RAM recommended. The value was clamped to 2GB.' });
    normalizedRamGb = 2;
  }

  return {
    cpus: normalizedCpus,
    ramGb: normalizedRamGb,
    warnings
  };
}

export function calculateThreads(mode: CanonicalMode, cpus: number, ramGb: number): ThreadAllocation {
  let ioThreads = 2;
  let datafusionThreads = cpus - 2;
  let memPoolPercent = 70;
  let parquetCacheGb = 0;
  let description = '';

  switch (mode) {
    case 'ingest': {
      ioThreads = Math.floor((cpus * 35) / 100);
      if (ioThreads < 4) {
        ioThreads = 4;
      }
      if (ioThreads > 20) {
        ioThreads = 20;
      }

      datafusionThreads = cpus - ioThreads;
      if (datafusionThreads < 2) {
        datafusionThreads = 2;
      }

      memPoolPercent = 60;
      parquetCacheGb = 0;
      description = 'Optimized for high-throughput data ingestion';
      break;
    }

    case 'query': {
      ioThreads = cpus < 8 ? 2 : 4;
      datafusionThreads = cpus - ioThreads;
      memPoolPercent = 90;
      parquetCacheGb = Math.floor((ramGb * 15) / 100);
      if (parquetCacheGb > 16) {
        parquetCacheGb = 16;
      }
      if (parquetCacheGb < 1) {
        parquetCacheGb = 1;
      }
      description = 'Optimized for analytical query execution';
      break;
    }

    case 'compact': {
      ioThreads = 2;
      datafusionThreads = cpus - ioThreads;
      memPoolPercent = 80;
      parquetCacheGb = 0;
      description = 'Optimized for background compaction';
      break;
    }

    case 'process': {
      ioThreads = Math.floor((cpus * 25) / 100);
      if (ioThreads < 2) {
        ioThreads = 2;
      }
      if (ioThreads > 8) {
        ioThreads = 8;
      }

      datafusionThreads = cpus - ioThreads;
      memPoolPercent = 70;
      parquetCacheGb = Math.floor((ramGb * 10) / 100);
      if (parquetCacheGb > 8) {
        parquetCacheGb = 8;
      }
      description = 'Optimized for data processing with plugins';
      break;
    }

    case 'ingest,query': {
      ioThreads = Math.floor((cpus * 25) / 100);
      if (ioThreads < 4) {
        ioThreads = 4;
      }
      if (ioThreads > 16) {
        ioThreads = 16;
      }

      datafusionThreads = cpus - ioThreads;
      memPoolPercent = 75;
      parquetCacheGb = Math.floor((ramGb * 10) / 100);
      if (parquetCacheGb > 8) {
        parquetCacheGb = 8;
      }
      description = 'Balanced for combined ingest and query workloads';
      break;
    }

    case 'query,compact': {
      ioThreads = cpus < 8 ? 2 : 4;
      datafusionThreads = cpus - ioThreads;
      memPoolPercent = 85;
      parquetCacheGb = Math.floor((ramGb * 12) / 100);
      if (parquetCacheGb > 12) {
        parquetCacheGb = 12;
      }
      description = 'Optimized for query and compaction workloads';
      break;
    }

    case 'all':
    default: {
      ioThreads = Math.floor((cpus * 20) / 100);
      if (ioThreads < 2) {
        ioThreads = 2;
      }
      if (ioThreads > 12) {
        ioThreads = 12;
      }

      datafusionThreads = cpus - ioThreads;
      memPoolPercent = 70;
      parquetCacheGb = Math.floor((ramGb * 10) / 100);
      if (parquetCacheGb > 8) {
        parquetCacheGb = 8;
      }
      description = 'Balanced for all workloads (ingest, query, compact, process)';
      break;
    }
  }

  if (ioThreads < 1) {
    ioThreads = 1;
  }

  if (datafusionThreads < 1) {
    datafusionThreads = 1;
  }

  return {
    ioThreads,
    datafusionThreads,
    memPoolPercent,
    parquetCacheGb,
    description
  };
}

export function calculateAdditionalSettings(mode: CanonicalMode, ramGb: number): AdditionalSettings {
  let walReplayConcurrency = 8;
  let snapshotMemThreshold = '40%';

  if (ramGb >= 64) {
    walReplayConcurrency = 20;
    snapshotMemThreshold = '70%';
  } else if (ramGb >= 32) {
    walReplayConcurrency = 16;
    snapshotMemThreshold = '60%';
  } else if (ramGb >= 16) {
    walReplayConcurrency = 12;
    snapshotMemThreshold = '50%';
  }

  let objectStoreConnections = 32;
  switch (mode) {
    case 'ingest':
    case 'ingest,query':
      objectStoreConnections = 32;
      break;
    case 'query':
      objectStoreConnections = 48;
      break;
    case 'compact':
      objectStoreConnections = 24;
      break;
    default:
      objectStoreConnections = 32;
      break;
  }

  return {
    walReplayConcurrency,
    snapshotMemThreshold,
    objectStoreConnections
  };
}

function buildObjectStoreCommandLines(objectStore: CanonicalObjectStore): string[] {
  switch (objectStore) {
    case 's3':
      return [
        '--object-store=s3',
        '--bucket=<YOUR_BUCKET>',
        '--aws-default-region=<YOUR_REGION>'
      ];
    case 'google':
      return [
        '--object-store=google',
        '--bucket=<YOUR_BUCKET>',
        '--google-service-account=<PATH_TO_CREDENTIALS>'
      ];
    case 'azure':
      return [
        '--object-store=azure',
        '--bucket=<YOUR_CONTAINER>',
        '--azure-storage-account=<YOUR_ACCOUNT>'
      ];
    case 'file':
    default:
      return ['--object-store=file', '--data-dir=/var/lib/influxdb3'];
  }
}

function buildObjectStoreEnvLines(objectStore: CanonicalObjectStore): string[] {
  switch (objectStore) {
    case 's3':
      return [
        'export INFLUXDB3_OBJECT_STORE=s3',
        'export INFLUXDB3_BUCKET=<YOUR_BUCKET>',
        'export AWS_DEFAULT_REGION=<YOUR_REGION>',
        'export AWS_ACCESS_KEY_ID=<YOUR_ACCESS_KEY>',
        'export AWS_SECRET_ACCESS_KEY=<YOUR_SECRET_KEY>'
      ];
    case 'google':
      return [
        'export INFLUXDB3_OBJECT_STORE=google',
        'export INFLUXDB3_BUCKET=<YOUR_BUCKET>',
        'export GOOGLE_SERVICE_ACCOUNT=<PATH_TO_CREDENTIALS>'
      ];
    case 'azure':
      return [
        'export INFLUXDB3_OBJECT_STORE=azure',
        'export INFLUXDB3_BUCKET=<YOUR_CONTAINER>',
        'export AZURE_STORAGE_ACCOUNT=<YOUR_ACCOUNT>',
        'export AZURE_STORAGE_ACCESS_KEY=<YOUR_KEY>'
      ];
    case 'file':
    default:
      return ['export INFLUXDB3_OBJECT_STORE=file', 'export INFLUXDB3_DB_DIR=/var/lib/influxdb3'];
  }
}

export function buildCommand(
  mode: CanonicalMode,
  objectStore: CanonicalObjectStore,
  threads: ThreadAllocation,
  additional: AdditionalSettings
): string {
  const lines = [
    `influxdb3 --num-io-threads=${threads.ioThreads} serve`,
    `--mode=${mode}`,
    '--node-id=<YOUR_NODE_ID>',
    '--cluster-id=<YOUR_CLUSTER_ID>',
    ...buildObjectStoreCommandLines(objectStore),
    `--datafusion-num-threads=${threads.datafusionThreads}`,
    `--exec-mem-pool-bytes=${threads.memPoolPercent}%`
  ];

  if (threads.parquetCacheGb > 0) {
    lines.push(`--parquet-mem-cache-size=${threads.parquetCacheGb}GB`);
  }

  lines.push(
    '--checkpoint-interval=1h',
    `--wal-replay-concurrency-limit=${additional.walReplayConcurrency}`,
    `--force-snapshot-mem-threshold=${additional.snapshotMemThreshold}`,
    `--object-store-connection-limit=${additional.objectStoreConnections}`
  );

  if (mode === 'compact' || mode === 'query,compact') {
    lines.push('--compaction-gen2-duration=24h', '--compaction-check-interval=5m');
  }

  if (mode === 'process') {
    lines.push('--plugin-dir=/var/lib/influxdb3/plugins');
  }

  lines.push('--license-email=<YOUR_EMAIL>');

  return lines
    .map((line, index) => `${index === 0 ? line : `  ${line}`}${index === lines.length - 1 ? '' : ' \\'}`)
    .join('\n');
}

export function buildEnvVarSections(
  mode: CanonicalMode,
  objectStore: CanonicalObjectStore,
  threads: ThreadAllocation,
  additional: AdditionalSettings
): EnvVarSection[] {
  const sections: EnvVarSection[] = [
    {
      title: 'Thread configuration',
      lines: [
        `export INFLUXDB3_NUM_IO_THREADS=${threads.ioThreads}`,
        `export INFLUXDB3_DATAFUSION_NUM_THREADS=${threads.datafusionThreads}`
      ]
    },
    {
      title: 'Mode and identity',
      lines: [
        `export INFLUXDB3_ENTERPRISE_MODE=${mode}`,
        'export INFLUXDB3_NODE_IDENTIFIER_PREFIX=<YOUR_NODE_ID>',
        'export INFLUXDB3_ENTERPRISE_CLUSTER_ID=<YOUR_CLUSTER_ID>'
      ]
    },
    {
      title: 'Memory configuration',
      lines: [
        `export INFLUXDB3_EXEC_MEM_POOL_BYTES=${threads.memPoolPercent}%`,
        ...(threads.parquetCacheGb > 0 ? [`export INFLUXDB3_PARQUET_MEM_CACHE_SIZE=${threads.parquetCacheGb}GB`] : []),
        `export INFLUXDB3_FORCE_SNAPSHOT_MEM_THRESHOLD=${additional.snapshotMemThreshold}`
      ]
    },
    {
      title: 'Startup optimization',
      lines: [
        'export INFLUXDB3_CHECKPOINT_INTERVAL=1h',
        `export INFLUXDB3_WAL_REPLAY_CONCURRENCY_LIMIT=${additional.walReplayConcurrency}`
      ]
    },
    {
      title: 'Object store',
      lines: [
        ...buildObjectStoreEnvLines(objectStore),
        `export INFLUXDB3_OBJECT_STORE_CONNECTION_LIMIT=${additional.objectStoreConnections}`
      ]
    },
    {
      title: 'Licensing',
      lines: ['export INFLUXDB3_ENTERPRISE_LICENSE_EMAIL=<YOUR_EMAIL>']
    }
  ];

  if (mode.includes('compact')) {
    sections.push({
      title: 'Compaction settings',
      lines: [
        'export INFLUXDB3_ENTERPRISE_COMPACTION_GEN2_DURATION=24h',
        'export INFLUXDB3_ENTERPRISE_COMPACTION_CHECK_INTERVAL=5m'
      ]
    });
  }

  if (mode === 'process') {
    sections.push({
      title: 'Processing engine',
      lines: ['export INFLUXDB3_PLUGIN_DIR=/var/lib/influxdb3/plugins']
    });
  }

  return sections;
}

export function buildRecommendations(mode: CanonicalMode): string[] {
  const specific: Record<CanonicalMode | 'default', string[]> = {
    all: [
      'Monitor all workloads and consider specializing nodes if needed',
      'Enable checkpointing for faster restarts',
      'Adjust thread allocation based on observed workload patterns'
    ],
    ingest: [
      'Scale IO threads with concurrent writers (~1 thread per writer)',
      'Monitor WAL size and adjust --wal-flush-interval if needed',
      'Consider --wal-max-write-buffer-size for high-throughput scenarios'
    ],
    query: [
      'Increase --parquet-mem-cache-size for frequently accessed data',
      'Use --datafusion-config for advanced query tuning',
      'Monitor query latency and adjust memory pool as needed'
    ],
    compact: [
      'Adjust --compaction-multipliers for your data patterns',
      'Monitor compaction lag and add nodes if falling behind',
      'Consider --compaction-max-num-files-per-plan for large datasets'
    ],
    process: [
      'Ensure --plugin-dir contains your Python plugins',
      'Configure --virtual-env-location for dependencies',
      'Monitor plugin execution times and resource usage'
    ],
    'ingest,query': [
      'Monitor all workloads and consider specializing nodes if needed',
      'Enable checkpointing for faster restarts',
      'Adjust thread allocation based on observed workload patterns'
    ],
    'query,compact': [
      'Monitor all workloads and consider specializing nodes if needed',
      'Enable checkpointing for faster restarts',
      'Adjust thread allocation based on observed workload patterns'
    ],
    default: [
      'Monitor all workloads and consider specializing nodes if needed',
      'Enable checkpointing for faster restarts',
      'Adjust thread allocation based on observed workload patterns'
    ]
  };

  return [
    ...(specific[mode] ?? specific.default),
    'Always test configuration changes in a non-production environment',
    'Monitor metrics endpoint at /metrics for performance insights',
    'Use --log-filter for debugging specific components'
  ];
}

export function buildQuickReference(cpus: number, ramGb: number): QuickReferenceRow[] {
  return CANONICAL_MODES.map((mode) => {
    const threads = calculateThreads(mode, cpus, ramGb);

    return {
      mode,
      ioThreads: threads.ioThreads,
      datafusionThreads: threads.datafusionThreads,
      memPoolPercent: `${threads.memPoolPercent}%`,
      cache: threads.parquetCacheGb === 0 ? '-' : `${threads.parquetCacheGb}GB`
    };
  });
}

export function generateConfiguration(input: GeneratorInput): GeneratedConfiguration {
  const mode = normalizeMode(input.mode);
  const objectStore = normalizeObjectStore(input.objectStore);
  const clamped = clampResources(input.cpus, input.ramGb);
  const threads = calculateThreads(mode, clamped.cpus, clamped.ramGb);
  const additional = calculateAdditionalSettings(mode, clamped.ramGb);

  return {
    inputs: {
      requestedCpus: input.cpus,
      requestedRamGb: input.ramGb,
      cpus: clamped.cpus,
      ramGb: clamped.ramGb,
      mode,
      objectStore,
      includeEnvVars: input.includeEnvVars
    },
    warnings: clamped.warnings,
    summary: [
      { label: 'CPU cores', value: String(clamped.cpus), note: 'Explicit user input only' },
      { label: 'RAM', value: `${clamped.ramGb}GB`, note: 'No host auto-detection' },
      { label: 'Mode', value: mode, note: threads.description },
      { label: 'Object store', value: objectStore },
      { label: 'IO threads', value: String(threads.ioThreads), note: 'HTTP requests and line protocol parsing' },
      {
        label: 'DataFusion threads',
        value: String(threads.datafusionThreads),
        note: 'Queries, snapshots, and compaction'
      },
      { label: 'Exec memory pool', value: `${threads.memPoolPercent}%` },
      { label: 'Parquet cache', value: threads.parquetCacheGb > 0 ? `${threads.parquetCacheGb}GB` : '-' },
      { label: 'WAL replay concurrency', value: String(additional.walReplayConcurrency) },
      { label: 'Snapshot threshold', value: additional.snapshotMemThreshold },
      { label: 'Object store connections', value: String(additional.objectStoreConnections) }
    ],
    command: buildCommand(mode, objectStore, threads, additional),
    envVarSections: input.includeEnvVars ? buildEnvVarSections(mode, objectStore, threads, additional) : [],
    recommendations: buildRecommendations(mode),
    quickReference: buildQuickReference(clamped.cpus, clamped.ramGb)
  };
}
