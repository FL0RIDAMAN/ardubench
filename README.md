# ArduBench

A setup app for ArduPilot quads, laid out like the Betaflight Configurator so
Betaflight builders feel at home. It runs in Chrome or Edge and talks to the
flight controller over USB.

**Open it: https://fl0ridaman.github.io/ardubench/** (Chrome or Edge on a computer)

**Milestone 1:** connect, read/write parameters, and a working
Motors tab with motor test, a motor order wizard, a motor direction wizard,
ESC telemetry, and Betaflight equivalents for every setting.

**Now also:** Ports, Compass, and Accel & Level tabs (below).

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

## Ports, Compass, Accel & Level

Each copies Betaflight Configurator 2026.6.2's layout where Betaflight has the
same thing, and Mission Planner's behaviour where only ArduPilot does. Every
change goes through the same unsaved-changes list, **Write to FC** and
**Reboot FC** as the Motors tab.

- **Ports** (`tabs/Ports.jsx`, data in `ports.js`): Betaflight's grid
  (`PortsTab.vue`): Identifier, Configuration/MAVLink, Serial Rx, Telemetry
  Output, Sensor Input, Peripherals, plus Options (ArduPilot only). Below
  1020 px it switches to one card per port, as Betaflight does. ArduPilot gives
  each port one protocol (`SERIALn_PROTOCOL`), so picking something in one
  column turns the others off. Port names (UART7, USB…) come from the board's
  `@SYS/uarts.txt`, read over MAVFTP like Mission Planner's serial page
  (`ConfigSerial.cs`). Like Mission Planner, setting a port to MAVLink clears
  its options, and MAVLink1 also sets 115200. Warnings come from ArduPilot's
  own checks: two receiver ports, retired option bits 10/12, ESC telemetry or
  SmartAudio/Tramp on more than one port, VTX_ENABLE, OSD_TYPE for
  DisplayPort, GPS on more than 2 ports, too many MAVLink ports.
- **Compass** (`tabs/Compass.jsx`, data in `compass.js`): Mission Planner's
  compass table (`ConfigHWCompass2.cs`): compasses in priority order with ↑/↓
  (rewrites `COMPASS_PRIO1..3_ID`), Missing and Remove Missing, and onboard
  calibration started the same way (all compasses, retry, autosave). From
  Betaflight's Magnetometer panel: Magnetometer Alignment (external compasses
  only; internal ones follow Board Alignment), declination, and a heading
  check with each compass's field strength.
- **Accel & Level** (`tabs/Level.jsx`): Betaflight's Board Alignment
  (`AHRS_ORIENTATION`), Calibrate (ArduPilot's Simple Accel Cal) and roll/pitch
  trims (`AHRS_TRIM_X/Y`, shown in degrees). Mission Planner's 6-position
  **Calibrate Accel** (the one the ArduPilot wiki calls mandatory) and
  **Calibrate Level**. The 6-position dialog draws the position the FC asks
  for. ArduPilot has no command to stop it part-way; a reboot does.
- Live data (heading, field, attitude) is requested only while a tab is open
  (`useRates.js`), then handed back to the FC's own rates.

The Virtual FC does all of this too: MAVFTP for `uarts.txt`, live attitude and
compass data, and all three calibrations, answering the way ArduPilot's code
does (`test/setup.test.mjs`).

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
- Ports: protocol and baud lists, `map_baudrate`, and which protocols ignore
  `SERIALn_BAUD` (`AP_SerialManager.cpp`, `AP_RCProtocol.cpp`, `AP_BLHeli.cpp`);
  `uarts.txt` format (`AP_HAL_ChibiOS/Util.cpp`); MAVFTP read
  (`GCS_MAVLink/GCS_FTP.cpp`).
- Compass: `COMPASS_USEn` belongs to the priority slot, offsets and
  orientation to the storage slot, and ArduPilot reorders storage to match
  priority at boot (`AP_Compass.cpp`); calibration start/accept/cancel results
  (`AP_Compass_Calibration.cpp`); the 185–875 mGauss pre-arm limits
  (`AP_Arming.cpp`).
- Accel: level and simple calibrations are refused within 5 s of the last one;
  only the 6-position one needs a reboot; a finished 6-position calibration
  keeps reporting SUCCESS/FAILED once a second; it is only cancelled by arming
  (`AP_InertialSensor.cpp`, `AP_AccelCal.cpp`, `GCS_Common.cpp`).

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
10. Ports: `@SYS/uarts.txt` downloads over MAVFTP and the UART names match the
    board's pinout; protocol and baud changes take effect after the reboot.
    `SERIALn_BAUD` has no "reboot required" tag in ArduPilot, but ports are
    opened at startup, so the app treats it as needing one.
11. Compass: `MAG_CAL_PROGRESS` / `MAG_CAL_REPORT` arrive once requested
    (`SET_MESSAGE_INTERVAL`); the progress bars fill; after autosave the app's
    accept stops the reports; on 4.7.x with retry on, a failed attempt just
    restarts (the attempt count goes up) instead of reporting a failure.
    Failure statuses 8–10 exist only on newer firmware. `RAW_IMU` /
    `SCALED_IMU2` show compasses 1 and 2.
12. Accel: the FC's position requests (`COMMAND_LONG` 42429 sent to system 0)
    reach the app over USB; each Done advances; Calibrate Level gives "Trim
    OK". `AHRS_ORIENTATION`: its description says "next boot" but the code
    seems to apply it at once; the app asks for a reboot either way.
13. The ArduPilot wiki lists SERIAL1/2's default protocol as MAVLink1; the code
    says MAVLink2. Doesn't change the app, but worth knowing.
