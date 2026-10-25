### Online form to generate v3 serve options based on mode, CPU, and memory

Go to: [DB3 Config Generator](https://rkinginflux.github.io/db3-config-generator)

### Source baseline and engine compatibility

Generated CLI flags, environment variables, and guidance are aligned with the
InfluxDB 3 Enterprise source at commit
`eb4d2c3b1d781844db1ef41dd75e6c1e1e0887a2` in `influxdata/influxdb_pro`.
This is a source snapshot, not a claim of compatibility with every released version.

Select the storage engine your cluster already uses:

- **PachaTree** (default): new or fully upgraded clusters. Omits legacy checkpoint,
  WAL replay concurrency, forced-snapshot memory, and Parquet compaction tuning.
- **Parquet**: clusters started on 3.10 or earlier that have not upgraded.
  Retains those settings with current canonical names.

The engine selector only controls recommendations. It does not change a cluster's
persisted engine, perform an upgrade, or emit an engine-switch flag. During a
mixed-engine migration, consult the server's migration guidance rather than
treating either preset as a complete migration configuration.

Canonical output uses `--num-datafusion-threads`, `--exec-mem-pool-size`,
`--file-cache-size`, and (legacy engine only) `--force-snapshot-mem-size`, with
matching `INFLUXDB3_*` variables. Identity and licensing use `INFLUXDB3_MODE`,
`INFLUXDB3_NODE_ID`, `INFLUXDB3_CLUSTER_ID`, and `INFLUXDB3_LICENSE_EMAIL`.
Cloud credential variables retain their SDK-standard names.

### Sizing caveats

The existing CPU/memory formulas are generator heuristics, not InfluxDB defaults
or workload-tested sizing guarantees. This update changes configuration names and
engine applicability, not resource-sizing policy. Budget query execution, file
cache, write buffers, compaction, plugins, and other process memory together;
the generated budgets are not necessarily safe to consume simultaneously.
Small CPU presets may oversubscribe runtime threads.

Memory percentages resolve against the server's detected cgroup/host memory, not
the RAM entered in this form. Set container limits or replace percentages with
explicit sizes. An omitted cache flag means **server default**, not disabled:
PachaTree also needs file-cache memory outside query caching, and dedicated
PachaTree compactors default to a larger cache budget.

Presets cover the existing seven workload combinations, not every server mode
(for example, WebUI and distributed Processing Engine roles need separate setup).
Replace all `<...>` placeholders before running generated commands or exports.

### Local development and verification

```sh
npm ci
npm test
npm run typecheck
npm run build
bash -n influxdb3-config-generator.sh
```

The shell and web generators are compared across both engines, all seven presets,
and all four object stores. To validate generated flag and environment names
against your local Enterprise checkout as well:

```sh
INFLUXDB3_SOURCE_DIR=~/influxdata/official/influxdb_pro npm test
```

Without that variable, the source-contract test is skipped; the Enterprise source
is neither vendored nor fetched by this public project. The check validates names,
not server startup, credentials, licensing, or runtime memory safety.

The standalone shell generator accepts the same engine selection:

```sh
bash influxdb3-config-generator.sh --cpus 16 --ram 32 --mode query \
  --object-store s3 --storage-engine pacha-tree --env-vars
```
