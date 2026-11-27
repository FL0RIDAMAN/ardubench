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
  ARMING_CHECK: 'Arming disable flags',
  FS_THR_ENABLE: 'Failsafe (RX loss)',
  BATT_MONITOR: 'Voltage/current meter source',
};

export const PWM_TYPES = [
  [0, 'Normal PWM'], [1, 'OneShot'], [2, 'OneShot125'], [3, 'Brushed'],
  [4, 'DSHOT150'], [5, 'DSHOT300'], [6, 'DSHOT600'], [7, 'DSHOT1200'],
];
