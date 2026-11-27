# ArduBench

A setup app for ArduPilot quads, laid out like the Betaflight Configurator so
Betaflight builders feel at home. It runs in Chrome or Edge and talks to the
flight controller over USB.

**Milestone 1 (this version):** connect, read/write parameters, and a working
Motors tab with motor test, a motor order wizard, a motor direction wizard,
ESC telemetry, and Betaflight equivalents for every setting.

## Try it

```
npm install     # once: downloads the libraries listed in package.json
npm run dev     # starts the app at http://localhost:5173
```

Open that address in **Chrome or Edge**. Pick **Virtual (no hardware)** and click
Connect to try it without a flight controller, or pick **USB** with an
ArduPilot board plugged in.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the automated tests (no browser needed) |
| `npm run build` | Makes the finished website in `dist/`, ready to host (e.g. GitHub Pages) |
| `npm run gen-defs` | Regenerates the MAVLink message list (needs Python + `pip install pymavlink`) |

## How it fits together

Think of it in layers, from the USB cable up to the screen:

```
 USB cable / Virtual FC        src/link/SerialLink.js, src/link/VirtualLink.js
        │  raw bytes
 MAVLink codec                 src/mavlink/codec.js  (+ defs.js)
        │  messages like PARAM_VALUE, COMMAND_ACK
 Vehicle                       src/vehicle.js
        │  state: params, telemetry, messages; actions: setParam(), motorTest()
 Screens (React)               src/App.jsx, src/tabs/*.jsx
```

- **Link**: moves bytes. `SerialLink` uses the browser's WebSerial API.
  `VirtualLink` is a pretend flight controller inside the app. It speaks real
  MAVLink, so the rest of the app can't tell the difference. It's built with two
  mistakes for the wizards to find: outputs 2 and 4 swapped, and the
  front-left motor spinning backwards.
- **MAVLink codec**: MAVLink is the language ArduPilot speaks. Each message is a
  small packet: a header, the data, and a checksum. `codec.js` builds and reads
  those packets. The message layouts in `defs.js` are generated from the
  official definitions (pymavlink), and `test/codec.test.mjs` checks our bytes
  match pymavlink's exactly.
- **Vehicle**: the app's picture of the flight controller. Screens call things
  like `vehicle.setParam('MOT_SPIN_ARM', 0.1)` and re-draw when it changes.
- **Screens**: React components. `tabs/Motors.jsx` is the big one.
  `wizards.js` holds the wizard math separately so it can be tested.
- **frames.js**: which motor sits where for each FRAME_TYPE, and the motor-test
  letters (A–D, clockwise from front-right).
- **help.js**: the text in the "?" popovers and the Betaflight equivalents.

## How the wizards decide what to change

- **Motor order**: spins each motor number in turn; you click where you see a
  motor move. If output 2 is set to "Motor 2" but its motor is physically on the
  rear-right arm (where Motor 4 belongs), output 2 gets set to Motor 4
  (`SERVO2_FUNCTION` 34 → 36).
- **Motor direction**: spins each motor; you say if it's going the right way.
  Each "wrong way" flips that output's bit in `SERVO_BLH_RVMASK` (DShot ESCs only).

Changes are collected at the bottom as **unsaved changes**, written with
**Write to FC**, and most need **Reboot FC** to take effect.

## Things to verify on a real flight controller

Built and tested against the Virtual FC only. On the bench, check:

1. Motor test command (`MAV_CMD_DO_MOTOR_TEST`): that sequence numbers 1–4
   match test order A–D, and that re-sending it every 0.5 s keeps the motor
   spinning smoothly.
2. Stopping: the app sends throttle 0 / timeout 0 to stop early. Confirm
   ArduPilot stops the motor on that. (If not, it still stops within 1 s.)
3. **Run A→D** (motor count 4) runs the motors one after another.
4. ESC telemetry: that `ESC_TELEMETRY_1_TO_4` arrives after the app requests it,
   and that index 1 = output 1.
5. FRAME_TYPE 12 / 18 (Betaflight order) layouts match the real motor order.
6. After a reboot over USB, the port drops; the app asks you to reconnect.
7. Help text: check against the ArduPilot parameter docs.
