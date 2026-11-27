import { serialSupported } from '../link/SerialLink.js';

export default function Welcome({ busy }) {
  return (
    <div className="welcome">
      <h1 className="page-title">Welcome</h1>
      <div className="welcome-grid">
        <div className="panel">
          <h2>Connect a flight controller</h2>
          <ol>
            <li>Plug your ArduPilot flight controller in over USB. <b>Props off.</b></li>
            <li>Pick <b>USB</b> on the left and click <b>Connect</b>.</li>
            <li>Choose the board in the browser’s port list.</li>
          </ol>
          {!serialSupported() && (
            <p className="note">This browser can’t open USB ports. Use Chrome, Edge or Brave on a computer.</p>
          )}
          {busy && <p className="note">Waiting for the flight controller…</p>}
        </div>
        <div className="panel">
          <h2>No hardware? Try Virtual mode</h2>
          <p>Pick <b>Virtual (no hardware)</b> and click Connect. You get a pretend ArduCopter quad that behaves like a real one on the bench.</p>
          <p>It’s built with two mistakes to find: two motors plugged into the wrong outputs, and one motor spinning the wrong way. Fix them with the <b>Motor order</b> and <b>Motor direction</b> wizards on the Motors tab.</p>
        </div>
      </div>
    </div>
  );
}
