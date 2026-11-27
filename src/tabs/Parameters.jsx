import { useState } from 'react';
import { useVehicle } from '../useVehicle.js';
import { BF_EQUIV } from '../help.js';
import { Tag, NumberInput } from '../components.jsx';

// Every parameter on the FC, searchable, with Betaflight equivalents where one exists.
export default function Parameters({ stage, value, pending }) {
  const v = useVehicle();
  const [q, setQ] = useState('');
  const [onlyBf, setOnlyBf] = useState(false);
  const names = [...v.params.keys()].sort();
  const query = q.trim().toUpperCase();
  const shown = names.filter((n) => (!query || n.includes(query) || (BF_EQUIV[n] || '').toUpperCase().includes(query)) && (!onlyBf || BF_EQUIV[n]));

  return (
    <div>
      <h1 className="page-title">Parameters</h1>
      <div className="param-tools">
        <label className="sr-only" htmlFor="pq">Search parameters</label>
        <input id="pq" type="search" placeholder="Search by name or Betaflight setting…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={onlyBf} onChange={(e) => setOnlyBf(e.target.checked)} /> Only ones with a Betaflight equivalent</label>
        <span className="muted">{shown.length} of {names.length}</span>
      </div>
      <div className="panel param-table">
        <div className="prow phead"><span>Name</span><span>Value</span><span>Betaflight equivalent</span></div>
        {shown.slice(0, 400).map((n) => {
          const p = v.params.get(n);
          const isFloat = p.type === 9;
          const cur = value(n);
          return (
            <div className={`prow ${pending[n] ? 'changed' : ''}`} key={n}>
              <span className="mono">{n}</span>
              <span>
                <NumberInput
                  label={n}
                  mono
                  width={140}
                  step={isFloat ? 0.01 : 1}
                  value={isFloat ? +cur.toFixed(6) : cur}
                  onCommit={(x) => stage(n, isFloat ? x : Math.round(x), 'Edited in Parameters')}
                />
                {pending[n] && <span className="dot" title="Not written yet" />}
              </span>
              <span>{BF_EQUIV[n] ? <><Tag /> {BF_EQUIV[n]}</> : <span className="muted">—</span>}</span>
            </div>
          );
        })}
        {shown.length > 400 && <p className="muted">Showing the first 400. Search to narrow it down.</p>}
      </div>
    </div>
  );
}
