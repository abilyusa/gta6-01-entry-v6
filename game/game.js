// Cinder Reef — game.js (part 1 of 3)
// A 2D top-down open-world crime game on a fictional volcanic island.
// Plain canvas, no libraries, no network. The world is 2400x2400 with a
// road grid, 7 named districts, a volcano in the middle, traffic on the
// roads, pedestrians on the sidewalks, and an escalating police dispatch.
//
// This file is written in three parts: (1) helpers, input, world and
// spawning; (2) the per-frame update (player, traffic, police, wanted,
// shooting, garage); (3) rendering, HUD, minimap, screens and boot.

(function (global) {
  'use strict';

  // ------------------------------------------------------------------ helpers

  var WORLD = 2400;
  var ROAD_W = 100;
  var ROADS_X = [300, 700, 1100, 1500, 1900];
  var ROADS_Y = [300, 700, 1100, 1500, 1900];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ input

  function makeInput() {
    var input = {
      up: false, down: false, left: false, right: false,
      eHeld: false, ePressed: false, // E is edge-triggered: ePressed is set once per keydown
      qPressed: false, rPressed: false, escPressed: false,
      mouseX: 640, mouseY: 360, mouseDown: false, clicked: false,
    };
    var keys = {};
    function code(e) { return e.code || e.key; }
    window.addEventListener('keydown', function (e) {
      var c = code(e);
      if (c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight' || c === 'Space') e.preventDefault();
      if (keys[c]) return;
      keys[c] = true;
      if (c === 'KeyW' || c === 'ArrowUp') input.up = true;
      if (c === 'KeyS' || c === 'ArrowDown') input.down = true;
      if (c === 'KeyA' || c === 'ArrowLeft') input.left = true;
      if (c === 'KeyD' || c === 'ArrowRight') input.right = true;
      if (c === 'KeyE') { input.eHeld = true; input.ePressed = true; }
      if (c === 'KeyQ') input.qPressed = true;
      if (c === 'KeyR') input.rPressed = true;
      if (c === 'Escape') input.escPressed = true;
      if (c === 'Enter') input.enterPressed = true;
    });
    window.addEventListener('keyup', function (e) {
      var c = code(e);
      keys[c] = false;
      if (c === 'KeyW' || c === 'ArrowUp') input.up = false;
      if (c === 'KeyS' || c === 'ArrowDown') input.down = false;
      if (c === 'KeyA' || c === 'ArrowLeft') input.left = false;
      if (c === 'KeyD' || c === 'ArrowRight') input.right = false;
      if (c === 'KeyE') input.eHeld = false;
    });
    window.addEventListener('mousemove', function (e) {
      var r = gameCanvas.getBoundingClientRect();
      input.mouseX = (e.clientX - r.left) * (1280 / r.width);
      input.mouseY = (e.clientY - r.top) * (720 / r.height);
    });
    window.addEventListener('mousedown', function (e) {
      if (e.button === 0) { input.mouseDown = true; input.clicked = true; }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) input.mouseDown = false;
    });
    return input;
  }

  // The canvas is created in part 3; the input factory reads it lazily.
  var gameCanvas = null;

  // ------------------------------------------------------------------ world

  var DISTRICTS = [
    { name: 'Marina', x0: 0, y0: 0, x1: 700, y1: 700, ground: '#c9b489', label: '#5a4a28' },
    { name: 'Casino Row', x0: 700, y0: 0, x1: 1500, y1: 700, ground: '#3d3350', label: '#d8c9ff' },
    { name: 'Airfield', x0: 1500, y0: 0, x1: 2400, y1: 700, ground: '#4a4a42', label: '#e8e8d8' },
    { name: 'Old Town', x0: 0, y0: 700, x1: 700, y1: 1500, ground: '#6b5a44', label: '#f0e0c0' },
    { name: 'Neon Strip', x0: 700, y0: 700, x1: 1500, y1: 1500, ground: '#2c2138', label: '#ff7ad9' },
    { name: 'Palm Heights', x0: 1500, y0: 700, x1: 2400, y1: 1500, ground: '#3f5a3a', label: '#d0f0c0' },
    { name: 'Docks', x0: 0, y0: 1500, x1: 2400, y1: 2400, ground: '#54432e', label: '#ffe0a0' },
  ];

  var VOLCANO = { x: 1300, y: 1300, r: 120 };

  // Places the missions use. `kind` is drawn on the map.
  var PLACES = [
    { id: 'garage', x: 400, y: 2000, label: 'GARAGE', color: '#ffd23f' },
    { id: 'safehouse', x: 350, y: 900, label: 'SAFEHOUSE', color: '#7dff8a' },
    { id: 'club', x: 1200, y: 900, label: 'CLUB NEON', color: '#ff7ad9' },
    { id: 'bank', x: 1000, y: 400, label: 'BANK', color: '#9fd8ff' },
    { id: 'casino', x: 1300, y: 400, label: 'CASINO', color: '#ff5d5d' },
    { id: 'airfield', x: 1900, y: 350, label: 'AIRFIELD', color: '#e8e8d8' },
    { id: 'yacht', x: 350, y: 350, label: 'YACHT', color: '#7dd8ff' },
    { id: 'warehouse', x: 650, y: 2050, label: 'WAREHOUSE', color: '#ffb347' },
  ];

  function onRoad(x, y) {
    for (var i = 0; i < ROADS_X.length; i++) if (Math.abs(x - ROADS_X[i]) < ROAD_W / 2) return true;
    for (var j = 0; j < ROADS_Y.length; j++) if (Math.abs(y - ROADS_Y[j]) < ROAD_W / 2) return true;
    return false;
  }

  function nearestRoadCoord(v, roads) {
    var best = roads[0], bd = 1e9;
    for (var i = 0; i < roads.length; i++) {
      var d = Math.abs(v - roads[i]);
      if (d < bd) { bd = d; best = roads[i]; }
    }
    return best;
  }

  var BUILDING_COLORS = ['#8a7a5f', '#7a6a8a', '#5f7a8a', '#8a5f5f', '#6a7a5f', '#94805a', '#5f6a7a', '#a08a6a'];

  function buildWorld(rng) {
    var buildings = [];
    // Blocks are the cells between neighbouring roads (and the edges).
    var xs = [0].concat(ROADS_X, [WORLD]);
    var ys = [0].concat(ROADS_Y, [WORLD]);
    for (var bi = 0; bi < xs.length - 1; bi++) {
      for (var bj = 0; bj < ys.length - 1; bj++) {
        var x0 = xs[bi] + ROAD_W / 2 + 14;
        var x1 = xs[bi + 1] - ROAD_W / 2 - 14;
        var y0 = ys[bj] + ROAD_W / 2 + 14;
        var y1 = ys[bj + 1] - ROAD_W / 2 - 14;
        if (x1 - x0 < 60 || y1 - y0 < 60) continue;
        var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        // Keep the volcano block and every mission place clear.
        if (dist(cx, cy, VOLCANO.x, VOLCANO.y) < VOLCANO.r + 160) continue;
        var blocked = false;
        for (var p = 0; p < PLACES.length; p++) {
          if (PLACES[p].x > x0 - 90 && PLACES[p].x < x1 + 90 && PLACES[p].y > y0 - 90 && PLACES[p].y < y1 + 90) { blocked = true; break; }
        }
        if (blocked) continue;
        var n = 1 + Math.floor(rng() * 3);
        for (var k = 0; k < n; k++) {
          var w = 60 + rng() * 90, h = 60 + rng() * 90;
          var bx = x0 + 10 + rng() * Math.max(1, (x1 - x0 - w - 20));
          var by = y0 + 10 + rng() * Math.max(1, (y1 - y0 - h - 20));
          buildings.push({
            x: bx, y: by, w: w, h: h,
            color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)],
            roof: rng() < 0.4,
          });
        }
      }
    }
    return { buildings: buildings };
  }

  // ------------------------------------------------------------------ entities

  var CAR_TYPES = {
    sedan: { w: 46, h: 22, maxSpeed: 6.2, accel: 0.14, color: '#7a8ba0', name: 'Sedan' },
    comet: { w: 46, h: 22, maxSpeed: 7.8, accel: 0.18, color: '#d21f2b', name: 'Comet' },
    van: { w: 54, h: 24, maxSpeed: 5.4, accel: 0.11, color: '#e8e8e8', name: 'Armored Van' },
    truck: { w: 62, h: 26, maxSpeed: 4.8, accel: 0.09, color: '#e07b1f', name: 'Cargo Truck' },
    taxi: { w: 46, h: 22, maxSpeed: 6.0, accel: 0.13, color: '#f2c200', name: 'Taxi' },
    police: { w: 48, h: 22, maxSpeed: 6.8, accel: 0.16, color: '#1a1a22', name: 'Police' },
  };

  function makeCar(kind, x, y, angle) {
    var t = CAR_TYPES[kind] || CAR_TYPES.sedan;
    return {
      kind: kind, id: null, x: x, y: y, angle: angle || 0, speed: 0,
      w: t.w, h: t.h, maxSpeed: t.maxSpeed, accel: t.accel, color: t.color,
      health: 100, dead: false, isPolice: kind === 'police',
      isTraffic: false, isMission: false, parked: false,
      ramCd: 0, ai: null,
    };
  }

  function makePedestrian(rng) {
    // Pedestrians walk the sidewalks: 70px off a road's centre line.
    var horiz = rng() < 0.5;
    var road = horiz ? ROADS_Y[Math.floor(rng() * ROADS_Y.length)] : ROADS_X[Math.floor(rng() * ROADS_X.length)];
    var along = 120 + rng() * (WORLD - 240);
    return {
      x: horiz ? along : road + (rng() < 0.5 ? -70 : 70),
      y: horiz ? road + (rng() < 0.5 ? -70 : 70) : along,
      horiz: horiz, road: road, dir: rng() < 0.5 ? 1 : -1,
      speed: 0.5 + rng() * 0.5, hue: Math.floor(rng() * 360),
    };
  }

  // ------------------------------------------------------------------ game state

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rng = mulberry32((Math.random() * 1e9) | 0);
    var q = new URLSearchParams(window.location.search);
    var seed = parseInt(q.get('seed') || '0', 10);
    if (seed) this.rng = mulberry32(seed);
    this.shot = q.get('shot') || '';
    this.world = buildWorld(this.rng);
    gameCanvas = canvas; // input handlers read the canvas rect for the mouse
    this.input = makeInput();
    this.audio = new AudioSys();
    this.missions = new MissionManager(this);
    this.state = 'title'; // title | playing | paused | win | lose
    this.loseKind = '';
    this.time = 0;
    this.cash = 0;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.crimeCooldown = 0;
    this.player = {
      x: 500, y: 2000, angle: -Math.PI / 2, speed: 0,
      onFoot: true, inCar: null, health: 100, ammo: 24,
      busted: 0, footAngle: -Math.PI / 2,
    };
    this.cars = [];
    this.peds = [];
    this.police = [];
    this.bullets = [];
    this.particles = [];
    this.heli = null; // {x, y, disabled}
    this.heliDisabled = 0;
    this.maraUnlocked = false;
    this.abilityCd = 0;
    this.abilityActive = 0;
    this.missionCar = null;
    this.garageSlots = [
      { x: 330, y: 1970, car: null },
      { x: 400, y: 1970, car: null },
      { x: 470, y: 1970, car: null },
    ];
    this.camera = { x: 500, y: 2000 };
    this.shake = 0;
    this.stats = { shots: 0, hits: 0, copsDown: 0, carsStolen: 0 };
    this.roadblocks = [];
    this.titleT = 0;
    this.spawnTraffic();
    this.spawnPeds();
  }

  Game.prototype.spawnTraffic = function () {
    var kinds = ['sedan', 'sedan', 'taxi', 'sedan', 'van'];
    for (var i = 0; i < 14; i++) {
      var horiz = this.rng() < 0.5;
      var road = horiz
        ? ROADS_Y[Math.floor(this.rng() * ROADS_Y.length)]
        : ROADS_X[Math.floor(this.rng() * ROADS_X.length)];
      var along = 150 + this.rng() * (WORLD - 300);
      var dir = this.rng() < 0.5 ? 1 : -1;
      var lane = (this.rng() < 0.5 ? -22 : 22);
      var car = makeCar(kinds[Math.floor(this.rng() * kinds.length)],
        horiz ? along : road + lane,
        horiz ? road + lane : along,
        horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      car.speed = 2 + this.rng() * 1.2;
      car.isTraffic = true;
      car.ai = { horiz: horiz, road: road, dir: dir, lane: lane };
      this.cars.push(car);
    }
  };

  Game.prototype.spawnPeds = function () {
    for (var i = 0; i < 16; i++) this.peds.push(makePedestrian(this.rng));
  };

  Game.prototype.findCar = function (id) {
    for (var i = 0; i < this.cars.length; i++) if (this.cars[i].id === id) return this.cars[i];
    return null;
  };

  Game.prototype.spawnMissionCar = function (spec) {
    var old = this.findCar(spec.id);
    if (old) this.removeCar(old);
    var car = makeCar(spec.kind, spec.x, spec.y, spec.angle);
    car.id = spec.id;
    car.isMission = true;
    this.cars.push(car);
    this.missionCar = car;
    return car;
  };

  Game.prototype.clearMissionCar = function () {
    // The delivered car stays in the world (parked in the garage when the
    // mission ended there); only the "mission car" reference is cleared.
    this.missionCar = null;
  };

  Game.prototype.removeCar = function (car) {
    var i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    var j = this.police.indexOf(car);
    if (j >= 0) this.police.splice(j, 1);
    if (this.player.inCar === car) { this.player.inCar = null; this.player.onFoot = true; }
    if (this.missionCar === car) this.missionCar = null;
  };

  Game.prototype.parkInGarage = function (car) {
    for (var i = 0; i < this.garageSlots.length; i++) {
      var slot = this.garageSlots[i];
      if (!slot.car || slot.car.dead) {
        slot.car = car;
        car.parked = true;
        car.x = slot.x;
        car.y = slot.y;
        car.angle = -Math.PI / 2;
        car.speed = 0;
        return true;
      }
    }
    return false;
  };

  Game.prototype.nearestPoliceDist = function () {
    var best = null;
    for (var i = 0; i < this.police.length; i++) {
      var d = dist(this.player.x, this.player.y, this.police[i].x, this.police[i].y);
      if (best === null || d < best) best = d;
    }
    if (this.heli && this.heliDisabled <= 0) {
      var dh = dist(this.player.x, this.player.y, this.heli.x, this.heli.y);
      if (best === null || dh < best) best = dh;
    }
    return best;
  };

  Game.prototype.setWanted = function (level, force) {
    level = clamp(level, 0, 5);
    if (force) { this.wanted = level; this.wantedTimer = 0; }
    else if (level > this.wanted) { this.wanted = level; this.wantedTimer = 0; }
  };

  Game.prototype.commitCrime = function (amount) {
    if (this.crimeCooldown > 0) return;
    this.crimeCooldown = 2;
    this.setWanted(this.wanted + amount, false);
  };

  Game.prototype.spawnHelicopter = function (scripted) {
    if (!this.heli) {
      this.heli = { x: this.player.x + 200, y: this.player.y - 200, angle: 0 };
    }
    this.heliDisabled = 0;
  };

  Game.prototype.respawnPlayer = function () {
    var p = this.player;
    if (p.inCar) { p.inCar = null; }
    p.x = 500; p.y = 2000; p.onFoot = true;
    p.health = 100; p.ammo = 24; p.busted = 0; p.speed = 0;
    p.footAngle = -Math.PI / 2;
    // Always leave a drivable car next to the player so a mission can
    // never soft-lock for lack of a vehicle.
    var near = false;
    for (var i = 0; i < this.cars.length; i++) {
      if (!this.cars[i].isPolice && dist(p.x, p.y, this.cars[i].x, this.cars[i].y) < 200) { near = true; break; }
    }
    if (!near) {
      var car = makeCar('sedan', 560, 2000, -Math.PI / 2);
      this.cars.push(car);
    }
  };

  Game.prototype.winGame = function () {
    this.state = 'win';
    this.audio.cash();
  };

  Game.prototype.loseGame = function (kind) {
    if (this.state !== 'playing') return;
    this.state = 'lose';
    this.loseKind = kind;
    this.audio.busted();
  };

  // Expose the constructor for part 3's boot code.
  global.CinderGame = Game;
  global.__cinderPart1 = { WORLD: WORLD, ROADS_X: ROADS_X, ROADS_Y: ROADS_Y, ROAD_W: ROAD_W, DISTRICTS: DISTRICTS, VOLCANO: VOLCANO, PLACES: PLACES, CAR_TYPES: CAR_TYPES, makeCar: makeCar, clamp: clamp, dist: dist, angDiff: angDiff, onRoad: onRoad, nearestRoadCoord: nearestRoadCoord };
})(typeof window !== 'undefined' ? window : globalThis);

// Cinder Reef — game.js (part 2 of 3): the per-frame update.

(function (global) {
  'use strict';
  var Game = global.CinderGame;
  var P = global.__cinderPart1;
  var WORLD = P.WORLD, ROADS_X = P.ROADS_X, ROADS_Y = P.ROADS_Y;
  var clamp = P.clamp, dist = P.dist, angDiff = P.angDiff, onRoad = P.onRoad;
  var makeCar = P.makeCar;
  var nearestRoadCoord = P.nearestRoadCoord;

  function circleHitsBuilding(x, y, r, buildings) {
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      var cx = clamp(x, b.x, b.x + b.w);
      var cy = clamp(y, b.y, b.y + b.h);
      if (dist(x, y, cx, cy) < r) return b;
    }
    return null;
  }

  function pushOutOfBuildings(ent, r, buildings) {
    var b = circleHitsBuilding(ent.x, ent.y, r, buildings);
    if (!b) return;
    var cx = clamp(ent.x, b.x, b.x + b.w);
    var cy = clamp(ent.y, b.y, b.y + b.h);
    var dx = ent.x - cx, dy = ent.y - cy;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var push = r - d + 1;
    ent.x += (dx / d) * push;
    ent.y += (dy / d) * push;
    if (ent.speed !== undefined) ent.speed *= 0.5;
  }

  function pushOutOfVolcano(ent, r) {
    var v = P.VOLCANO;
    var d = dist(ent.x, ent.y, v.x, v.y);
    if (d < v.r + r) {
      var dx = ent.x - v.x, dy = ent.y - v.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 0.001;
      ent.x = v.x + (dx / len) * (v.r + r);
      ent.y = v.y + (dy / len) * (v.r + r);
      if (ent.speed !== undefined) ent.speed *= 0.5;
    }
  }

  Game.prototype.startGame = function () {
    this.audio.unlock();
    this.audio.engineStart();
    this.state = 'playing';
    this.missions.startMission(0);
  };

  Game.prototype.applyShot = function () {
    if (this.shot === 'play') {
      this.startGame();
      var car = makeCar('sedan', 1200, 1100, 0);
      car.color = '#3f8cff';
      this.cars.push(car);
      this.enterCar(car, true);
      this.player.speed = 0;
      this.input.up = true; // drive off down Neon Strip for the shot
    } else if (this.shot === 'action') {
      this.startGame();
      this.missions.startMission(3); // Bank Job
      this.missions.startStage(1); // the safe-cracking hold
      this.player.x = 1000; this.player.y = 470; this.player.onFoot = true; this.player.inCar = null;
      this.player.footAngle = -Math.PI / 2;
      this.setWanted(3, true);
      for (var i = 0; i < 3; i++) {
        var pc = makeCar('police', 800 + i * 120, 300 + (i % 2) * 160, Math.PI / 2);
        pc.isPolice = true;
        this.cars.push(pc);
        this.police.push(pc);
      }
    } else if (this.shot === 'win') {
      this.cash = 21400;
      this.missions.done = true;
      this.state = 'win';
    }
    // 'start' or anything else: the title screen.
    // Snap the camera onto the player so the first frames are framed
    // (headless runs produce only a handful of rAF frames, so the
    // normal camera lerp would still be travelling when the shot lands).
    this.camera.x = clamp(this.player.x, 640, WORLD - 640);
    this.camera.y = clamp(this.player.y, 360, WORLD - 360);
  };

  Game.prototype.enterCar = function (car, free) {
    var p = this.player;
    if (car.isPolice || car.dead) return false;
    if (car.isTraffic && !free) {
      this.commitCrime(1);
      this.stats.carsStolen++;
      this.audio.horn();
    }
    if (car.parked) {
      car.parked = false;
      for (var i = 0; i < this.garageSlots.length; i++) {
        if (this.garageSlots[i].car === car) this.garageSlots[i].car = null;
      }
    }
    p.inCar = car;
    p.onFoot = false;
    p.angle = car.angle;
    p.speed = 0;
    return true;
  };

  Game.prototype.exitCar = function () {
    var p = this.player;
    var car = p.inCar;
    if (!car) return;
    car.speed = 0;
    // Parking inside the garage zone stores the car in a free slot.
    if (dist(car.x, car.y, 400, 2000) < 110) this.parkInGarage(car);
    p.inCar = null;
    p.onFoot = true;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.footAngle = car.angle;
    p.speed = 0;
  };

  Game.prototype.nearestCar = function (maxD) {
    var best = null, bd = maxD;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      if (c.isPolice || c.dead) continue;
      var d = dist(this.player.x, this.player.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  Game.prototype.explodeCar = function (car) {
    if (car.dead) return;
    car.dead = true;
    this.audio.explosion();
    this.shake = Math.max(this.shake, 10);
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5;
      this.particles.push({
        x: car.x, y: car.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.6, max: 1.1,
        color: ['#ffdd55', '#ff8833', '#ff4422', '#888888'][i % 4], size: 3 + Math.random() * 5,
      });
    }
    if (this.player.inCar === car) {
      this.player.inCar = null;
      this.player.onFoot = true;
      this.player.health = Math.max(10, this.player.health - 25);
      this.player.x = car.x + 40;
      this.player.y = car.y;
    }
    this.removeCar(car);
  };

  Game.prototype.damageCar = function (car, amount, byPlayer) {
    if (car.dead) return;
    car.health -= amount;
    if (car.health <= 0) {
      if (car.isPolice && byPlayer) { this.stats.copsDown++; this.commitCrime(1); }
      else if (byPlayer) { this.commitCrime(1); }
      this.explodeCar(car);
    }
  };

  Game.prototype.shoot = function () {
    var p = this.player;
    if (p.ammo <= 0 || this.shootCd > 0) return;
    this.shootCd = 0.18;
    p.ammo--;
    this.stats.shots++;
    this.audio.shoot();
    var rect = this.canvas.getBoundingClientRect();
    var wx = this.camera.x - 640 + this.input.mouseX;
    var wy = this.camera.y - 360 + this.input.mouseY;
    var ox = p.inCar ? p.inCar.x : p.x;
    var oy = p.inCar ? p.inCar.y : p.y;
    var a = Math.atan2(wy - oy, wx - ox);
    this.bullets.push({ x: ox + Math.cos(a) * 30, y: oy + Math.sin(a) * 30, vx: Math.cos(a) * 15, vy: Math.sin(a) * 15, life: 0.7 });
    this.particles.push({ x: ox + Math.cos(a) * 34, y: oy + Math.sin(a) * 34, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 0.08, max: 0.08, color: '#ffe98a', size: 5 });
    void rect;
  };

  Game.prototype.useAbility = function () {
    if (!this.maraUnlocked || this.abilityCd > 0) return;
    this.abilityCd = 45;
    this.abilityActive = 20;
    this.heliDisabled = 20;
    this.setWanted(Math.max(0, this.wanted - 1), false);
    this.audio.pickup();
    this.missions.showMessage('Mara killed the chopper feed — wanted down, heli blind for 20s!');
  };

  // ---------------------------------------------------------------- update

  Game.prototype.update = function (dt) {
    dt = Math.max(0, Math.min(dt, 0.05));
    this.time += dt;
    if (this.crimeCooldown > 0) this.crimeCooldown -= dt;
    if (this.abilityCd > 0) this.abilityCd -= dt;
    if (this.abilityActive > 0) this.abilityActive -= dt;
    if (this.heliDisabled > 0) this.heliDisabled -= dt;
    if (this.shootCd > 0) this.shootCd -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);

    if (this.state === 'title') {
      this.titleT += dt;
      this.camera.x = 1200 + Math.cos(this.titleT * 0.08) * 500;
      this.camera.y = 1200 + Math.sin(this.titleT * 0.06) * 400;
      this.updateTraffic(dt);
      this.updatePeds(dt);
      if (this.input.enterPressed || this.input.clicked) {
        this.input.enterPressed = false; this.input.clicked = false;
        this.startGame();
      }
    } else if (this.state === 'playing') {
      this.updatePlaying(dt);
    } else if (this.state === 'paused') {
      if (this.input.escPressed || this.input.enterPressed) {
        this.input.escPressed = false; this.input.enterPressed = false;
        this.state = 'playing';
      }
    } else if (this.state === 'win' || this.state === 'lose') {
      if (this.input.rPressed || this.input.enterPressed || this.input.clicked) {
        this.input.rPressed = false; this.input.enterPressed = false; this.input.clicked = false;
        if (this.state === 'lose') {
          this.state = 'playing';
          this.missions.restartMission();
        } else {
          // Win screen: start a fresh free-roam run.
          this.state = 'playing';
          this.missions.done = false;
          this.missions.startMission(0);
        }
      }
    }
    // Edge-triggered keys are consumed once per frame, whatever the state.
    this.input.ePressed = false;
    this.input.qPressed = false;
    this.input.rPressed = false;
    this.input.escPressed = false;
    this.input.enterPressed = false;
    this.input.clicked = false;
  };

  Game.prototype.updatePlaying = function (dt) {
    var p = this.player, input = this.input;
    var k = dt * 60; // frame-normalised step

    if (input.escPressed) { this.state = 'paused'; return; }
    if (input.rPressed && !this.missions.done) { this.missions.restartMission(); return; }
    if (input.qPressed) this.useAbility();
    if (input.ePressed) {
      if (p.inCar) this.exitCar();
      else {
        var car = this.nearestCar(58);
        if (car) this.enterCar(car, false);
      }
    }
    if (input.clicked || input.mouseDown) this.shoot();

    // ---- player movement
    if (p.inCar) {
      var c = p.inCar;
      var onRoadNow = onRoad(c.x, c.y);
      var maxSp = c.maxSpeed * (onRoadNow ? 1 : 0.55);
      if (input.up) c.speed += c.accel * k;
      else if (input.down) c.speed -= c.accel * 0.8 * k;
      else c.speed *= Math.pow(0.985, k);
      if (input.down && c.speed > 0.2) c.speed -= c.accel * 0.6 * k; // brake
      c.speed = clamp(c.speed, -2.4, maxSp);
      var steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      if (Math.abs(c.speed) > 0.15) {
        c.angle += steer * 0.045 * k * Math.sign(c.speed) * clamp(Math.abs(c.speed) / 3, 0.4, 1);
      }
      c.x += Math.cos(c.angle) * c.speed * k;
      c.y += Math.sin(c.angle) * c.speed * k;
      c.x = clamp(c.x, 46, WORLD - 46);
      c.y = clamp(c.y, 46, WORLD - 46);
      pushOutOfBuildings(c, 24, this.world.buildings);
      pushOutOfVolcano(c, 24);
      p.x = c.x; p.y = c.y; p.angle = c.angle; p.speed = c.speed;
      this.audio.engineSet(Math.abs(c.speed) / c.maxSpeed, true);
    } else {
      var sp = 3.1;
      var mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      var my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (mx !== 0 || my !== 0) {
        var len = Math.sqrt(mx * mx + my * my);
        p.x += (mx / len) * sp * k;
        p.y += (my / len) * sp * k;
        p.footAngle = Math.atan2(my, mx);
      }
      p.x = clamp(p.x, 20, WORLD - 20);
      p.y = clamp(p.y, 20, WORLD - 20);
      pushOutOfBuildings(p, 12, this.world.buildings);
      pushOutOfVolcano(p, 12);
      this.audio.engineSet(0, false);
    }

    // ---- car-vs-car collisions (player car vs traffic / police)
    if (p.inCar) this.collideCars(p.inCar, true);
    for (var i = 0; i < this.police.length; i++) this.collideCars(this.police[i], false);

    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updatePolice(dt);
    this.updateHelicopter(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.updateWanted(dt);
    this.updateBusted(dt);

    // Garage refills ammo when the player walks through it on foot.
    if (p.onFoot && dist(p.x, p.y, 400, 2000) < 110 && p.ammo < 24) {
      p.ammo = 24;
      this.audio.pickup();
    }

    this.missions.update(dt);

    // Camera follows the player.
    var tx = clamp(p.x, 640, WORLD - 640), ty = clamp(p.y, 360, WORLD - 360);
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 5);
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 5);
  };

  Game.prototype.collideCars = function (car, isPlayer) {
    for (var i = 0; i < this.cars.length; i++) {
      var o = this.cars[i];
      if (o === car || o.dead) continue;
      var d = dist(car.x, car.y, o.x, o.y);
      var min = (car.w + o.w) / 2 - 4;
      if (d < min && d > 0.01) {
        var dx = (car.x - o.x) / d, dy = (car.y - o.y) / d;
        var push = (min - d) / 2;
        car.x += dx * push; car.y += dy * push;
        o.x -= dx * push; o.y -= dy * push;
        var impact = Math.abs(car.speed - o.speed);
        // Only a real hit (head-on or a fast rear-end) costs speed and
        // health; a glancing sideswipe at similar speed just pushes the
        // cars apart, or driving down a busy road would grind to a halt.
        if (impact > 4) {
          // Two police cars just bounce off each other — no damage, so
          // they stop dying in pile-ups and respawning on top of the player.
          if (!(car.isPolice && o.isPolice)) {
            car.health -= impact * 1.6;
            o.health -= impact * 1.6;
          }
          car.speed *= 0.6; o.speed *= 0.6;
          if (car.health <= 0) this.explodeCar(car);
          else if (o.health <= 0) this.explodeCar(o);
          else if (isPlayer) this.audio._noise(0.15, 0.25, 700);
        }
      }
    }
  };

  Game.prototype.updateTraffic = function (dt) {
    var k = dt * 60;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      if (!c.isTraffic || c.dead) continue;
      var ai = c.ai;
      // At an intersection, sometimes turn onto the crossing road.
      var cross = ai.horiz ? nearestRoadCoord(c.x, ROADS_X) : nearestRoadCoord(c.y, ROADS_Y);
      var along = ai.horiz ? c.x : c.y;
      if (Math.abs(along - cross) < 8 && this.rng() < 0.012) {
        ai.horiz = !ai.horiz;
        ai.road = cross;
        ai.dir = this.rng() < 0.5 ? 1 : -1;
        ai.lane = (this.rng() < 0.5 ? -22 : 22);
        if (ai.horiz) { c.y = ai.road + ai.lane; c.angle = ai.dir > 0 ? 0 : Math.PI; }
        else { c.x = ai.road + ai.lane; c.angle = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      }
      if (ai.horiz) c.x += ai.dir * c.speed * k;
      else c.y += ai.dir * c.speed * k;
      // Wrap around the island edges so traffic never runs out.
      if (c.x < 120) c.x = WORLD - 120;
      if (c.x > WORLD - 120) c.x = 120;
      if (c.y < 120) c.y = WORLD - 120;
      if (c.y > WORLD - 120) c.y = 120;
      // Keep the car glued to its lane.
      if (ai.horiz) c.y = ai.road + ai.lane;
      else c.x = ai.road + ai.lane;
    }
  };

  Game.prototype.updatePeds = function (dt) {
    var k = dt * 60;
    for (var i = 0; i < this.peds.length; i++) {
      var pd = this.peds[i];
      // Flee from the player's car.
      var d = dist(pd.x, pd.y, this.player.x, this.player.y);
      if (this.player.inCar && d < 90) {
        var a = Math.atan2(pd.y - this.player.y, pd.x - this.player.x);
        pd.x += Math.cos(a) * 2.2 * k;
        pd.y += Math.sin(a) * 2.2 * k;
        continue;
      }
      if (pd.horiz) {
        pd.x += pd.dir * pd.speed * k;
        if (pd.x < 140 || pd.x > WORLD - 140) pd.dir *= -1;
      } else {
        pd.y += pd.dir * pd.speed * k;
        if (pd.y < 140 || pd.y > WORLD - 140) pd.dir *= -1;
      }
    }
  };

  Game.prototype.maintainPolice = function () {
    var want = this.wanted === 0 ? 0 : Math.min(2 + this.wanted, 7);
    while (this.police.length < want) {
      var a = this.rng() * Math.PI * 2;
      var px = clamp(this.player.x + Math.cos(a) * 950, 150, WORLD - 150);
      var py = clamp(this.player.y + Math.sin(a) * 950, 150, WORLD - 150);
      // Spawn on the nearest road so the chase looks right — but snapping
      // to a road can pull the spawn onto the player, so push it back out
      // to at least 750px away afterwards (a fair chase, not an ambush).
      px = nearestRoadCoord(px, ROADS_X);
      var sd = dist(px, py, this.player.x, this.player.y);
      if (sd < 750 && sd > 0.01) {
        px = this.player.x + ((px - this.player.x) / sd) * 750;
        py = this.player.y + ((py - this.player.y) / sd) * 750;
        px = clamp(px, 150, WORLD - 150);
        py = clamp(py, 150, WORLD - 150);
      }
      var car = makeCar('police', px, py, Math.atan2(this.player.y - py, this.player.x - px));
      car.isPolice = true;
      car.health = 60;
      this.cars.push(car);
      this.police.push(car);
    }
    if (this.wanted === 0) {
      while (this.police.length > 0) this.removeCar(this.police[0]);
      this.roadblocks = [];
      // The helicopter leaves with the heat — unless a scripted mission
      // (6/7/8) is running, whose chopper stays for the whole job.
      var mid = this.missions.mission();
      if (!(mid && (mid.id === 6 || mid.id === 7 || mid.id === 8))) this.heli = null;
      this.audio.sirenStop();
    }
  };

  Game.prototype.updatePolice = function (dt) {
    var k = dt * 60;
    this.maintainPolice();
    var p = this.player;
    var anyNear = false;
    for (var i = 0; i < this.police.length; i++) {
      var c = this.police[i];
      if (c.dead) continue;
      var d = dist(c.x, c.y, p.x, p.y);
      if (d < 900) anyNear = true;
      var wantAngle = Math.atan2(p.y - c.y, p.x - c.x);
      var aggressive = this.wanted >= 4; // RAM / PIT behaviour
      var turnRate = aggressive ? 0.075 : 0.055;
      var diff = angDiff(wantAngle, c.angle);
      c.angle += clamp(diff, -turnRate * k, turnRate * k);
      // Police suffer the same off-road slowdown as the player (0.55x) —
      // a chase across open ground is fair; a chase down a road is fast.
      var onRoadP = onRoad(c.x, c.y);
      var target = (aggressive ? 5.6 : 3.2 + this.wanted * 0.35) * (onRoadP ? 1 : 0.55);
      if (c.speed < target) c.speed += 0.08 * k;
      else c.speed = Math.max(target, c.speed - 0.03 * k);
      // PIT: aim slightly at the player's rear quarter when close.
      if (aggressive && d < 130) {
        var rear = Math.atan2(p.y - c.y, p.x - c.x) + 0.5;
        c.angle += clamp(angDiff(rear, c.angle), -0.05 * k, 0.05 * k) * 0.4;
      }
      c.x += Math.cos(c.angle) * c.speed * k;
      c.y += Math.sin(c.angle) * c.speed * k;
      c.x = clamp(c.x, 40, WORLD - 40);
      c.y = clamp(c.y, 40, WORLD - 40);
      pushOutOfBuildings(c, 24, this.world.buildings);
      pushOutOfVolcano(c, 24);
      if (c.ramCd > 0) c.ramCd -= dt;
      // Ram the player's car, or crowd the player on foot.
      if (d < 34 && c.ramCd <= 0) {
        c.ramCd = 1;
        c.speed *= 0.4;
        if (p.inCar) {
          p.inCar.health -= 8;
          this.shake = Math.max(this.shake, 5);
          this.audio._noise(0.2, 0.3, 600);
          if (p.inCar.health <= 0) this.explodeCar(p.inCar);
        } else {
          p.health -= 12;
          p.x += Math.cos(c.angle) * 14;
          p.y += Math.sin(c.angle) * 14;
          if (p.health <= 0) this.loseGame('wasted');
        }
      }
    }
    // Roadblocks at 3+ stars: static police cars across the road ahead.
    if (this.wanted >= 3) {
      this.roadblockTimer = (this.roadblockTimer || 0) - dt;
      if (this.roadblockTimer <= 0) {
        this.roadblockTimer = 6;
        // Drop the old blocks, lay fresh ones ahead of the player's heading.
        for (var rb = 0; rb < this.roadblocks.length; rb++) this.removeCar(this.roadblocks[rb]);
        this.roadblocks = [];
        var heading = p.inCar ? p.inCar.angle : p.footAngle;
        var ahead = 380;
        var bx = p.x + Math.cos(heading) * ahead;
        var by = p.y + Math.sin(heading) * ahead;
        var roadX = nearestRoadCoord(bx, ROADS_X);
        var roadY = nearestRoadCoord(by, ROADS_Y);
        var useX = Math.abs(bx - roadX) < Math.abs(by - roadY);
        for (var s = -1; s <= 1; s += 2) {
          var bc = makeCar('police',
            useX ? roadX : bx + s * 44,
            useX ? by + s * 44 : roadY,
            useX ? Math.PI / 2 : 0);
          bc.isPolice = true;
          bc.health = 80;
          bc.speed = 0;
          this.cars.push(bc);
          this.roadblocks.push(bc);
        }
      }
    }
    if (anyNear && this.wanted > 0) this.audio.sirenStart();
    else this.audio.sirenStop();
  };

  Game.prototype.updateHelicopter = function (dt) {
    if (this.wanted >= 5 || (this.heli && this.missions.mission() && (this.missions.mission().id === 6 || this.missions.mission().id === 7 || this.missions.mission().id === 8))) {
      if (!this.heli) this.spawnHelicopter(false);
    }
    if (!this.heli) return;
    if (this.heliDisabled > 0) {
      // Mara's hack: the chopper peels away and circles far off.
      var away = Math.atan2(this.heli.y - this.player.y, this.heli.x - this.player.x);
      this.heli.x += Math.cos(away) * 4 * dt * 60;
      this.heli.y += Math.sin(away) * 4 * dt * 60;
      this.heli.x = clamp(this.heli.x, 100, WORLD - 100);
      this.heli.y = clamp(this.heli.y, 100, WORLD - 100);
      return;
    }
    var t = this.time * 0.7;
    var tx = this.player.x + Math.cos(t) * 130;
    var ty = this.player.y + Math.sin(t) * 130;
    this.heli.x += (tx - this.heli.x) * Math.min(1, dt * 1.5);
    this.heli.y += (ty - this.heli.y) * Math.min(1, dt * 1.5);
    this.heli.angle += dt * 9;
  };

  Game.prototype.updateBullets = function (dt) {
    var k = dt * 60;
    for (var i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      b.x += b.vx * k;
      b.y += b.vy * k;
      b.life -= dt;
      var dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD;
      if (!dead && circleHitsBuilding(b.x, b.y, 2, this.world.buildings)) dead = true;
      if (!dead) {
        for (var j = 0; j < this.cars.length; j++) {
          var c = this.cars[j];
          if (c.dead || c === this.player.inCar) continue;
          if (dist(b.x, b.y, c.x, c.y) < 26) {
            this.damageCar(c, 25, true);
            this.stats.hits++;
            dead = true;
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  };

  Game.prototype.updateParticles = function (dt) {
    var k = dt * 60;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var pt = this.particles[i];
      pt.x += pt.vx * k;
      pt.y += pt.vy * k;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  };

  Game.prototype.updateWanted = function (dt) {
    if (this.wanted <= 0) return;
    this.wantedTimer += dt;
    if (this.wantedTimer > 18) {
      this.wantedTimer = 0;
      this.wanted = Math.max(0, this.wanted - 1);
    }
  };

  Game.prototype.updateBusted = function (dt) {
    var p = this.player;
    if (p.onFoot && this.wanted > 0) {
      var near = this.nearestPoliceDist();
      if (near !== null && near < 48) {
        p.busted += dt;
        if (p.busted >= 2.5) this.loseGame('busted');
      } else {
        p.busted = Math.max(0, p.busted - dt * 2);
      }
    } else {
      p.busted = 0;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

// Cinder Reef — game.js (part 3 of 3): rendering, HUD, minimap, screens, boot.

(function (global) {
  'use strict';
  var Game = global.CinderGame;
  var P = global.__cinderPart1;
  var WORLD = P.WORLD, ROADS_X = P.ROADS_X, ROADS_Y = P.ROADS_Y, ROAD_W = P.ROAD_W;
  var DISTRICTS = P.DISTRICTS, VOLCANO = P.VOLCANO, PLACES = P.PLACES;
  var clamp = P.clamp, dist = P.dist;

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  Game.prototype.draw = function () {
    var ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, 1280, 720);
    if (this.state === 'title') { this.drawTitleWorld(ctx); this.drawTitle(ctx); ctx.restore(); return; }
    var sx = (Math.random() - 0.5) * this.shake;
    var sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(-this.camera.x + 640 + sx, -this.camera.y + 360 + sy);
    this.drawWorld(ctx);
    this.drawPlaces(ctx);
    this.drawGarage(ctx);
    this.drawMissionMarker(ctx);
    for (var i = 0; i < this.peds.length; i++) this.drawPed(ctx, this.peds[i]);
    for (var j = 0; j < this.cars.length; j++) if (!this.cars[j].dead) this.drawCar(ctx, this.cars[j]);
    this.drawPlayer(ctx);
    this.drawBullets(ctx);
    this.drawParticles(ctx);
    this.drawHelicopter(ctx);
    ctx.restore();
    this.drawHUD(ctx);
    this.drawMinimap(ctx);
    if (this.state === 'paused') this.drawPaused(ctx);
    if (this.state === 'win') this.drawWin(ctx);
    if (this.state === 'lose') this.drawLose(ctx);
  };

  Game.prototype.drawWorld = function (ctx) {
    // Beach / water border.
    ctx.fillStyle = '#1d4e6b';
    ctx.fillRect(this.camera.x - 660, this.camera.y - 380, 1320, 760);
    ctx.fillStyle = '#c9b489';
    ctx.fillRect(0, 0, WORLD, WORLD);
    // District ground.
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i];
      ctx.fillStyle = d.ground;
      ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
      ctx.fillStyle = d.label;
      ctx.font = 'bold 26px Arial';
      ctx.globalAlpha = 0.55;
      ctx.fillText(d.name.toUpperCase(), d.x0 + 24, d.y0 + 44);
      ctx.globalAlpha = 1;
    }
    // Airfield runway.
    ctx.fillStyle = '#2e2e2e';
    ctx.fillRect(1650, 180, 600, 90);
    ctx.fillStyle = '#f5f5f5';
    for (var x = 1680; x < 2220; x += 60) ctx.fillRect(x, 220, 30, 6);
    ctx.fillStyle = '#e8e8d8';
    ctx.font = 'bold 22px Arial';
    ctx.fillText('RUNWAY 09', 1800, 160);
    // Roads.
    ctx.fillStyle = '#26262e';
    for (var a = 0; a < ROADS_X.length; a++) ctx.fillRect(ROADS_X[a] - ROAD_W / 2, 0, ROAD_W, WORLD);
    for (var b = 0; b < ROADS_Y.length; b++) ctx.fillRect(0, ROADS_Y[b] - ROAD_W / 2, WORLD, ROAD_W);
    // Centre dashes.
    ctx.fillStyle = '#f5d76e';
    for (var c = 0; c < ROADS_X.length; c++) {
      for (var y = 0; y < WORLD; y += 80) ctx.fillRect(ROADS_X[c] - 3, y, 6, 40);
    }
    for (var d2 = 0; d2 < ROADS_Y.length; d2++) {
      for (var x = 0; x < WORLD; x += 80) ctx.fillRect(x, ROADS_Y[d2] - 3, 40, 6);
    }
    // Buildings.
    var bs = this.world.buildings;
    for (var i2 = 0; i2 < bs.length; i2++) {
      var bl = bs[i2];
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bl.x + 5, bl.y + 6, bl.w, bl.h);
      ctx.fillStyle = bl.color;
      ctx.fillRect(bl.x, bl.y, bl.w, bl.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bl.x + 2, bl.y + 2, bl.w - 4, bl.h - 4);
      if (bl.roof) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(bl.x + 8, bl.y + 8, bl.w - 16, 14);
      }
    }
    // Volcano.
    var v = VOLCANO;
    ctx.fillStyle = '#4a2c20';
    ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b3a26';
    ctx.beginPath(); ctx.arc(v.x, v.y, v.r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5a1f';
    ctx.beginPath(); ctx.arc(v.x, v.y, v.r * 0.3 + Math.sin(this.time * 3) * 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(v.x, v.y, v.r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('MT. CINDER', v.x - 62, v.y - v.r - 10);
  };

  Game.prototype.drawPlaces = function (ctx) {
    for (var i = 0; i < PLACES.length; i++) {
      var pl = PLACES[i];
      ctx.fillStyle = pl.color;
      ctx.beginPath(); ctx.arc(pl.x, pl.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px Arial';
      ctx.fillText(pl.label, pl.x - 30, pl.y - 20);
    }
  };

  Game.prototype.drawGarage = function (ctx) {
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(400 - 110, 2000 - 70, 220, 140);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('GARAGE — 3 SLOTS', 400 - 78, 2000 - 80);
  };

  Game.prototype.drawMissionMarker = function (ctx) {
    var m = this.missions.marker();
    if (!m || this.state !== 'playing') return;
    var pulse = 1 + Math.sin(this.time * 5) * 0.15;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,63,0.15)';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * pulse, 0, Math.PI * 2); ctx.fill();
    // Edge arrow: point at an off-screen marker.
    var p = this.player;
    var dx = m.x - p.x, dy = m.y - p.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > 420) {
      var ax = 640 + (dx / d) * 300, ay = 360 + (dy / d) * 220;
      var ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(Math.round(d) + 'm', ax - 14, ay + 30);
    }
  };

  Game.prototype.drawCar = function (ctx, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    rr(ctx, -car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    rr(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 8);
    ctx.fill();
    // Windshield + roof.
    ctx.fillStyle = '#1c2733';
    ctx.fillRect(car.w * 0.08, -car.h / 2 + 4, car.w * 0.22, car.h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-car.w * 0.28, -car.h / 2 + 4, car.w * 0.2, car.h - 8);
    // Headlights.
    ctx.fillStyle = '#fff6b0';
    ctx.fillRect(car.w / 2 - 3, -car.h / 2 + 3, 3, 5);
    ctx.fillRect(car.w / 2 - 3, car.h / 2 - 8, 3, 5);
    if (car.isPolice) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-6, -car.h / 2 + 2, 12, car.h - 4);
      ctx.fillStyle = (Math.floor(this.time * 4) % 2 === 0) ? '#ff2d2d' : '#2d7bff';
      ctx.fillRect(-4, -car.h / 2 - 3, 8, 6);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px Arial';
      ctx.fillText('PD', -6, 3);
    }
    if (car.isMission) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Damage smoke.
    if (car.health < 45) {
      ctx.fillStyle = 'rgba(120,120,120,0.7)';
      ctx.beginPath(); ctx.arc(-car.w / 4, 0, 5 + Math.sin(this.time * 9) * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Health bar for damaged cars.
    if (car.health < 100 && !car.isTraffic) {
      ctx.fillStyle = '#111';
      ctx.fillRect(car.x - 22, car.y - 26, 44, 5);
      ctx.fillStyle = car.health > 45 ? '#7dff8a' : '#ff5d5d';
      ctx.fillRect(car.x - 21, car.y - 25, 42 * (car.health / 100), 3);
    }
  };

  Game.prototype.drawPed = function (ctx, pd) {
    ctx.fillStyle = 'hsl(' + pd.hue + ',60%,55%)';
    ctx.beginPath(); ctx.arc(pd.x, pd.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(pd.x, pd.y - 2, 4, 0, Math.PI * 2); ctx.fill();
  };

  Game.prototype.drawPlayer = function (ctx) {
    var p = this.player;
    if (p.inCar) return; // the car drawing covers the driver
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.footAngle);
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2fae4e';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(6, -3, 8, 6); // gun
    ctx.restore();
    // Busted meter ring.
    if (p.busted > 0) {
      ctx.strokeStyle = '#ff2d2d';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, -Math.PI / 2, -Math.PI / 2 + (p.busted / 2.5) * Math.PI * 2); ctx.stroke();
    }
  };

  Game.prototype.drawBullets = function (ctx) {
    ctx.fillStyle = '#ffe98a';
    for (var i = 0; i < this.bullets.length; i++) {
      ctx.beginPath(); ctx.arc(this.bullets[i].x, this.bullets[i].y, 3, 0, Math.PI * 2); ctx.fill();
    }
  };

  Game.prototype.drawParticles = function (ctx) {
    for (var i = 0; i < this.particles.length; i++) {
      var pt = this.particles[i];
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawHelicopter = function (ctx) {
    if (!this.heli || this.heliDisabled > 0) return;
    var h = this.heli;
    // Spotlight on the ground under the player.
    ctx.fillStyle = 'rgba(255,240,170,0.18)';
    ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 150, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(h.x + 14, h.y + 18, 26, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.arc(h.x, h.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(h.x - 26, h.y); ctx.lineTo(h.x + 26, h.y);
    ctx.moveTo(h.x, h.y - 22); ctx.lineTo(h.x, h.y + 22);
    ctx.stroke();
    ctx.fillStyle = '#ff2d2d';
    ctx.font = 'bold 11px Arial';
    ctx.fillText('CONDOR-1', h.x - 26, h.y - 24);
  };

  Game.prototype.drawTitleWorld = function (ctx) {
    ctx.save();
    ctx.translate(-this.camera.x + 640, -this.camera.y + 360);
    this.drawWorld(ctx);
    for (var i = 0; i < this.cars.length; i++) if (!this.cars[i].dead) this.drawCar(ctx, this.cars[i]);
    for (var j = 0; j < this.peds.length; j++) this.drawPed(ctx, this.peds[j]);
    ctx.restore();
    ctx.fillStyle = 'rgba(10,8,20,0.45)';
    ctx.fillRect(0, 0, 1280, 720);
  };

  Game.prototype.drawTitle = function (ctx) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a1f';
    ctx.font = 'bold 92px Arial';
    ctx.fillText('CINDER REEF', 640, 210);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('A DANTE CRUZ STORY', 640, 256);
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText('Eight jobs. One island. The whole Cinder Reef police force wants you.', 640, 310);
    ctx.fillText('Steal, race, crack safes — and get out rich. Mara has your back after job 3.', 640, 340);
    ctx.fillStyle = '#9fd8ff';
    ctx.font = 'bold 19px Arial';
    ctx.fillText('WASD / ARROWS drive & walk    •    E enter / exit car, carjack, crack safes', 640, 420);
    ctx.fillText('MOUSE aim + CLICK shoot    •    Q crew ability (after mission 3)', 640, 448);
    ctx.fillText('R restart mission    •    ESC pause', 640, 476);
    ctx.fillStyle = (Math.floor(this.time * 2) % 2 === 0) ? '#ffd23f' : '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('CLICK OR PRESS ENTER TO START', 640, 560);
    ctx.fillStyle = '#bbb';
    ctx.font = '16px Arial';
    ctx.fillText('A fictional island. Any resemblance to real places is a coincidence.', 640, 660);
    ctx.textAlign = 'left';
  };

  Game.prototype.drawHUD = function (ctx) {
    if (this.state === 'title') return;
    var p = this.player;
    // Cash + mission panel.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, 12, 12, 430, 66, 10); ctx.fill();
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 26px Arial';
    ctx.fillText('$' + this.cash.toLocaleString('en-US'), 26, 44);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(this.missions.objectiveText(), 26, 66);
    // Wanted stars, top centre.
    var sx = 640 - this.wanted * 16;
    for (var i = 0; i < 5; i++) {
      ctx.fillStyle = i < this.wanted ? '#ffd23f' : 'rgba(255,255,255,0.25)';
      ctx.font = '30px Arial';
      ctx.fillText('★', sx + i * 32, 40);
    }
    if (this.wanted > 0) {
      ctx.fillStyle = '#ff5d5d';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.wanted >= 5 ? 'CONDOR-1 AIRBORNE' : 'WANTED', 640, 62);
      ctx.textAlign = 'left';
    }
    // Health + ammo, bottom left.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, 12, 648, 250, 60, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('HEALTH', 26, 670);
    ctx.fillStyle = '#111';
    ctx.fillRect(90, 658, 150, 14);
    ctx.fillStyle = p.health > 40 ? '#7dff8a' : '#ff5d5d';
    ctx.fillRect(91, 659, 148 * (p.health / 100), 12);
    ctx.fillStyle = '#fff';
    ctx.fillText('AMMO  ' + p.ammo + ' / 24', 26, 696);
    // Speed + ability, bottom right.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, 1018, 648, 250, 60, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    var spd = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 14) : 0;
    ctx.fillText(p.inCar ? ('SPEED ' + spd + ' mph  •  ' + (p.inCar.kind === 'police' ? 'POLICE' : (p.inCar.isMission ? 'MISSION CAR' : 'CAR'))) : 'ON FOOT', 1032, 670);
    if (this.maraUnlocked) {
      ctx.fillStyle = this.abilityCd > 0 ? '#888' : '#ff7ad9';
      ctx.fillText(this.abilityCd > 0 ? ('Q — MARA READY IN ' + Math.ceil(this.abilityCd) + 's') : 'Q — MARA READY (kills the chopper)', 1032, 696);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillText('Q — MARA JOINS AFTER MISSION 3', 1032, 696);
    }
    // Centre message banner.
    if (this.missions.messageTime > 0 && this.missions.message) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      var w = ctx.measureText(this.missions.message).width + 36;
      rr(ctx, 640 - w / 2, 92, w, 36, 8); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 17px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.missions.message, 640, 116);
      ctx.textAlign = 'left';
    }
    // Hold-E progress bar.
    var s = this.missions.stage();
    if (s && s.kind === 'hold' && this.missions.holdProgress > 0) {
      var frac = this.missions.holdProgress / s.seconds;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      rr(ctx, 490, 150, 300, 22, 8); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      rr(ctx, 492, 152, 296 * frac, 18, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CRACKING… ' + Math.floor(frac * 100) + '%', 640, 190);
      ctx.textAlign = 'left';
    }
  };

  Game.prototype.drawMinimap = function (ctx) {
    var S = 170, ox = 1280 - S - 12, oy = 12;
    var sc = S / WORLD;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    rr(ctx, ox - 6, oy - 6, S + 12, S + 12, 10); ctx.fill();
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i];
      ctx.fillStyle = d.ground;
      ctx.fillRect(ox + d.x0 * sc, oy + d.y0 * sc, (d.x1 - d.x0) * sc, (d.y1 - d.y0) * sc);
    }
    ctx.fillStyle = '#ff5a1f';
    ctx.beginPath(); ctx.arc(ox + VOLCANO.x * sc, oy + VOLCANO.y * sc, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#26262e';
    for (var a = 0; a < ROADS_X.length; a++) ctx.fillRect(ox + ROADS_X[a] * sc - 2, oy, 4, S);
    for (var b = 0; b < ROADS_Y.length; b++) ctx.fillRect(ox, oy + ROADS_Y[b] * sc - 2, S, 4);
    var m = this.missions.marker();
    if (m) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(ox + m.x * sc, oy + m.y * sc, 5 + Math.sin(this.time * 5) * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    for (var j = 0; j < this.police.length; j++) {
      ctx.fillStyle = '#2d7bff';
      ctx.fillRect(ox + this.police[j].x * sc - 2, oy + this.police[j].y * sc - 2, 4, 4);
    }
    if (this.heli && this.heliDisabled <= 0) {
      ctx.fillStyle = '#ff2d2d';
      ctx.beginPath(); ctx.arc(ox + this.heli.x * sc, oy + this.heli.y * sc, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#7dff8a';
    ctx.beginPath(); ctx.arc(ox + this.player.x * sc, oy + this.player.y * sc, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox + this.player.x * sc, oy + this.player.y * sc, 5, 0, Math.PI * 2); ctx.stroke();
  };

  Game.prototype.drawPaused = function (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 56px Arial';
    ctx.fillText('PAUSED', 640, 330);
    ctx.font = '20px Arial';
    ctx.fillText('ESC or ENTER to resume  •  R restarts the mission', 640, 380);
    ctx.textAlign = 'left';
  };

  Game.prototype.drawWin = function (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 72px Arial';
    ctx.fillText('THE BIG SCORE!', 640, 250);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('Dante and Mara sail off with $21,400. Cinder Reef is yours.', 640, 310);
    ctx.font = '22px Arial';
    ctx.fillText('Shots fired: ' + this.stats.shots + '   •   Hits: ' + this.stats.hits +
      '   •   Cops wrecked: ' + this.stats.copsDown + '   •   Cars stolen: ' + this.stats.carsStolen, 640, 370);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 26px Arial';
    ctx.fillText('PRESS ENTER TO PLAY AGAIN', 640, 460);
    ctx.textAlign = 'left';
  };

  Game.prototype.drawLose = function (ctx) {
    ctx.fillStyle = 'rgba(20,0,0,0.72)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5d5d';
    ctx.font = 'bold 72px Arial';
    ctx.fillText(this.loseKind === 'busted' ? 'BUSTED!' : 'WASTED!', 640, 300);
    ctx.fillStyle = '#fff';
    ctx.font = '22px Arial';
    ctx.fillText(this.loseKind === 'busted'
      ? 'The Cinder Reef PD finally caught up with Dante.'
      : 'Dante went down in a hail of gunfire and twisted metal.', 640, 360);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('PRESS R OR ENTER TO RETRY THE MISSION', 640, 440);
    ctx.textAlign = 'left';
  };

  // ------------------------------------------------------------------ boot

  function boot() {
    var canvas = document.getElementById('game');
    if (!canvas) return;
    canvas.width = 1280;
    canvas.height = 720;
    var game = new CinderGame(canvas);
    game.applyShot();
    var last = performance.now();
    function frame(now) {
      var dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      try {
        game.update(dt);
        game.draw();
      } catch (err) {
        // Never let one frame kill the page: show the error once in the
        // status line so a headless run can see it, then keep going.
        var st = document.getElementById('status');
        if (st && !st.textContent) st.textContent = 'error: ' + (err && err.message ? err.message : String(err));
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // Expose for debugging and for the headless screenshot runs.
    window.__cinderGame = game;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
