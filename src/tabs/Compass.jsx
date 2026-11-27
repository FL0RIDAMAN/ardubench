// Compass tab. The compass table and the onboard calibration copy Mission
// Planner's compass page (ConfigHWCompass2.cs); the alignment, declination and
// heading check follow Betaflight Configurator 2026.6.2's Magnetometer panel
// (SensorsTab.vue). ArduPilot behaviour is from AP_Compass*.cpp (master).
import { useEffect, useState } from 'react';
import { useVehicle } from '../useVehicle.js';
import { useRates } from '../useRates.js';
import { CMD, MSG_ID, ACK_RESULT } from '../vehicle.js';
import { Panel, Row, Toggle, Tag, Help, NumberInput } from '../components.jsx';
import {
  ROTATIONS, rotationLabel, compassRows, priorityAfterMove, priorityFromRows, storageParam, priorityParam,
  CAL_STATUS, CAL_FIT, AUTO_ROT, EXTERNAL, FIELD_MIN, FIELD_MAX,
} from '../compass.js';

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
// COMPASS_LEARN @Values (1 was the old internal learning, since removed).
const LEARN = [[0, 'Disabled'], [2, 'EKF-Learning'], [3, 'InFlight-Learning']];
const ORDER_REASON = 'Compass priority order';

export default function Compass({ stage, value, pending }) {
  const v = useVehicle();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const session = v.magCalSession;

  // Live heading and field (RAW_IMU / SCALED_IMU2 / SCALED_IMU3 carry the
  // priority 1 / 2 / 3 compass in mGauss), and calibration progress while one runs.
  useRates(v, { [MSG_ID.VFR_HUD]: 5, [MSG_ID.RAW_IMU]: 5, [MSG_ID.SCALED_IMU2]: 5, [MSG_ID.SCALED_IMU3]: 5 });
  useRates(v, session ? { [MSG_ID.MAG_CAL_PROGRESS]: 10, [MSG_ID.MAG_CAL_REPORT]: 10 } : {});

  const rows = compassRows(value);
  const pendingCount = Object.keys(pending).length;
  const prioPending = [0, 1, 2].some((p) => pending[priorityParam.id(p)]);
  const enabled = value('COMPASS_ENABLE') !== 0;

  // ---- calibration --------------------------------------------------------
  const calSlots = Object.keys(v.magCal).map(Number).sort();
  const cal = (p) => v.magCal[p] || {};
  const allDone = session && calSlots.length > 0 && calSlots.every((p) => cal(p).report && cal(p).report.cal_status >= 4);
  const allSaved = allDone && calSlots.every((p) => cal(p).report.cal_status === 4 && cal(p).report.autosaved === 1);
  const running = session && !allDone;

  // When every compass has saved (autosave, like Mission Planner's Start),
  // mark the reboot ArduPilot needs ("Compass calibrated requires reboot"),
  // re-read the saved values, and accept, which only stops the reports now
  // (Compass::_accept_calibration returns at once for a saved compass).
  useEffect(() => {
    if (!allSaved || session.saved) return;
    session.saved = true;
    v.markRebootNeeded();
    const names = [];
    for (const r of rows) {
      if (r.storage === null) continue;
      for (const a of ['X', 'Y', 'Z']) names.push(storageParam.ofs(r.storage, a));
      names.push(storageParam.orient(r.storage));
    }
    v.readParams(names);
    v.commandResult(CMD.DO_ACCEPT_MAG_CAL, [0]).catch(() => {});
  });

  const calBlocked = !v.connected ? 'Connect first.'
    : v.armed ? 'Disarm the FC first.'
      : v.rebooting ? 'The FC is rebooting.'
        : !enabled ? 'The compass is turned off (COMPASS_ENABLE).'
          : pendingCount ? 'Write your changes first.' : '';

  async function startCal() {
    setError('');
    setBusy(true);
    v.magCal = {};
    v.magCalSession = { started: Date.now(), saved: false };
    v.emit();
    try {
      // Mission Planner's Start: all compasses, retry on, autosave on, no delay, no auto reboot.
      const r = await v.commandResult(CMD.DO_START_MAG_CAL, [0, 1, 1, 0, 0]);
      if (r !== 0) {
        v.magCalSession = null;
        const why = v.messages.filter((m) => m.t >= Date.now() - 2000).map((m) => m.text).join(' ');
        setError(`The FC didn’t start the calibration (${ACK_RESULT[r] || r}).${why ? ' It said: ' + why : ''}`);
      }
    } catch (e) {
      v.magCalSession = null;
      setError(e.message);
    }
    v.emit();
    setBusy(false);
  }

  async function cancelCal() {
    setError('');
    try { await v.command(CMD.DO_CANCEL_MAG_CAL, [0]); } catch (e) { setError(e.message); }
    v.magCalSession = null;
    v.magCal = {};
    v.emit();
  }

  // ---- reorder (Mission Planner's Up / Down / Remove Missing) -------------
  function stageOrder(change) {
    for (const [name, x] of Object.entries(change)) stage(name, x, ORDER_REASON);
  }

  // ---- live data --------------------------------------------------------------
  const heading = v.heading;
  const fieldOf = (p) => {
    const m = v.mag[p];
    return m && Date.now() - m.t < 2000 ? Math.hypot(m.x, m.y, m.z) : null;
  };
  const ofsZero = rows.some((r) => r.storage !== null && r.priority !== null
    && ['X', 'Y', 'Z'].every((a) => (v.param(storageParam.ofs(r.storage, a)) || 0) === 0));
  const autodec = value('COMPASS_AUTODEC') === 1;
  const sessionMsgs = session ? v.messages.filter((m) => m.t >= session.started) : [];

  return (
    <div className="compass">
      <div className="page-head">
        <h1 className="page-title">Compass</h1>
        <a className="wiki" href="https://ardupilot.org/copter/docs/common-compass-calibration-in-mission-planner.html" target="_blank" rel="noreferrer">WIKI</a>
      </div>
      {error && <div className="error" role="alert">{error}</div>}

      <div className="cols">
        <div className="col">
          <Panel title="Magnetometer">
            {enabled && ofsZero && <p className="warn-line">Magnetometer calibration offsets are zero. Please calibrate for accurate heading.</p>}
            <Row label="Magnetometer" param={`COMPASS_ENABLE ${value('COMPASS_ENABLE')}`} note="reboot needed" help="compassEnable" changed={pending.COMPASS_ENABLE}>
              <Toggle label="Magnetometer" checked={enabled} onChange={(on) => stage('COMPASS_ENABLE', on ? 1 : 0, on ? 'Compass on' : 'Compass off')} />
            </Row>
            <Row kind="ap" label="Automatic declination" param={`COMPASS_AUTODEC ${value('COMPASS_AUTODEC')}`} note="from the GPS position" help="compassAutodec" changed={pending.COMPASS_AUTODEC}>
              <Toggle label="Automatic declination" checked={autodec} onChange={(on) => stage('COMPASS_AUTODEC', on ? 1 : 0, on ? 'Declination from GPS' : 'Declination set by hand')} />
            </Row>
            <Row label="Magnetic Declination" param={`COMPASS_DEC ${value('COMPASS_DEC') !== undefined ? Number(value('COMPASS_DEC').toFixed(4)) : '—'}`} note={autodec ? 'set by the FC while automatic is on' : 'radians, shown in degrees'} help="compassDec" changed={pending.COMPASS_DEC}>
              {autodec ? (
                <span className="select-static">{value('COMPASS_DEC') !== undefined ? deg(value('COMPASS_DEC')).toFixed(2) : '—'}°</span>
              ) : (
                <NumberInput label="Magnetic declination, degrees" step={0.1} min={-180} max={180} suffix="°"
                  value={value('COMPASS_DEC') !== undefined ? Number(deg(value('COMPASS_DEC')).toFixed(2)) : undefined}
                  onCommit={(x) => stage('COMPASS_DEC', rad(x), 'Declination')} />
              )}
            </Row>
            {value('COMPASS_LEARN') !== undefined && (
              <Row kind="ap" label="Learn offsets" param={`COMPASS_LEARN ${value('COMPASS_LEARN')}`} help="compassLearn" changed={pending.COMPASS_LEARN}>
                <select aria-label="Learn offsets" value={value('COMPASS_LEARN')} onChange={(e) => stage('COMPASS_LEARN', Number(e.target.value), 'Offset learning')}>
                  {!LEARN.some(([n]) => n === value('COMPASS_LEARN')) && <option value={value('COMPASS_LEARN')}>{value('COMPASS_LEARN')} (not a current option)</option>}
                  {LEARN.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                </select>
              </Row>
            )}
          </Panel>

          <Panel title="Compasses">
            <p className="small">Set the compass priority by reordering the compasses below (highest at the top). After changing the order: Write to FC, Reboot FC, then calibrate again. <Help id="compassOrder" /></p>
            {rows.length === 0 ? <p className="note">No compass found (no COMPASS_DEV_ID or COMPASS_PRIOn_ID set).</p> : (
              <div className="ctable-scroll">
                <table className="ctable">
                  <thead>
                    <tr>
                      <th>#</th><th>Compass</th>
                      <th><Tag /> Magnetometer Alignment <Help id="compassOrient" /></th>
                      <th><Tag kind="ap" /> Use <Help id="compassUse" /></th>
                      <th>Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const ext = r.storage !== null ? value(storageParam.external(r.storage)) : undefined;
                      const orientName = r.storage !== null ? storageParam.orient(r.storage) : null;
                      const useName = r.priority !== null ? priorityParam.use(r.priority) : null;
                      const changed = (orientName && pending[orientName]) || (useName && pending[useName]) || (r.priority !== null && pending[priorityParam.id(r.priority)]);
                      return (
                        <tr key={r.id} className={changed ? 'changed' : ''}>
                          <td>{r.priority !== null ? r.priority + 1 : <span className="muted" title="Detected, but not one of the three ArduPilot uses">—</span>}</td>
                          <td>
                            <div><b>{r.name}</b>{r.missing && <span className="neg"> Missing</span>}</div>
                            <div className="small">{ext === undefined ? '' : `${EXTERNAL[ext] || ext} · `}{r.busType} bus {r.bus} · 0x{r.address.toString(16).toUpperCase().padStart(2, '0')}</div>
                            <div className="row-param">DEV_ID {r.id}</div>
                          </td>
                          <td>
                            {r.storage === null ? '—' : ext === 0 ? (
                              <span className="muted small">Follows Board Alignment (AHRS_ORIENTATION)</span>
                            ) : (
                              <>
                                <select aria-label={`${r.name} alignment`} value={value(orientName)} onChange={(e) => stage(orientName, Number(e.target.value), `${r.name} alignment`)}>
                                  {ROTATIONS.map(([n]) => <option key={n} value={n}>{rotationLabel(n)}</option>)}
                                </select>
                                <div className="row-param">{orientName} {value(orientName)}</div>
                              </>
                            )}
                          </td>
                          <td>
                            {useName ? (
                              <>
                                <Toggle label={`Use compass ${r.priority + 1}`} checked={value(useName) === 1} onChange={(on) => stage(useName, on ? 1 : 0, `${on ? 'Use' : 'Don’t use'} compass ${r.priority + 1} for heading`)} />
                                <div className="row-param">{useName} {value(useName)}</div>
                              </>
                            ) : '—'}
                          </td>
                          <td className="order">
                            <button type="button" className="btn-grey small-btn" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => stageOrder(priorityAfterMove(rows, i, -1))}>↑</button>
                            <button type="button" className="btn-grey small-btn" aria-label={`Move ${r.name} down`} disabled={i === rows.length - 1} onClick={() => stageOrder(priorityAfterMove(rows, i, 1))}>↓</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rows.some((r) => r.missing) && (
              <div className="btns">
                <button type="button" className="btn-grey" onClick={() => stageOrder(priorityFromRows(rows.filter((x) => !x.missing)))}>Remove Missing</button>
                <span className="muted small">A compass in the priority list that the FC didn’t find at boot.</span>
              </div>
            )}
          </Panel>
        </div>

        <div className="col">
          <Panel title="Calibration">
            <Row kind="ap" label="Fitness" param={`COMPASS_CAL_FIT ${value('COMPASS_CAL_FIT')}`} note="relax it if calibration keeps failing" help="compassFit" changed={pending.COMPASS_CAL_FIT}>
              <select aria-label="Fitness" value={value('COMPASS_CAL_FIT')} onChange={(e) => stage('COMPASS_CAL_FIT', Number(e.target.value), 'Calibration fitness')}>
                {!CAL_FIT.some(([n]) => n === value('COMPASS_CAL_FIT')) && <option value={value('COMPASS_CAL_FIT')}>{value('COMPASS_CAL_FIT')}</option>}
                {CAL_FIT.map(([n, l]) => <option key={n} value={n}>{l} ({n})</option>)}
              </select>
            </Row>
            <Row kind="ap" label="Check orientation" param={`COMPASS_AUTO_ROT ${value('COMPASS_AUTO_ROT')}`} help="compassAutoRot" changed={pending.COMPASS_AUTO_ROT}>
              <select aria-label="Check orientation" value={value('COMPASS_AUTO_ROT')} onChange={(e) => stage('COMPASS_AUTO_ROT', Number(e.target.value), 'Orientation check after calibration')}>
                {AUTO_ROT.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
              </select>
            </Row>

            <p className="dialog-info">
              Press Start, then pick the quad up and slowly turn it so each side (front, back, left, right, top and bottom)
              faces the ground for a few seconds, until every bar is full. Do it away from metal, cars and electronics.
              The FC saves the result itself; then reboot it.
            </p>
            <div className="btns">
              <button type="button" className="btn-yellow" onClick={startCal} disabled={!!calBlocked || busy || running}>{running ? 'Calibrating…' : 'Start'}</button>
              <button type="button" className="btn-grey" onClick={cancelCal} disabled={!running}>Cancel</button>
              <Help id="compassCal" />
              {calBlocked && <span className="muted small">{calBlocked}</span>}
              {!calBlocked && prioPending && <span className="muted small">Write and reboot after reordering before calibrating.</span>}
            </div>

            {session && (
              <div className="calbars">
                {calSlots.length === 0 && <p className="muted small">Waiting for the FC…</p>}
                {calSlots.map((p) => {
                  const c = cal(p), rep = c.report, prog = c.progress;
                  const row = rows.find((r) => r.priority === p);
                  const status = rep ? rep.cal_status : prog ? prog.cal_status : 0;
                  const pct = rep ? 100 : prog ? prog.completion_pct : 0;
                  return (
                    <div key={p} className="calbar">
                      <div className="calbar-head">
                        <b>Compass {p + 1}</b> <span className="muted">{row ? row.name : ''}</span>
                        <span className={`calbar-status ${status === 4 ? 'ok' : status >= 5 ? 'bad' : ''}`}>{CAL_STATUS[status] || status}</span>
                      </div>
                      <div className="bar"><div style={{ width: `${pct}%` }} className={status >= 5 ? 'bad' : ''} /></div>
                      <div className="small muted">
                        {pct}%{prog && prog.attempt > 1 && !rep && <span className="warn-text"> · attempt {prog.attempt}: the last try didn’t fit well enough, keep turning it</span>}
                        {rep && <> · fitness {rep.fitness.toFixed(1)} · offsets {Math.round(rep.ofs_x)}, {Math.round(rep.ofs_y)}, {Math.round(rep.ofs_z)}{rep.autosaved ? ' · saved' : ''}</>}
                        {rep && rep.old_orientation !== rep.new_orientation && <span className="warn-text"> · orientation {rotationLabel(rep.old_orientation)} → {rotationLabel(rep.new_orientation)}</span>}
                      </div>
                    </div>
                  );
                })}
                {allSaved && <p className="ok-line">Calibration saved. Reboot the FC to use it (ArduPilot won’t arm until you do).</p>}
                {allDone && !allSaved && <p className="warn-line">Calibration failed. Try again away from metal, or relax Fitness.</p>}
                {sessionMsgs.length > 0 && (
                  <div className="log" aria-label="Messages from the flight controller">
                    {sessionMsgs.slice(-4).map((m, i) => <div key={i} className={m.severity <= 3 ? 'bad' : ''}>{m.text}</div>)}
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Heading Check">
            <p className="small">Set the quad flat, point its nose at a direction you know (a phone compass helps), and check the FC agrees. <Help id="compassCheck" /></p>
            <div className="heading-check">
              <HeadingDial heading={heading} />
              <div className="small">
                <div className="big-num">{heading !== null ? `${heading}°` : '—'}</div>
                <div className="muted">FC heading (VFR_HUD)</div>
                {[0, 1, 2].filter((p) => rows.some((r) => r.priority === p)).map((p) => {
                  const f = fieldOf(p);
                  const bad = f !== null && (f < FIELD_MIN || f > FIELD_MAX);
                  return (
                    <div key={p} className={bad ? 'neg' : ''}>
                      Compass {p + 1} field: {f !== null ? `${Math.round(f)} mGauss` : '—'}
                      {bad && p === 0 && ` (ArduPilot won’t arm outside ${FIELD_MIN}–${FIELD_MAX})`}
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// A compass rose with the FC's heading: the quad seen from above, nose up when
// the FC says north. North stays at the top.
function HeadingDial({ heading }) {
  const h = heading ?? 0;
  return (
    <svg className="dial" viewBox="0 0 160 160" role="img" aria-label={heading !== null ? `FC heading ${heading} degrees` : 'No heading yet'}>
      <circle cx="80" cy="80" r="70" fill="none" stroke="var(--line-ctl)" strokeWidth="2" />
      {Array.from({ length: 36 }, (_, i) => (
        <line key={i} x1="80" y1="12" x2="80" y2={i % 9 === 0 ? 22 : 17} stroke="var(--muted)" strokeWidth={i % 9 === 0 ? 2 : 1} transform={`rotate(${i * 10} 80 80)`} />
      ))}
      {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, a]) => (
        <text key={l} x={80 + 47 * Math.sin(rad(a))} y={80 - 47 * Math.cos(rad(a)) + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={l === 'N' ? 'var(--yellow-fg)' : 'var(--text-soft)'}>{l}</text>
      ))}
      {heading !== null && (
        <g transform={`rotate(${h} 80 80)`}>
          <line x1="62" y1="62" x2="98" y2="98" stroke="var(--text-soft)" strokeWidth="3" />
          <line x1="98" y1="62" x2="62" y2="98" stroke="var(--text-soft)" strokeWidth="3" />
          {[[62, 62], [98, 62], [62, 98], [98, 98]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7" fill="none" stroke="var(--text-soft)" strokeWidth="2" />)}
          <path d="M80 50 L88 64 L72 64 Z" fill="var(--yellow)" />
        </g>
      )}
    </svg>
  );
}
