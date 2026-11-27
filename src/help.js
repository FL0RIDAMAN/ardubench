// Help text for the "?" popovers, plus Betaflight equivalents for parameters.
// Written from general ArduPilot knowledge: check each against the official
// parameter docs (ardupilot.org/copter/docs/parameters.html) before release.

export const HELP = {
  frame: {
    title: 'Mixer',
    items: [
      ['', 'Picks the motor layout. ArduPilot splits it into two parameters: FRAME_CLASS (how many motors: 1 = quad) and FRAME_TYPE (the shape and motor order: 1 = X).'],
      ['Betaflight difference: ', 'Betaflight has one Mixer setting. ArduPilot’s standard X uses its own motor order (motor 1 front-right). FRAME_TYPE 12 (BetaFlightX) uses Betaflight’s order instead, so a quad wired for Betaflight can keep its wiring.'],
      ['Note: ', 'Changing the frame needs a reboot.'],
    ],
  },
  rev: {
    title: 'Motor direction is reversed',
    items: [
      ['', 'Spins every motor the opposite way (props-out).'],
      ['Betaflight difference: ', 'In ArduPilot this is a frame type, not a separate switch. FRAME_TYPE 18 (BetaFlightXReversed) is Betaflight’s motor order with reversed directions. It is only offered here when the frame uses Betaflight order.'],
      ['Note: ', 'The motors must physically spin the new way too. Use the Motor direction wizard afterwards.'],
    ],
  },
  proto: {
    title: 'ESC/Motor protocol',
    items: [
      ['', 'The signal the flight controller uses to talk to the ESCs.'],
      ['Betaflight difference: ', 'Same idea. ArduPilot applies it to every output set as a motor, and needs a reboot after a change.'],
      ['Note: ', 'Outputs on the same timer must share a protocol. Check your FC’s output groups.'],
    ],
  },
  bidir: {
    title: 'Bidirectional DShot',
    items: [
      ['', 'Reads RPM back from each ESC over the signal wire.'],
      ['Betaflight difference: ', 'Betaflight turns it on for all motors with one switch and uses it for the RPM filter automatically. ArduPilot picks outputs with a bitmask (SERVO_BLH_BDMASK). This switch sets it for every motor output. The RPM only feeds the filter once the harmonic notch is set to use ESC telemetry.'],
      ['Note: ', 'Requires DShot and ESC firmware that supports it (BLHeli_32, AM32, Bluejay).'],
    ],
  },
  esc: {
    title: 'ESC_SENSOR',
    items: [
      ['', 'Reads voltage, current and temperature from the ESC’s telemetry wire, connected to a UART RX pin.'],
      ['Betaflight difference: ', 'Betaflight assigns the UART in the Ports tab. ArduPilot sets SERIALn_PROTOCOL to 16 (ESC Telemetry) on the serial port the wire goes to. Pick that port here.'],
      ['Note: ', 'Not needed for RPM if Bidirectional DShot is on.'],
    ],
  },
  poles: {
    title: 'Motor poles',
    items: [
      ['', 'Number of magnets on the motor bell. Used to turn the ESC’s electrical RPM into real RPM.'],
      ['Wrong value: ', 'RPM readings are off by a fixed ratio, and the harmonic notch filters the wrong frequency.'],
      ['Note: ', 'Count the magnets on the bell. Same setting as Betaflight.'],
    ],
  },
  arm: {
    title: 'Motor Idle (%) · on the ground, armed',
    items: [
      ['', 'Motor output when armed with the throttle at zero. Stored by ArduPilot as a fraction (0.10 = 10%).'],
      ['Idle too low: ', 'motors may not start reliably, or start unevenly.'],
      ['Idle too high: ', 'the quad may creep or tip on the ground before takeoff.'],
      ['Betaflight difference: ', 'Betaflight’s Motor Idle covers the ground and flight. ArduPilot splits it: this one for the ground, MOT_SPIN_MIN for flight. This one must not be higher than MOT_SPIN_MIN.'],
    ],
  },
  min: {
    title: 'Motor Idle (%) · in flight',
    items: [
      ['', 'The lowest motor output allowed in flight. Stored as a fraction (0.15 = 15%).'],
      ['Too low: ', 'motors can stall or desync on fast descents, flips and rolls.'],
      ['Too high: ', 'the aircraft may feel ‘floaty’ and descend slowly.'],
      ['Betaflight difference: ', 'This is the in-flight half of Betaflight’s Motor Idle.'],
      ['Tip: ', 'Use the motor test to find the lowest output where every motor spins reliably, then set this a little above it.'],
    ],
  },
  max: {
    title: 'Motor spin max',
    items: [
      ['', 'The output ArduPilot treats as full throttle. Stored as a fraction (0.95 = 95%).'],
      ['Too high: ', 'little headroom left at the top of the ESC range.'],
      ['Too low: ', 'top-end power is left unused.'],
      ['Betaflight difference: ', 'No direct Betaflight setting.'],
    ],
  },
  master: {
    title: 'Master',
    items: [
      ['', 'Spins all motors together at the master throttle, like Betaflight. Moving one motor’s slider afterwards changes just that motor.'],
      ['ArduPilot: ', 'Sent as one MAV_CMD_DO_MOTOR_TEST per motor. During a motor test ArduPilot keeps each motor at its last value, so they all spin at once (Mission Planner’s “Test all motors” does the same).'],
    ],
  },

  // ---- Ports ----
  portsConfig: {
    title: 'Configuration/MAVLink',
    items: [
      ['', 'Runs MAVLink2 on this port (SERIALn_PROTOCOL 2), the protocol ground stations and this app use to configure the FC. Use it for a telemetry radio or a companion computer. The baud select sets SERIALn_BAUD.'],
      ['Betaflight difference: ', 'Betaflight’s column is MSP. ArduPilot configures over MAVLink instead, and a port running MAVLink can’t run anything else at the same time.'],
      ['Note: ', 'SERIAL0 only takes MAVLink (SERIALn_PROTOCOL 1 or 2), so it can’t be changed here. MAVLink1 is in Telemetry Output.'],
    ],
  },
  portsRx: {
    title: 'Serial Rx',
    items: [
      ['', 'Enable or disable Remote Control serial Receiver (RX) on specified UART. Only one allowed. (Betaflight’s help text.)'],
      ['ArduPilot: ', 'SERIALn_PROTOCOL 23 (RCIN). ArduPilot finds the receiver protocol (CRSF, SBUS, ELRS and others) and its baud by itself (AP_RCProtocol.cpp), so there is no baud to set. Two ports set to RCIN fail pre-arm: “Multiple SERIAL ports configured for RC input”.'],
      ['Note: ', 'RC_PROTOCOLS can limit which receiver protocols ArduPilot looks for. Leave it at its default unless you have a reason.'],
    ],
  },
  portsTelemetry: {
    title: 'Telemetry Output',
    items: [
      ['', 'Sends flight data to your radio, goggles or a tracker. The first group matches Betaflight’s choices; the second is ArduPilot only.'],
      ['Betaflight difference: ', 'FrSky SmartPort has two versions in ArduPilot: Frsky SPort (4) and FrSky SPort Passthrough (10, for Yaapu and other OpenTX/EdgeTX scripts). ArduPilot fixes their baud (9600 for Frsky D, 57600 for SPort and Passthrough) whatever SERIALn_BAUD says.'],
      ['Note: ', 'CRSF (Crossfire, ELRS) telemetry goes over the receiver’s own port, set to Serial Rx (ArduPilot wiki: Crossfire and ELRS RC Systems), so it isn’t listed here.'],
    ],
  },
  portsSensor: {
    title: 'Sensor Input',
    items: [
      ['', 'A sensor that sends data to the FC: GPS, ESC telemetry and others.'],
      ['ArduPilot: ', 'GPS (5): ArduPilot uses up to 2 GPS receivers, the first GPS port for GPS 1. When it looks for the GPS it tries several bauds (AP_GPS.cpp), starting with SERIALn_BAUD. ESC Telemetry (16) always runs at 115200, needs SERVO_BLH_TRATE above 0, and only the first port set to it is used (AP_BLHeli.cpp).'],
      ['Note: ', 'Bidirectional DShot sends RPM over the motor wires instead and doesn’t need a port.'],
    ],
  },
  portsPeripheral: {
    title: 'Peripherals',
    items: [
      ['', 'Devices the FC controls: video transmitters, cameras, gimbals, serial rangefinders and more.'],
      ['ArduPilot: ', 'SmartAudio (37) and IRC Tramp (44) need VTX_ENABLE = 1, and only the first port set to each is used. VTX (MSP + Displayport) (42) also needs OSD_TYPE 5 for an HD OSD. Rangefinder (9) also needs RNGFND1_TYPE set to your model.'],
      ['Betaflight difference: ', 'Blackbox logging and FrSky OSD have no ArduPilot serial protocol: ArduPilot logs to the board’s SD card or flash.'],
    ],
  },
  portsOptions: {
    title: 'Options',
    items: [
      ['', 'SERIALn_OPTIONS: electrical settings for the port, such as inverting the signal or half-duplex (one wire). It defaults to 0.'],
      ['ArduPilot: ', 'Bits 10 and 12 moved to MAVn_OPTIONS in newer ArduPilot; with either set, ArduPilot won’t arm. They are shown only so you can clear them.'],
      ['Note: ', 'Like Mission Planner, setting a port to MAVLink clears its options, and MAVLink1 also sets 115200 baud. Both show in the list of changes before you write.'],
    ],
  },

  // ---- Compass ----
  compassEnable: {
    title: 'Magnetometer',
    items: [
      ['', 'COMPASS_ENABLE turns the compass hardware on or off (reboot needed). To use it for heading, COMPASS_USE must also be 1 (the Use switch in the table).'],
      ['Betaflight difference: ', 'Betaflight’s Magnetometer hardware switch.'],
    ],
  },
  compassAutodec: {
    title: 'Automatic declination',
    items: [
      ['', 'COMPASS_AUTODEC: the FC works out the magnetic declination from its GPS position.'],
      ['Betaflight difference: ', 'Betaflight has you type the declination. With this on, ArduPilot sets COMPASS_DEC itself.'],
    ],
  },
  compassDec: {
    title: 'Magnetic Declination',
    items: [
      ['', 'The magnetic declination is the angle between magnetic north and true north. It is different for every location on earth. (Betaflight’s help text.)'],
      ['ArduPilot: ', 'COMPASS_DEC, stored in radians; shown here in degrees. Only used when Automatic declination is off.'],
    ],
  },
  compassLearn: {
    title: 'Learn offsets',
    items: [
      ['', 'COMPASS_LEARN: whether ArduPilot learns compass offsets on its own. EKF-Learning saves the offsets the EKF learnt when you disarm; InFlight-Learning learns once armed and blocks position modes while it runs.'],
      ['Betaflight difference: ', 'No Betaflight equivalent. Mission Planner shows it as “Automatically learn offsets”.'],
    ],
  },
  compassOrder: {
    title: 'Compass priority',
    items: [
      ['', 'ArduPilot uses up to three compasses, in the order of COMPASS_PRIO1_ID, PRIO2_ID and PRIO3_ID. The top one is used for heading. ↑ and ↓ rewrite all three, like Mission Planner.'],
      ['Note: ', 'A new order needs a reboot, and ArduPilot won’t calibrate until then (“Compass cal requires reboot after priority change”). Calibrate again after reordering.'],
      ['Missing: ', 'A compass in the priority list that the FC didn’t find at boot (no COMPASS_DEV_ID matches). Remove Missing takes it out of the list.'],
    ],
  },
  compassOrient: {
    title: 'Magnetometer Alignment',
    items: [
      ['', 'How an external compass (for example the one in a GPS module) is rotated relative to the frame: COMPASS_ORIENT, ORIENT2, ORIENT3.'],
      ['ArduPilot: ', 'Only used for a compass marked External. An internal compass follows Board Alignment (AHRS_ORIENTATION). Check orientation (below) can find and fix it during calibration.'],
      ['Betaflight difference: ', 'Same idea as Betaflight’s Magnetometer Alignment, with ArduPilot’s list of rotations.'],
    ],
  },
  compassUse: {
    title: 'Use',
    items: [
      ['', 'COMPASS_USE, USE2, USE3: whether the compass in that priority slot is used for heading. It belongs to the slot, not the compass, so moving a compass up or down changes which one each switch controls.'],
      ['Note: ', 'Calibration only runs on compasses that are used.'],
    ],
  },
  compassFit: {
    title: 'Fitness',
    items: [
      ['', 'COMPASS_CAL_FIT: how well the readings must fit a sphere for calibration to pass. Lower is stricter. It applies to the first compass; the others get double.'],
      ['Note: ', 'Mission Planner: “Relax fitness if calibration fails”.'],
    ],
  },
  compassAutoRot: {
    title: 'Check orientation',
    items: [
      ['', 'COMPASS_AUTO_ROT: after a successful calibration ArduPilot checks each compass’s orientation. Check and fix (2) corrects an external compass’s orientation for you.'],
      ['Note: ', 'If it changes an orientation, the result shows old → new.'],
    ],
  },
  compassCal: {
    title: 'Compass calibration',
    items: [
      ['', 'ArduPilot’s onboard calibration (MAV_CMD_DO_START_MAG_CAL), started like Mission Planner’s Start: every used compass, retry on, save automatically.'],
      ['Betaflight difference: ', 'Similar to Betaflight’s Firmware Calibration, which gives you 30 seconds. Here, keep turning the quad until every progress bar is full.'],
      ['Note: ', 'Afterwards ArduPilot needs a reboot before it will arm (“Compass calibrated requires reboot”).'],
    ],
  },
  compassCheck: {
    title: 'Heading check',
    items: [
      ['', 'Shows the heading the FC reports (VFR_HUD) and each compass’s field strength (RAW_IMU, SCALED_IMU2, SCALED_IMU3). Point the nose at a known direction and compare.'],
      ['ArduPilot: ', 'If the first compass reads under 185 or over 875 mGauss, pre-arm fails with “Check mag field” (AP_Arming.cpp).'],
    ],
  },

  // ---- Accel & Level ----
  boardAlign: {
    title: 'Board Alignment',
    items: [
      ['', 'How the flight controller is mounted: AHRS_ORIENTATION. Pick the rotation that turns the board’s arrow back to pointing forward, flat.'],
      ['Betaflight difference: ', 'Betaflight takes any roll, pitch and yaw. ArduPilot offers a list of fixed rotations, plus Custom 1 and 2 for any angle (CUST_ROT parameters).'],
      ['Note: ', 'ArduPilot’s description says it takes effect on next boot, and to re-level (Calibrate Level) after changing it. Set it before calibrating the accelerometer.'],
    ],
  },
  accelFull: {
    title: 'Calibrate Accel (6 positions)',
    items: [
      ['', 'The full accelerometer calibration (MAV_CMD_PREFLIGHT_CALIBRATION, 6-position): offsets and scale on every axis, plus the level trims from the first position.'],
      ['ArduPilot: ', 'The wiki says accelerometer calibration is mandatory. ArduPilot won’t arm until a reboot afterwards (“Accels calibrated requires reboot”).'],
      ['Betaflight difference: ', 'Betaflight only needs one level position. This is Mission Planner’s “Calibrate Accel”.'],
    ],
  },
  accelLevel: {
    title: 'Calibrate Level',
    items: [
      ['', 'Sets AHRS_TRIM_X and AHRS_TRIM_Y so the quad’s current attitude reads as level. Do it with the quad sitting in its level flying attitude.'],
      ['ArduPilot: ', 'Corrects up to 10° of roll and pitch, not yaw (beyond that: “trim over maximum of 10 degrees”). Applies at once, no reboot. Refused within 5 s of another accelerometer calibration.'],
    ],
  },
  accelSimple: {
    title: 'Calibrate',
    items: [
      ['', 'Place the craft on a level surface before calibrating. (Betaflight’s help text.)'],
      ['ArduPilot: ', 'This is the Simple Accel Cal: offsets from one level position, scale set to 1, trims set to 0. The ArduPilot wiki keeps it for very large vehicles that are hard to turn over; on a quad, use Calibrate Accel.'],
    ],
  },
  trimRoll: {
    title: 'Accelerometer Roll Trim',
    items: [
      ['', 'AHRS_TRIM_X: corrects a small roll difference between the board and the frame. Positive values make the vehicle roll right (ArduPilot’s description).'],
      ['Betaflight difference: ', 'Same job as Betaflight’s trim, but ArduPilot stores radians; shown here in degrees, up to ±10°. Calibrate Level sets it for you.'],
    ],
  },
  trimPitch: {
    title: 'Accelerometer Pitch Trim',
    items: [
      ['', 'AHRS_TRIM_Y: corrects a small pitch difference between the board and the frame. Positive values make the vehicle pitch up/back (ArduPilot’s description).'],
      ['Betaflight difference: ', 'Same job as Betaflight’s trim, but ArduPilot stores radians; shown here in degrees, up to ±10°. Calibrate Level sets it for you.'],
    ],
  },
  attitude: {
    title: 'Attitude',
    items: [
      ['', 'The roll and pitch the FC reports (ATTITUDE), drawn as the quad seen from behind and from its right side.'],
      ['Note: ', 'Tilt the quad right: the rear view should lean right. Lift the nose: the side view’s nose should go up. If not, fix Board Alignment, reboot, and calibrate again.'],
      ['Betaflight difference: ', 'Betaflight shows a 3D model for the same check.'],
    ],
  },
};

// Betaflight equivalents shown in the Parameters tab.
export const BF_EQUIV = {
  FRAME_CLASS: 'Mixer',
  FRAME_TYPE: 'Mixer / Motor direction is reversed',
  MOT_PWM_TYPE: 'ESC/Motor protocol (motor_pwm_protocol)',
  SERVO_BLH_BDMASK: 'Bidirectional DShot (dshot_bidir)',
  SERVO_BLH_POLES: 'Motor poles (motor_poles)',
  SERVO_BLH_RVMASK: 'ESC direction (set in BLHeli/AM32 configurator)',
  MOT_SPIN_ARM: 'Motor Idle (%), on the ground',
  MOT_SPIN_MIN: 'Motor Idle (%), in flight',
  INS_HNTCH_ENABLE: 'RPM filter / dynamic notch',
  COMPASS_ENABLE: 'Magnetometer (hardware switch)',
  COMPASS_DEC: 'Magnetic Declination',
  COMPASS_ORIENT: 'Magnetometer Alignment',
  AHRS_ORIENTATION: 'Board Alignment',
  AHRS_TRIM_X: 'Accelerometer Roll Trim',
  AHRS_TRIM_Y: 'Accelerometer Pitch Trim',
  ARMING_CHECK: 'Arming disable flags',
  FS_THR_ENABLE: 'Failsafe (RX loss)',
  BATT_MONITOR: 'Voltage/current meter source',
};

export const PWM_TYPES = [
  [0, 'Normal PWM'], [1, 'OneShot'], [2, 'OneShot125'], [3, 'Brushed'],
  [4, 'DSHOT150'], [5, 'DSHOT300'], [6, 'DSHOT600'], [7, 'DSHOT1200'],
];
