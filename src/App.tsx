import { useMemo, useState } from 'react';
import {
  CANONICAL_MODES,
  CANONICAL_OBJECT_STORES,
  type CanonicalMode,
  generateConfiguration
} from './lib/config-generator';

const modeLabels: Record<CanonicalMode, string> = {
  all: 'all',
  ingest: 'ingest',
  query: 'query',
  compact: 'compact',
  process: 'process',
  'ingest,query': 'ingest,query',
  'query,compact': 'query,compact'
};

function App() {
  const [cpus, setCpus] = useState<number>(16);
  const [ramGb, setRamGb] = useState<number>(32);
  const [mode, setMode] = useState<CanonicalMode>('all');
  const [objectStore, setObjectStore] = useState<(typeof CANONICAL_OBJECT_STORES)[number]>('file');
  const [includeEnvVars, setIncludeEnvVars] = useState(true);

  const configuration = useMemo(
    () =>
      generateConfiguration({
        cpus,
        ramGb,
        mode,
        objectStore,
        includeEnvVars
      }),
    [cpus, includeEnvVars, mode, objectStore, ramGb]
  );

  return (
    <div className="page-shell">
      <main className="page-grid">
        <section className="hero-card panel panel--hero">
          <div className="eyebrow">Online form for V3 Enterprise Deployments</div>
          <h1>InfluxDB 3 Enterprise configuration generator</h1>
          <p className="hero-copy">
            A safe online form that only generates recommendations from the explicit values entered below.
          </p>
          <div className="hero-meta">
            <span>Pure TypeScript logic</span>
            <span>Shell parity for calculations</span>
            <span>Static deployable output</span>
          </div>
        </section>

        <section className="panel panel--inputs">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Inputs</p>
              <h2>Define the node explicitly</h2>
            </div>
          </div>

          <div className="input-grid">
            <label className="field">
              <span>CPU cores</span>
              <input
                type="number"
                min={1}
                step={1}
                value={cpus}
                onChange={(event) => setCpus(Number(event.target.value) || 0)}
              />
            </label>

            <label className="field">
              <span>RAM (GB)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={ramGb}
                onChange={(event) => setRamGb(Number(event.target.value) || 0)}
              />
            </label>

            <label className="field">
              <span>Mode</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as CanonicalMode)}>
                {CANONICAL_MODES.map((modeOption) => (
                  <option key={modeOption} value={modeOption}>
                    {modeLabels[modeOption]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Object store</span>
              <select value={objectStore} onChange={(event) => setObjectStore(event.target.value as (typeof CANONICAL_OBJECT_STORES)[number])}>
                {CANONICAL_OBJECT_STORES.map((storeOption) => (
                  <option key={storeOption} value={storeOption}>
                    {storeOption}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={includeEnvVars}
              onChange={(event) => setIncludeEnvVars(event.target.checked)}
            />
            <span>Include the environment variable section</span>
          </label>

          <div className="compatibility-note">
            Internal normalization still accepts shell-style aliases like <code>ingest-query</code>,{' '}
            <code>ingest_query</code>, <code>query-compact</code>, <code>query_compact</code>, and <code>gcs</code>.
          </div>

          {configuration.warnings.length > 0 ? (
            <div className="warning-stack" aria-live="polite">
              {configuration.warnings.map((warning) => (
                <p key={warning.field} className="warning-banner">
                  {warning.message}
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Summary</p>
              <h2>Resource allocation</h2>
            </div>
          </div>
          <div className="summary-grid">
            {configuration.summary.map((metric) => (
              <article key={metric.label} className="summary-card">
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
                {metric.note ? <span>{metric.note}</span> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Command</p>
              <h2>Recommended startup command</h2>
            </div>
            <p className="section-note">Generated from the same mode, memory, and object store rules.</p>
          </div>
          <pre className="code-block"><code>{configuration.command}</code></pre>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Environment variables</p>
              <h2>Optional export block</h2>
            </div>
          </div>
          {configuration.envVarSections.length > 0 ? (
            <div className="env-grid">
              {configuration.envVarSections.map((section) => (
                <article key={section.title} className="env-card">
                  <h3>{section.title}</h3>
                  <pre className="code-block code-block--compact">
                    <code>{section.lines.join('\n')}</code>
                  </pre>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">Turn on “Include the environment variable section” to render the export statements.</p>
          )}
        </section>

        <section className="panel panel--split">
          <div>
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Recommendations</p>
                <h2>Operational guidance</h2>
              </div>
            </div>
            <ul className="recommendation-list">
              {configuration.recommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ul>
          </div>

          <div>
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Quick reference</p>
                <h2>All modes for the selected hardware</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>IO Threads</th>
                    <th>DF Threads</th>
                    <th>Mem Pool</th>
                    <th>Cache</th>
                  </tr>
                </thead>
                <tbody>
                  {configuration.quickReference.map((row) => (
                    <tr key={row.mode}>
                      <td>{row.mode}</td>
                      <td>{row.ioThreads}</td>
                      <td>{row.datafusionThreads}</td>
                      <td>{row.memPoolPercent}</td>
                      <td>{row.cache}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
