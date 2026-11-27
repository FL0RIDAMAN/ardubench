# ArduBench

A setup app for ArduPilot quads, laid out like the Betaflight Configurator so
Betaflight builders feel at home. It runs in Chrome or Edge and talks to the
flight controller over USB.

**Open it: https://fl0ridaman.github.io/ardubench/** (Chrome or Edge on a computer)

**Milestone 1 (this version):** connect, read/write parameters, and a working
Motors tab with motor test, a motor order wizard, a motor direction wizard,
ESC telemetry, and Betaflight equivalents for every setting.

## Try it

Open **https://fl0ridaman.github.io/ardubench/** in **Chrome or Edge**. Pick
**Virtual (no hardware)** and click Connect to try it without a flight
controller, or pick **USB** with an ArduPilot board plugged in.

The site updates itself: every push to `main` runs the tests, then builds and
publishes it (`.github/workflows/deploy.yml`). If a test fails, the site stays
on the last good version.

To run it on your own computer instead:

```
npm install     # once: downloads the libraries listed in package.json
npm run dev     # starts the app at http://localhost:5173
```

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
  MAVLink, so the rest of the app can't tell the difference. It's a correctly
  built QUAD X. Changing the frame doesn't move its "wires", so after a frame
  change you run Motor order and Motor direction, as on a real quad.
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

## Motor order and Motor direction

These work like the same two buttons in Betaflight Configurator 2026.6.2
(`MotorOutputReorderingDialog.vue` and `EscDshotDirectionDialog.vue` in the
betaflight-configurator repo). Solder the motors in any order, then fix it here.
Both buttons are disabled while there are unsaved changes or motor test is on,
the same as Betaflight.

- **Motor order**: confirm props are off, click Start. Each motor jerks in turn
  (motor 1, 2, 3, 4) and you click the arm that moves. Then press and hold each
  arm to check it, and click **Save and reboot**. ArduPilot keeps motor order in
  `SERVOn_FUNCTION` (which output drives Motor 1–4). For example, if output 2's
  motor is really on the rear-right arm, output 2 becomes Motor 4
  (`SERVO2_FUNCTION` 34 → 36).
- **Motor direction** (DShot only): **Wizard** spins all motors at once and you
  click the number of any motor going the wrong way; **Individually** lets you
  hold one motor (or **All**) to spin it, then pick Normal or Reverse. **Save and
  reboot** writes `SERVO_BLH_RVMASK` (one bit per output, set = reversed).

One place it can't match Betaflight: Betaflight sends the direction straight to
the ESC, so a click changes the spin at once. ArduPilot only sends
`SERVO_BLH_RVMASK` to the ESCs at startup (`AP_BLHeli::init`), so a change shows
up after **Save and reboot**.

The master slider spins all motors together, like Betaflight: the app sends one
motor test per motor, and during a motor test ArduPilot keeps each motor at its
last value (`ArduCopter/motors.cpp`; Mission Planner's "Test all motors" button
works the same way).

Other changes on the Motors tab are collected at the bottom as **unsaved
changes**, written with **Write to FC**, and most need **Reboot FC** to take effect.

## Checked against ArduPilot's source

From ArduPilot's code on GitHub (master branch), not yet on hardware:

- Motor positions, spin directions and test order (A–D) for FRAME_TYPE 1, 12
  and 18 match `frames.js` (`libraries/AP_Motors/AP_MotorsMatrix.cpp`).
- A motor test command with timeout 0 ends the test, and a new command while a
  test is running just updates it (`ArduCopter/motor_test.cpp`).
- 0% throttle in a motor test outputs the minimum, so the motor stops
  (`ArduCopter/motor_test.cpp`).
- `SERVOn_FUNCTION` and `SERVO_BLH_RVMASK` are marked "reboot required"
  (`libraries/SRV_Channel/SRV_Channel.cpp`, `libraries/AP_BLHeli/AP_BLHeli.cpp`);
  the reversed mask is only sent to the ESCs in `AP_BLHeli::init`.
- During a motor test only the commanded motor's output is rewritten, so
  several motors can spin at once (`ArduCopter/motors.cpp`, `motor_test.cpp`).

## Things to verify on a real flight controller

Built and tested against the Virtual FC only. On the bench, check:

1. Motor test (`MAV_CMD_DO_MOTOR_TEST`): re-sending it every 0.5 s keeps the
   motor spinning smoothly, and sequence numbers 1–4 spin arms A–D.
2. Stopping early (throttle 0 / timeout 0) stops the motor at once.
3. The master slider spins all motors together, and moving one motor's slider
   while the others spin changes just that motor.
4. ESC telemetry: that `ESC_TELEMETRY_1_TO_4` arrives after the app requests it,
   and that index 1 = output 1.
5. Motor order's jerk (8% for 0.25 s, then 0% for 0.5 s) is easy to see and
   doesn't upset the ESC.
6. Motor direction: `SERVO_BLH_RVMASK` reverses your ESCs after a reboot (it
   depends on ESC firmware, e.g. BLHeli_32, AM32, Bluejay).
7. After a reboot over USB, the port drops; the app asks you to reconnect.
8. Status bar: the FC accepts the 2 Hz `SYS_STATUS` / `GPS_RAW_INT` requests;
   the sensor icons match the board (gyro, accel, compass, baro, GPS,
   rangefinder); GPS turns yellow at a 3D fix; the shield lights during a
   failsafe; the log count and size match the logs on the SD card.
9. Help text: check against the ArduPilot parameter docs.
