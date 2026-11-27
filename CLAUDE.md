# ArduBench

Browser-based setup app for ArduPilot quads, laid out like the Betaflight
Configurator so Betaflight builders can switch easily. Owner: Logan (Decisive
Drones, ~50-aircraft NDAA fleet). Runs in Chrome/Edge over WebSerial. Plan:
web first, maybe wrapped as a desktop app later.

## Commands
- `npm install`, then `npm run dev` (http://localhost:5173)
- `npm test`: codec vs pymavlink, wizard math, Vehicle ↔ Virtual FC end-to-end. Run after every change.
- `npm run build`: output in `dist/`. `base: './'` so it works on GitHub Pages.
- `npm run gen-defs`: regenerates `src/mavlink/defs.js` from pymavlink (`pip install pymavlink`). Never hand-edit defs.js; add messages in `scripts/gen_defs.py`.

## Architecture (see README.md for more)
link (`SerialLink` / `VirtualLink`) → `mavlink/codec.js` → `vehicle.js` (state + setParam/motorTest/command/reboot) → React screens (`App.jsx`, `tabs/`).
- `VirtualLink` is a fake ArduCopter speaking real MAVLink bytes. It's a correctly built QUAD X (FRAME_TYPE 1); never ship it broken. Tests pass their own `wiring` to simulate a mis-soldered quad. New features should work in Virtual mode too.
- `frames.js`: motor positions and numbers per FRAME_TYPE (1 = X, 12 = BetaFlightX, 18 = BetaFlightXReversed). Test order A–D runs clockwise from front-right.
- `wizards.js`: pure functions (order → SERVOn_FUNCTION, direction → SERVO_BLH_RVMASK). Keep logic out of the components so it stays testable.
- Motor order / Motor direction are dialogs (`tabs/MotorOrderDialog.jsx`, `tabs/MotorDirectionDialog.jsx`) modeled on Betaflight Configurator 2026.6.2's Reorder motors and Motor direction dialogs. Match Betaflight's flow; where ArduPilot can't (motor direction only applies after a reboot), say so in the UI and README. Check ArduPilot's source before claiming a limitation.
- `npm test` includes `test/bench.test.mjs`: for every frame, on both the correct virtual quad and a mis-soldered one, Motor order and Motor direction (same math as the dialogs) must leave every slider spinning its own motor the right way, and change nothing when nothing is wrong.
- Edits are staged as "pending" in App.jsx, written with Write to FC, then Reboot FC.

## Rules
- IMPORTANT: motor safety. Throttle is capped at 15%. The props-off confirmation is required before anything spins. Motor tests are re-sent every 0.5 s with a 1 s timeout, so a frozen app or pulled cable stops motors within 1 s. Never weaken these.
- UI style is Betaflight-familiar: dark #141414, yellow #FFBB00, Open Sans, yellow pill panel labels. Settings that have a Betaflight equivalent use the Betaflight name with a yellow BF tag and the ArduPilot param underneath; others get an "AP only" tag. Every setting gets a "?" help popover (text lives in `help.js`).
- Every change the app writes to the FC is listed first (parameter, old → new value, and why) where the user applies it: the save bar, the Motor order and Motor direction dialogs, and anything new.
- Every graphic shows what the FC expects and commands, drawn correctly, never what the physical drone is doing. The user spots a wrong physical drone by comparing, and fixes it in the app. Motor test animates the commanded motor at its correct arm, turning its correct way (real FC and Virtual alike).
- In Virtual mode a separate, labeled virtual drone (`VirtualDrone` in `tabs/QuadDiagram.jsx`) stands in for the real drone and is the only place that shows physical reality. Motor order's clickable picture never animates.
- No TypeScript or extra libraries unless there's a clear reason. Plain JS + React + Vite.
- Don't state ArduPilot behavior as fact without a source. Link the ArduPilot docs, or mark it as unverified in README's "Things to verify" list.

## Working with Logan
- He's new to coding and Git. Explain what changed and why in plain terms, and teach concepts rather than only listing steps.
- He's an experienced FPV/ArduPilot/Betaflight builder. Don't over-explain the drone side.
- Don't say "usually"/"often" without a source; say it's a guess.

## Status
Milestone 1 done: connect, params, Motors tab, Parameters tab. Tested against the Virtual FC only.
Next up: verify on a real FC (README checklist), then Receiver, Compass, Accel, Power & Failsafe, Harmonic Notch, Fleet baseline diff, QC checklist tabs.
Design mockups: https://claude.ai/artifact/FUqwi9mjvXewxUNNR7Trjf
