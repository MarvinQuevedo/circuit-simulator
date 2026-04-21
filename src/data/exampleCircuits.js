// ─── Example Circuits ────────────────────────────────────────────────────────
const pId = (cId, idx) => `${cId}_p${idx}`;

const mk2 = (cId) => [
  { id: pId(cId, 0), index: 0, offsetX: -30, offsetY: 0 },
  { id: pId(cId, 1), index: 1, offsetX:  30, offsetY: 0 },
];
const mkGnd = (cId) => [
  { id: pId(cId, 0), index: 0, offsetX: 0, offsetY: 0 },
];
const mkBJT = (cId) => [
  { id: pId(cId, 0), index: 0, offsetX: -30, offsetY:   0 }, // Base
  { id: pId(cId, 1), index: 1, offsetX:  30, offsetY: -24 }, // Collector
  { id: pId(cId, 2), index: 2, offsetX:  30, offsetY:  24 }, // Emitter
];

const W = (id, a, b, wp) => ({ id, startPinId: a, endPinId: b, waypoints: wp || [] });

// Helper factories
const mkSrc = (id, x, y, v = 9) => ({
  id, type: 'DC_VOLTAGE_SOURCE', x, y, rotation: 180, // + Right, - Left
  properties: { voltage: v },
  pins: mk2(id),
});
const mkGndComp = (id, x, y) => ({
  id, type: 'GROUND', x, y, rotation: 0,
  properties: {},
  pins: mkGnd(id),
});
const mkRes = (id, x, y, r, rot = 0) => ({
  id, type: 'RESISTOR', x, y, rotation: rot,
  properties: { resistance: r, maxPower: 0.25 },
  pins: mk2(id),
});
const mkLed = (id, x, y, modelId = 'RED', rot = 0) => {
  const vf = { RED: 1.8, GREEN: 2.2, BLUE: 3.2, YELLOW: 2.1, WHITE: 3.4 };
  return {
    id, type: 'LED', x, y, rotation: rot,
    properties: { modelId, useCustom: false, Vf: vf[modelId] ?? 1.8, Ron: 0.1 },
    pins: mk2(id),
  };
};
const mkSwitch = (id, x, y, closed = false, label) => ({
  id, type: 'SWITCH', x, y, rotation: 0,
  properties: { closed, maxCurrent: 1, label },
  pins: mk2(id),
});
const mkPushButton = (id, x, y, label) => ({
  id, type: 'PUSH_BUTTON', x, y, rotation: 0,
  properties: { closed: false, maxCurrent: 1, label },
  pins: mk2(id),
});
const mkBulb = (id, x, y, r = 60, rot = 0) => ({
  id, type: 'BULB', x, y, rotation: rot,
  properties: { resistance: r, maxPower: 2.5 },
  pins: mk2(id),
});
const mkCap = (id, x, y, c = 100, rot = 0, vCap = 0) => ({
  id, type: 'CAPACITOR', x, y, rotation: rot,
  properties: { capacitance: c, maxVoltage: 50, vCap },
  pins: mk2(id),
});
const mkDiode = (id, x, y, rot = 0) => ({
  id, type: 'DIODE', x, y, rotation: rot,
  properties: { modelId: '1N4001', useCustom: false },
  pins: mk2(id),
});
const mkAcSrc = (id, x, y, v = 12, f = 60) => ({
  id, type: 'AC_VOLTAGE_SOURCE', x, y, rotation: 0,
  properties: { amplitude: v, frequency: f, time: 0 },
  pins: mk2(id),
});
const mkReg = (id, x, y, v = 5) => ({
  id, type: 'VOLTAGE_REGULATOR', x, y, rotation: 0,
  properties: { targetVoltage: v, dropoutVoltage: 2, maxCurrent: 1.5 },
  pins: [
    { id: pId(id, 0), index: 0, offsetX: -40, offsetY: 0, label: 'IN' },
    { id: pId(id, 1), index: 1, offsetX:  40, offsetY: 0, label: 'OUT' },
    { id: pId(id, 2), index: 2, offsetX:   0, offsetY: 30, label: 'GND' },
  ],
});
const mkNPN = (id, x, y, modelId = '2N3904', rot = 0) => {
  const m = { '2N3904': { beta:100, Vbe:0.65, Ron:10, maxIc:0.2 }, '2N2222': { beta:150, Vbe:0.60, Ron:5, maxIc:0.6 } };
  return { id, type: 'NPN', x, y, rotation: rot, properties: { modelId, useCustom: false, ...(m[modelId] ?? m['2N3904']) }, pins: mkBJT(id) };
};

// --- Digital Helper Factories ---
const mkGate = (id, type, x, y) => ({
  id, type, x, y, rotation: 0,
  properties: {},
  pins: [
    { id: pId(id, 0), index: 0, offsetX: -30, offsetY: -15 },
    { id: pId(id, 1), index: 1, offsetX: -30, offsetY:  15 },
    { id: pId(id, 2), index: 2, offsetX:  30, offsetY:   0 },
  ],
});
const mk7Seg = (id, x, y) => ({
  id, type: '7SEG_DISPLAY', x, y, rotation: 0,
  properties: { commonAnode: false },
  pins: [
    { id: pId(id, 0), index: 0, offsetX: -40, offsetY: -30, label: 'A' },
    { id: pId(id, 1), index: 1, offsetX: -40, offsetY: -20, label: 'B' },
    { id: pId(id, 2), index: 2, offsetX: -40, offsetY: -10, label: 'C' },
    { id: pId(id, 3), index: 3, offsetX: -40, offsetY: 0,   label: 'D' },
    { id: pId(id, 4), index: 4, offsetX: -40, offsetY: 10,  label: 'E' },
    { id: pId(id, 5), index: 5, offsetX: -40, offsetY: 20,  label: 'F' },
    { id: pId(id, 6), index: 6, offsetX: -40, offsetY: 30,  label: 'G' },
    { id: pId(id, 7), index: 7, offsetX: 40,  offsetY: 40,  label: 'DP' },
    { id: pId(id, 8), index: 8, offsetX: 40,  offsetY: 0,   label: 'COM' },
  ],
});
const mkDecoder = (id, x, y) => ({
  id, type: '7447_DECODER', x, y, rotation: 0, properties: {},
  pins: [
    { id: pId(id, 0), index: 0, offsetX: -40, offsetY: -30, label: 'A' },
    { id: pId(id, 1), index: 1, offsetX: -40, offsetY: -10, label: 'B' },
    { id: pId(id, 2), index: 2, offsetX: -40, offsetY: 10,  label: 'C' },
    { id: pId(id, 3), index: 3, offsetX: -40, offsetY: 30,  label: 'D' },
    { id: pId(id, 4), index: 4, offsetX: 40,  offsetY: -30, label: 'a' },
    { id: pId(id, 5), index: 5, offsetX: 40,  offsetY: -20, label: 'b' },
    { id: pId(id, 6), index: 6, offsetX: 40,  offsetY: -10, label: 'c' },
    { id: pId(id, 7), index: 7, offsetX: 40,  offsetY: 0,   label: 'd' },
    { id: pId(id, 8), index: 8, offsetX: 40,  offsetY: 10,  label: 'e' },
    { id: pId(id, 9), index: 9, offsetX: 40,  offsetY: 20,  label: 'f' },
    { id: pId(id, 10), index: 10, offsetX: 40, offsetY: 30,  label: 'g' },
    { id: pId(id, 11), index: 11, offsetX: 0,  offsetY: 45,  label: 'GND' },
    { id: pId(id, 12), index: 12, offsetX: 0,  offsetY: -45, label: 'VCC' },
  ],
});
const mkCounter = (id, x, y) => ({
  id, type: 'COUNTER_4BIT', x, y, rotation: 0, properties: { count: 0, maxCount: 10 },
  pins: [
    { id: pId(id, 0), index: 0, offsetX: -30, offsetY: -30, label: 'CLK' },
    { id: pId(id, 1), index: 1, offsetX: -30, offsetY: -10, label: 'R1'  },
    { id: pId(id, 2), index: 2, offsetX: -30, offsetY: 10,  label: 'R2'  },
    { id: pId(id, 3), index: 3, offsetX: 30,  offsetY: -35, label: 'Q0'  },
    { id: pId(id, 4), index: 4, offsetX: 30,  offsetY: -15, label: 'Q1'  },
    { id: pId(id, 5), index: 5, offsetX: 30,  offsetY: 5,   label: 'Q2'  },
    { id: pId(id, 6), index: 6, offsetX: 30,  offsetY: 25,  label: 'Q3'  },
    { id: pId(id, 7), index: 7, offsetX: 30,  offsetY: 40,  label: 'OVF' },
    { id: pId(id, 8), index: 8, offsetX: 0,   offsetY: 50,  label: 'GND' },
    { id: pId(id, 9), index: 9, offsetX: 0,   offsetY: -50, label: 'VCC' },
  ],
});
const mkClock = (id, x, y, freq = 1) => ({
  id, type: 'CLOCK_SOURCE', x, y, rotation: 0, properties: { frequency: freq, outputVoltage: 5 },
  pins: [
    { id: pId(id, 0), index: 0, offsetX: -20, offsetY: 0, label: 'GND' },
    { id: pId(id, 1), index: 1, offsetX:  20, offsetY: 0, label: 'OUT' },
  ],
});

// ─── Example Circuits ───

const ledCircuit = () => ({
  components: [
    mkSrc('v1', 200, 300, 9), mkGndComp('g1', 140, 300),
    mkRes('r1', 400, 300, 470), mkLed('l1', 560, 300, 'BLUE'), mkGndComp('g2', 620, 300),
  ],
  wires: [
    W('w1', pId('v1','1'), pId('g1','0')),
    W('w2', pId('v1','0'), pId('r1','0'), [{x: 370, y: 300}]),
    W('w3', pId('r1','1'), pId('l1','0')),
    W('w4', pId('l1','1'), pId('g2','0')),
  ],
});

const blinkerCircuit = () => ({
  components: [
    mkSrc('v1', 100, 100, 9), mkGndComp('g1', 40, 100),
    mkRes('r1', 260, 180, 470, 90), mkLed('l1', 260, 280, 'RED', 90),
    mkRes('r4', 540, 180, 470, 90), mkLed('l2', 540, 280, 'GREEN', 90),
    mkRes('r2', 340, 180, 22000, 90), mkRes('r3', 460, 180, 22000, 90),
    mkNPN('q1', 260, 420), mkNPN('q2', 540, 420),
    mkGndComp('g2', 290, 480), mkGndComp('g3', 570, 480),
    mkCap('c1', 400, 340, 100, 0, 8), mkCap('c2', 400, 260, 100, 0, -8),
  ],
  wires: [
    W('w1', pId('v1','1'), pId('g1','0')),
    W('w2', pId('v1','0'), pId('r1','0'), [{x: 260, y: 100}]), W('w3', pId('r1','0'), pId('r2','0')),
    W('w4', pId('r2','0'), pId('r3','0')), W('w5', pId('r3','0'), pId('r4','0')),
    W('w6', pId('r1','1'), pId('l1','0')), W('w7', pId('l1','1'), pId('q1','1')),
    W('w8', pId('r4','1'), pId('l2','0')), W('w9', pId('l2','1'), pId('q2','1')),
    W('w10', pId('q1','2'), pId('g2','0')), W('w11', pId('q2','2'), pId('g3','0')),
    W('w12', pId('l1','1'), pId('c1','0'), [{x: 290, y: 340}]),
    W('w13', pId('c1','1'), pId('q2','0'), [{x: 510, y: 340}, {x: 510, y: 420}]),
    W('w14', pId('l2','1'), pId('c2','1'), [{x: 510, y: 260}]),
    W('w15', pId('c2','0'), pId('q1','0'), [{x: 230, y: 260}, {x: 230, y: 420}]),
    W('w16', pId('r2','1'), pId('q1','0'), [{x: 340, y: 420}]), W('w17', pId('r3','1'), pId('q2','0'), [{x: 460, y: 420}]),
  ],
});

const npnSwitchCircuit = () => ({
  components: [
    mkSrc('v1', 100, 200, 9), mkGndComp('gv1', 40, 200),
    mkSwitch('sw1', 240, 100, false), mkRes('rb1', 380, 100, 1000),
    mkNPN('q1', 500, 200), mkBulb('bl1', 500, 80, 60, 90), mkGndComp('gb1', 530, 260),
  ],
  wires: [
    W('w1', pId('v1','1'), pId('gv1','0')),
    W('w2', pId('v1','0'), pId('sw1','0'), [{x: 130, y: 100}]),
    W('w3', pId('v1','0'), pId('bl1','0'), [{x: 130, y: 50}, {x: 500, y: 50}]),
    W('w4', pId('sw1','1'), pId('rb1','0')), W('w5', pId('rb1','1'), pId('q1','0')),
    W('w6', pId('bl1','1'), pId('q1','1')), W('w7', pId('q1','2'), pId('gb1','0')),
  ],
});

const digitalShowcase = () => {
  const Vcc = 'ds_vcc', Gnd = 'ds_gnd';
  const SwA = 'sw_a', SwB = 'sw_b', PushClk = 'push_clk';
  const And = 'gt_and', Xor = 'gt_xor';
  const Cnt = 'ic_cnt', Dec = 'ic_dec', Seg = 'dp_seg';

  return {
    components: [
      // Top: Power Source
      mkSrc(Vcc, 60, 20, 5), mkGndComp(Gnd, 20, 20),

      // Column 1: Inputs with Pull-downs (Shifted down)
      mkSwitch(SwA, 100, 140, true, 'Switch A'), 
      mkRes('ra', 100, 200, 1000, 90), mkGndComp('ga', 100, 240),
      
      mkSwitch(SwB, 100, 280, false, 'Switch B'), 
      mkRes('rb', 100, 340, 1000, 90), mkGndComp('gb', 100, 380),

      mkPushButton(PushClk, 100, 460, 'Manual Clock'), 
      mkRes('rc', 100, 520, 1000, 90), mkGndComp('gc', 100, 560),

      // Column 2: Logic Gates
      mkGate(And, 'AND_GATE', 360, 155), 
      mkGate(Xor, 'XOR_GATE', 360, 315),

      // Column 3: Logic Indicators
      mkRes('rl1', 460, 155, 220), mkLed('l1', 520, 155, 'RED'), mkGndComp('gl1', 560, 155),
      mkRes('rl2', 460, 315, 220), mkLed('l2', 520, 315, 'BLUE'), mkGndComp('gl2', 560, 315),

      // Processing Area (Lower section, shifted further right)
      mkCounter(Cnt, 360, 480), 
      mkDecoder(Dec, 560, 480), 
      mk7Seg(Seg, 760, 480),

      mkGndComp('icg1', 360, 540), mkGndComp('icg2', 560, 540), mkGndComp('icg3', 800, 480),
    ],
    wires: [
      W('pw1', pId(Vcc, '1'), pId(Gnd, '0')),
      
      // VCC Power Bus (Vertical line at x=70)
      W('bu1', pId(Vcc, '0'), pId(SwA, '0'), [{x: 70, y: 20}, {x: 70, y: 140}]),
      W('bu2', pId(SwA, '0'), pId(SwB, '0')),
      W('bu3', pId(SwB, '0'), pId(PushClk, '0')),
      W('bu4', pId(PushClk, '0'), pId(Cnt, '9'), [{x: 70, y: 600}, {x: 360, y: 600}, {x: 360, y: 440}]),
      W('bu5', pId(Cnt, '9'), pId(Dec, '12'), [{x: 360, y: 435}, {x: 560, y: 435}]),
      // R1/R2 are floating (Logic 0) so the counter can count.

      // Logic "A" Bus (Connects SwA output to AND0 and XOR0)
      W('la1', pId(SwA, '1'), pId(And, '0')),
      W('la2', pId(SwA, '1'), pId(Xor, '0'), [{x: 130, y: 140}, {x: 130, y: 300}, {x: 330, y: 300}]),

      // Logic "B" Bus (Connects SwB output to AND1 and XOR1)
      W('lb1', pId(SwB, '1'), pId(Xor, '1'), [{x: 130, y: 280}, {x: 150, y: 280}, {x: 150, y: 330}, {x: 330, y: 330}]),
      W('lb2', pId(SwB, '1'), pId(And, '1'), [{x: 130, y: 280}, {x: 150, y: 280}, {x: 150, y: 170}, {x: 330, y: 170}]),

      // Pull-downs
      W('ir1', pId(SwA, '1'), pId('ra', '0')), W('ir2', pId('ra', '1'), pId('ga', '0')),
      W('ir3', pId(SwB, '1'), pId('rb', '0')), W('ir4', pId('rb', '1'), pId('gb', '0')),
      W('ir5', pId(PushClk, '1'), pId('rc', '0')), W('ir6', pId('rc', '1'), pId('gc', '0')),

      // Internal Gate to Indicator Connections
      W('ol1', pId(And, '2'), pId('rl1', '0')), W('ol2', pId('rl1', '1'), pId('l1', '0')), W('ol3', pId('l1', '1'), pId('gl1', '0')),
      W('ol4', pId(Xor, '2'), pId('rl2', '0')), W('ol5', pId('rl2', '1'), pId('l2', '0')), W('ol6', pId('l2', '1'), pId('gl2', '0')),

      // Counter Control Line
      W('ic1', pId(PushClk, '1'), pId(Cnt, '0'), [{x: 130, y: 460}, {x: 130, y: 465}, {x: 330, y: 465}]),
      W('ig1', pId(Cnt, '8'), pId('icg1', '0')),
      W('ig2', pId(Dec, '11'), pId('icg2', '0')),

      // BCD Data Bus
      W('iq0', pId(Cnt, '3'), pId(Dec, '0')), W('iq1', pId(Cnt, '4'), pId(Dec, '1')),
      W('iq2', pId(Cnt, '5'), pId(Dec, '2')), W('iq3', pId(Cnt, '6'), pId(Dec, '3')),

      // Display Connections
      W('is1', pId(Dec, '4'), pId(Seg, '0')), W('is2', pId(Dec, '5'), pId(Seg, '1')),
      W('is3', pId(Dec, '6'), pId(Seg, '2')), W('is4', pId(Dec, '7'), pId(Seg, '3')),
      W('is5', pId(Dec, '8'), pId(Seg, '4')), W('is6', pId(Dec, '9'), pId(Seg, '5')),
      W('is7', pId(Dec, '10'), pId(Seg, '6')),
      W('im1', pId(Seg, '8'), pId('icg3', '0')),
    ]
  };
};

const cascadedCounterExample = () => {
  const Clk = 'clk1', C1 = 'cnt1', C2 = 'cnt2', D1 = 'dec1', D2 = 'dec2', S1 = 'seg1', S2 = 'seg2';
  const BtnRst = 'btn_rst', ResRst = 'res_rst';
  const Vcc = 'pwr_vcc', Gnd = 'pwr_gnd';

  return {
    components: [
      // Column 0: Power Source
      mkSrc(Vcc, 60, 40, 5), mkGndComp(Gnd, 120, 40),
      
      // Column 1: Control Components
      mkClock(Clk, 100, 220, 4), // 4 Hz clock
      mkPushButton(BtnRst, 100, 400, 'Master Reset'),
      mkRes(ResRst, 100, 470, 1000, 90), mkGndComp('grst', 100, 510),

      // Column 2: Digital Logic (Tens)
      mkCounter(C2, 320, 150),
      mkDecoder(D2, 480, 150),
      mk7Seg(S2, 640, 150),

      // Column 2: Digital Logic (Units)
      mkCounter(C1, 320, 350),
      mkDecoder(D1, 480, 350),
      mk7Seg(S1, 720, 150),

      // Support Grounds
      mkGndComp('g1', 80, 220),           // Clock ground
      mkGndComp('gc1', 320, 410), mkGndComp('gc2', 320, 210),
      mkGndComp('gd1', 480, 410), mkGndComp('gd2', 480, 210),
      mkGndComp('gs1', 720, 210), mkGndComp('gs2', 640, 210),
    ],
    wires: [
      W('w_p1', pId(Vcc, '1'), pId(Gnd, '0')),
      
      // Vertical VCC Bus at X=40
      W('vcc_b1', pId(Vcc, '0'), pId(BtnRst, '0'), [{x: 40, y: 40}, {x: 40, y: 400}]),
      W('vcc_b2', pId(Vcc, '0'), pId(C2, '9'), [{x: 40, y: 40}, {x: 40, y: 100}, {x: 320, y: 100}]),
      W('vcc_b3', pId(C2, '9'), pId(D2, '12'), [{x: 320, y: 100}, {x: 480, y: 100}]),
      W('vcc_b4', pId(D2, '12'), pId(C1, '9'), [{x: 480, y: 100}, {x: 520, y: 100}, {x: 520, y: 300}, {x: 320, y: 300}]),
      W('vcc_b5', pId(C1, '9'), pId(D1, '12'), [{x: 320, y: 300}, {x: 480, y: 300}]),

      // Tie R2 to VCC (X=280 Bus)
      W('wr_c2v', pId(C2, '2'), pId(C2, '9'), [{x: 280, y: 160}, {x: 280, y: 100}, {x: 320, y: 100}]),
      W('wr_c1v', pId(C1, '2'), pId(C1, '9'), [{x: 280, y: 360}, {x: 280, y: 300}, {x: 320, y: 300}]),

      // Reset Signal Pull-down
      W('wr_d', pId(BtnRst, '1'), pId(ResRst, '0')),
      W('wr_g', pId(ResRst, '1'), pId('grst', '0')),

      // Reset Master Bus (Connect BtnRst OUT to both R1)
      W('wr_m1', pId(BtnRst, '1'), pId(C1, '1'), [{x: 160, y: 400}, {x: 160, y: 340}, {x: 280, y: 340}]),
      W('wr_m2', pId(C1, '1'), pId(C2, '1'), [{x: 280, y: 340}, {x: 220, y: 340}, {x: 220, y: 140}, {x: 280, y: 140}]),

      // Clock Signal (Connect Clock OUT to Units CLK)
      W('w_c1', pId(Clk, '1'), pId(C1, '0'), [{x: 140, y: 220}, {x: 140, y: 320}, {x: 280, y: 320}]),
      W('w_cg1', pId(Clk, '0'), pId('g1', '0')),

      // Grounds for ICs
      W('w_cg2', pId(C1, '8'), pId('gc1', '0')), W('w_cg3', pId(C2, '8'), pId('gc2', '0')),
      W('w_dg1', pId(D1, '11'), pId('gd1', '0')), W('w_dg2', pId(D2, '11'), pId('gd2', '0')),
      W('w_sg1', pId(S1, '8'), pId('gs1', '0')), W('w_sg2', pId(S2, '8'), pId('gs2', '0')),

      // Cascade Line: C1 Overflow -> C2 Clock
      W('w_cas', pId(C1, '7'), pId(C2, '0'), [{x: 370, y: 390}, {x: 370, y: 440}, {x: 250, y: 440}, {x: 250, y: 120}, {x: 280, y: 120}]),

      // BCD Units (Bottom -> Middle display)
      W('du0', pId(C1, '3'), pId(D1, '0')), W('du1', pId(C1, '4'), pId(D1, '1')),
      W('du2', pId(C1, '5'), pId(D1, '2')), W('du3', pId(C1, '6'), pId(D1, '3')),
      W('dt0', pId(C2, '3'), pId(D2, '0')), W('dt1', pId(C2, '4'), pId(D2, '1')),
      W('dt2', pId(C2, '5'), pId(D2, '2')), W('dt3', pId(C2, '6'), pId(D2, '3')),

      // Seven Segment 2 (Tens)
      W('s2_a', pId(D2, '4'), pId(S2, '0')), W('s2_b', pId(D2, '5'), pId(S2, '1')),
      W('s2_c', pId(D2, '6'), pId(S2, '2')), W('s2_d', pId(D2, '7'), pId(S2, '3')),
      W('s2_e', pId(D2, '8'), pId(S2, '4')), W('s2_f', pId(D2, '9'), pId(S2, '5')),
      W('s2_g', pId(D2, '10'), pId(S2, '6')),

      // Seven Segment 1 (Units) - Routed to avoid D2/S2 overlap
      W('s1_a', pId(D1, '4'), pId(S1, '0'), [{x: 540, y: 320}, {x: 540, y: 120}, {x: 680, y: 120}]),
      W('s1_b', pId(D1, '5'), pId(S1, '1'), [{x: 550, y: 330}, {x: 550, y: 130}, {x: 680, y: 130}]),
      W('s1_c', pId(D1, '6'), pId(S1, '2'), [{x: 560, y: 340}, {x: 560, y: 140}, {x: 680, y: 140}]),
      W('s1_d', pId(D1, '7'), pId(S1, '3'), [{x: 570, y: 350}, {x: 570, y: 150}, {x: 680, y: 150}]),
      W('s1_e', pId(D1, '8'), pId(S1, '4'), [{x: 580, y: 360}, {x: 580, y: 160}, {x: 680, y: 160}]),
      W('s1_f', pId(D1, '9'), pId(S1, '5'), [{x: 590, y: 370}, {x: 590, y: 170}, {x: 680, y: 170}]),
      W('s1_g', pId(D1, '10'), pId(S1, '6'), [{x: 600, y: 380}, {x: 600, y: 180}, {x: 680, y: 180}]),
    ]
  };
};

const rectifierCircuit = () => {
  const AC = 'ac1', GRef = 'g_ref', C = 'c_smooth', REG = 'reg1', R = 'r_load';
  const D1 = 'd1', D2 = 'd2', D3 = 'd3', D4 = 'd4';

  return {
    components: [
      mkAcSrc(AC, 100, 300, 20, 2), // 20V peak AC for 12V regulation headroom
      mkGndComp(GRef, 60, 300),
      
      // Bridge Rectifier (Standard Orientation)
      mkDiode(D1, 350, 220),         
      mkDiode(D2, 450, 220, 180),    
      mkDiode(D3, 350, 380, 180),    
      mkDiode(D4, 450, 380),         
      
      // Filtering & Regulation
      mkCap(C, 580, 300, 100, 90), 
      mkReg(REG, 740, 260, 12),    // 7812 Typical
      mkRes(R, 880, 300, 470, 90), 
      
      mkGndComp('g_dc', 580, 370),
      mkGndComp('g_reg', 740, 370),
      mkGndComp('g_load', 880, 370),
    ],
    wires: [
      W('w_ac_src_g', pId(AC, '0'), pId(GRef, '0')),
      
      // AC Input 1: From AC source to Junction D1(A) - D3(C)
      W('w_in_a1', pId(AC, '1'), pId(D1, '0'), [{x: 220, y: 300}, {x: 220, y: 220}, {x: 320, y: 220}]),
      W('w_in_a2', pId(D1, '0'), pId(D3, '1'), [{x: 320, y: 220}, {x: 320, y: 380}]),
      
      // AC Input 2: From Gnd to Junction D2(A) - D4(C)
      W('w_in_b1', pId(GRef, '0'), pId(D2, '0'), [{x: 60, y: 150}, {x: 480, y: 150}, {x: 480, y: 220}]),
      W('w_in_b2', pId(D2, '0'), pId(D4, '1'), [{x: 480, y: 220}, {x: 480, y: 380}]),
      
      // DC+ Rail: Junction D1(C) - D2(C) -> Cap(+) -> Reg(IN)
      W('w_dc_pos1', pId(D1, '1'), pId(D2, '1'), [{x: 380, y: 180}, {x: 420, y: 180}, {x: 420, y: 220}]),
      W('w_dc_pos2', pId(D2, '1'), pId(C, '0'), [{x: 420, y: 220}, {x: 580, y: 220}, {x: 580, y: 270}]),
      W('w_reg_in', pId(C, '0'), pId(REG, '0'), [{x: 580, y: 270}, {x: 700, y: 260}]),
      
      // DC- Rail (Gnd): Junction D3(A) - D4(A) -> Gnd
      W('w_dc_neg1', pId(D3, '0'), pId(D4, '0'), [{x: 380, y: 420}, {x: 420, y: 420}, {x: 420, y: 380}]),
      W('w_dc_neg2', pId(D4, '0'), pId('g_dc', '0'), [{x: 420, y: 380}, {x: 580, y: 380}, {x: 580, y: 370}]),
      
      // Capacitor Gnd
      W('w_cap_g', pId(C, '1'), pId('g_dc', '0')),
      
      // Regulator Output -> Load
      W('w_reg_out', pId(REG, '1'), pId(R, '0'), [{x: 780, y: 260}, {x: 880, y: 260}, {x: 880, y: 270}]),
      
      // Regulator and Load Grounds
      W('w_reg_g', pId(REG, '2'), pId('g_reg', '0')),
      W('w_res_g', pId(R, '1'), pId('g_load', '0')),
    ]
  };
};

export const EXAMPLE_CIRCUITS = [
  {
    id: 'cascaded-counter',
    name: '00-99 Automatic Counter',
    description: 'Two decade counters chained together with a pulse generator (clock). Displays side-by-side.',
    tags: ['Digital', 'Automated', 'Counter'],
    icon: '⏲️',
    circuit: cascadedCounterExample(),
  },
  {
    id: 'digital-logic-simple',
    name: 'Clean Digital Playground',
    description: 'Perfectly aligned ICs with straight wiring.',
    tags: ['Digital', 'Clean', 'Logic'],
    icon: '🧠',
    circuit: digitalShowcase(),
  },
  {
    id: 'transistor-blinker',
    name: 'Transistor Blinker',
    description: 'Astable Multivibrator using 2 NPN transistors.',
    tags: ['NPN', 'Capacitor', 'Blink'],
    icon: '🚥',
    circuit: blinkerCircuit(),
  },
  {
    id: 'led-resistor',
    name: 'LED + Resistor',
    description: 'Simple LED circuit.',
    tags: ['LED', 'Resistor'],
    icon: '💡',
    circuit: ledCircuit(),
  },
  {
    id: 'npn-switch',
    name: 'NPN Transistor Switch',
    description: 'Transistor as a switch.',
    tags: ['NPN', 'Switch'],
    icon: '🔌',
    circuit: npnSwitchCircuit(),
  },
  {
    id: 'bridge-rectifier',
    name: 'Bridge Rectifier',
    description: 'Converts AC to DC using a 4-diode bridge and a capacitor for smoothing.',
    tags: ['AC', 'Diode', 'Rectifier', 'Capacitor'],
    icon: '🌉',
    circuit: rectifierCircuit(),
  },
];
