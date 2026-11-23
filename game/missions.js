// Cinder Reef — missions.js
// The 8 sequential story missions. A mission is a list of stages; each stage
// is one small objective (go somewhere, enter a car, deliver a car, hold E
// to crack something, survive, or race checkpoints). The game owns the world
// and the player; this module only decides what "done" means for each stage
// and what the next stage is. Coordinates are world pixels (world is 2400x2400).
//
// Key places (shared with game.js):
//   garage (400, 2000)   safehouse (350, 900)   club (1200, 900)
//   bank (1000, 400)     casino (1300, 400)     airfield (1900, 350)
//   yacht marina (350, 350)  docks warehouse (650, 2050)

(function (global) {
  'use strict';

  // Stage kinds:
  //   goto    — reach (x, y) within radius r (on foot or in any car)
  //   entercar— get into the mission car with the given id
  //   deliver — drive the mission car into the zone (x, y, r)
  //   hold    — stand near (x, y) and hold E for `seconds`
  //   survive — stay `seconds` long with no police within `clear` px
  //   race    — hit every checkpoint in order before `time` runs out
  var MISSIONS = [
    {
      id: 1, name: 'Hot Start', payout: 800,
      briefing: 'Steal the red Comet at the docks and bring it to the garage.',
      car: { id: 'comet', kind: 'comet', x: 600, y: 1900, angle: -Math.PI / 2 },
      stages: [
        { kind: 'entercar', car: 'comet', text: 'Steal the red Comet at the docks' },
        { kind: 'deliver', car: 'comet', x: 400, y: 2000, r: 90, text: 'Deliver the Comet to the garage' },
      ],
    },
    {
      id: 2, name: 'Three Drops', payout: 900,
      briefing: 'Three packages, three corners of Old Town. Then the club on the Neon Strip.',
      stages: [
        { kind: 'goto', x: 350, y: 800, r: 60, text: 'Drop 1 of 3: Old Town north' },
        { kind: 'goto', x: 550, y: 1200, r: 60, text: 'Drop 2 of 3: Old Town square' },
        { kind: 'goto', x: 300, y: 1400, r: 60, text: 'Drop 3 of 3: Old Town south' },
        { kind: 'goto', x: 1200, y: 900, r: 70, text: 'Deliver to the club on Neon Strip' },
      ],
    },
    {
      id: 3, name: 'Street King', payout: 1200,
      briefing: 'Three checkpoints, 90 seconds. Win the race and Mara joins the crew.',
      stages: [
        { kind: 'race', time: 90, points: [
          { x: 1700, y: 600, r: 80 }, { x: 2000, y: 1500, r: 80 }, { x: 600, y: 2000, r: 80 },
        ], text: 'Race the checkpoints — 90 seconds!' },
      ],
    },
    {
      id: 4, name: 'Bank Job', payout: 2500,
      briefing: 'Crack the bank safe, then lose the heat and get back to the garage.',
      stages: [
        { kind: 'goto', x: 1000, y: 400, r: 70, text: 'Get to the bank on Casino Row' },
        { kind: 'hold', x: 1000, y: 400, r: 110, seconds: 3, text: 'Hold E to crack the safe (3s)' },
        { kind: 'deliver', x: 400, y: 2000, r: 90, text: 'Escape to the garage — wanted 3!' },
      ],
      onStage: function (game, stageIndex) {
        if (stageIndex === 2) game.setWanted(3, true);
      },
    },
    {
      id: 5, name: 'Heat Wave', payout: 1000,
      briefing: 'Four stars and every unit on the island is hunting you. Go dark, then slip home.',
      stages: [
        { kind: 'survive', seconds: 12, clear: 350, text: 'Lay low: 12s with no cop within range' },
        { kind: 'goto', x: 350, y: 900, r: 70, text: 'Reach the safehouse in Old Town' },
      ],
      onStart: function (game) { game.setWanted(4, true); },
    },
    {
      id: 6, name: 'Ghost Run', payout: 2000,
      briefing: 'Pick up Mara, grab the armored van in Palm Heights, lose the chopper.',
      car: { id: 'van', kind: 'van', x: 1900, y: 1100, angle: Math.PI },
      stages: [
        { kind: 'goto', x: 1200, y: 900, r: 70, text: 'Pick up Mara at the club' },
        { kind: 'entercar', car: 'van', text: 'Steal the armored van in Palm Heights' },
        { kind: 'deliver', car: 'van', x: 400, y: 2000, r: 90, text: 'Deliver the van to the garage' },
      ],
      onStage: function (game, stageIndex) {
        if (stageIndex === 1) game.spawnHelicopter(true);
      },
    },
    {
      id: 7, name: 'Airfield Heist', payout: 3000,
      briefing: 'The cargo truck at the airfield. Four stars, a chopper, one way out.',
      car: { id: 'truck', kind: 'truck', x: 1900, y: 350, angle: Math.PI / 2 },
      stages: [
        { kind: 'entercar', car: 'truck', text: 'Steal the cargo truck at the airfield' },
        { kind: 'deliver', car: 'truck', x: 650, y: 2050, r: 90, text: 'Deliver to the docks warehouse' },
      ],
      onStart: function (game) { game.setWanted(4, true); game.spawnHelicopter(true); },
    },
    {
      id: 8, name: 'The Big Score', payout: 10000,
      briefing: 'The casino vault. Five stars, roadblocks, a chopper — then the yacht.',
      stages: [
        { kind: 'goto', x: 1300, y: 400, r: 70, text: 'Get to the casino on Casino Row' },
        { kind: 'hold', x: 1300, y: 400, r: 110, seconds: 5, text: 'Hold E to crack the vault (5s)' },
        { kind: 'deliver', x: 350, y: 350, r: 90, text: 'Escape to the yacht at the marina — wanted 5!' },
      ],
      onStage: function (game, stageIndex) {
        if (stageIndex === 2) { game.setWanted(5, true); game.spawnHelicopter(true); }
      },
    },
  ];

  // MissionManager: owns missionIndex, stageIndex, per-stage timers and the
  // "hold E" progress. The game calls update(dt) every frame and reads the
  // current objective text + marker position for the HUD and the map arrow.
  function MissionManager(game) {
    this.game = game;
    this.missionIndex = 0;
    this.stageIndex = 0;
    this.stageTime = 0;      // seconds spent in the current stage
    this.holdProgress = 0;   // seconds of E held on a hold stage
    this.racePoint = 0;      // checkpoint index on a race stage
    this.done = false;       // all 8 missions complete
    this.failed = false;     // current mission failed (timer / car lost)
    this.failReason = '';
    this.message = '';
    this.messageTime = 0;
  }

  MissionManager.prototype.mission = function () {
    return MISSIONS[this.missionIndex] || null;
  };

  MissionManager.prototype.stage = function () {
    var m = this.mission();
    return m ? m.stages[this.stageIndex] : null;
  };

  MissionManager.prototype.startMission = function (index) {
    this.missionIndex = index;
    this.stageIndex = 0;
    this.stageTime = 0;
    this.holdProgress = 0;
    this.racePoint = 0;
    this.failed = false;
    this.failReason = '';
    var m = this.mission();
    if (!m) { this.done = true; return; }
    if (m.onStart) m.onStart(this.game);
    if (m.car) this.game.spawnMissionCar(m.car);
    this.showMessage('MISSION ' + m.id + ': ' + m.name + ' — $' + m.payout);
  };

  MissionManager.prototype.startStage = function (index) {
    this.stageIndex = index;
    this.stageTime = 0;
    this.holdProgress = 0;
    this.racePoint = 0;
    var m = this.mission();
    if (m && m.onStage) m.onStage(this.game, index);
  };

  MissionManager.prototype.showMessage = function (text) {
    this.message = text;
    this.messageTime = 4;
  };

  MissionManager.prototype.objectiveText = function () {
    if (this.done) return 'All missions complete — enjoy Cinder Reef!';
    var s = this.stage();
    if (!s) return '';
    var m = this.mission();
    var text = s.text;
    if (s.kind === 'race') {
      var left = Math.max(0, Math.ceil(s.time - this.stageTime));
      text += '  (' + left + 's)';
    }
    if (s.kind === 'hold') {
      text += '  (' + Math.floor(this.holdProgress) + '/' + s.seconds + 's)';
    }
    if (s.kind === 'survive') {
      text += '  (' + Math.ceil(Math.max(0, s.seconds - this.stageTime)) + 's)';
    }
    return 'M' + m.id + ' ' + m.name + ' — ' + text;
  };

  // Where the HUD arrow and the map marker should point, or null.
  MissionManager.prototype.marker = function () {
    var s = this.stage();
    if (!s || this.done || this.failed) return null;
    if (s.kind === 'race') {
      var p = s.points[this.racePoint];
      return p ? { x: p.x, y: p.y, r: p.r } : null;
    }
    if (s.kind === 'entercar') {
      var car = this.game.findCar(s.car);
      return car ? { x: car.x, y: car.y, r: 70 } : null;
    }
    if (s.kind === 'deliver' && s.car) {
      var car2 = this.game.findCar(s.car);
      if (car2 && !this.game.player.inCar) return { x: car2.x, y: car2.y, r: 70 };
      return { x: s.x, y: s.y, r: s.r };
    }
    if (s.x !== undefined) return { x: s.x, y: s.y, r: s.r || 60 };
    return null;
  };

  MissionManager.prototype.fail = function (reason) {
    if (this.failed || this.done) return;
    this.failed = true;
    this.failReason = reason;
    this.game.audio.fail();
    this.showMessage('MISSION FAILED: ' + reason + ' — press R to retry');
  };

  MissionManager.prototype.completeMission = function () {
    var m = this.mission();
    if (!m) return;
    this.game.cash += m.payout;
    this.game.audio.cash();
    this.showMessage('MISSION COMPLETE: ' + m.name + '  +$' + m.payout);
    if (m.id === 3) {
      this.game.maraUnlocked = true;
      this.showMessage('Mara "Ghost" Reyes joined the crew! Press Q for her help.');
    }
    this.game.clearMissionCar();
    // Completing a job cools the heat: force the drop (setWanted only
    // raises unless forced).
    this.game.setWanted(this.game.wanted - 2, true);
    this.missionIndex++;
    if (this.missionIndex >= MISSIONS.length) {
      this.done = true;
      this.game.winGame();
      return;
    }
    this.startMission(this.missionIndex);
  };

  MissionManager.prototype.advanceStage = function () {
    var m = this.mission();
    if (!m) return;
    this.game.audio.pickup();
    this.stageIndex++;
    if (this.stageIndex >= m.stages.length) {
      this.completeMission();
    } else {
      this.startStage(this.stageIndex);
    }
  };

  MissionManager.prototype.update = function (dt) {
    if (this.done) return;
    if (this.messageTime > 0) this.messageTime -= dt;
    if (this.failed) return;
    var s = this.stage();
    var g = this.game;
    if (!s) return;
    this.stageTime += dt;
    var p = g.player;

    if (s.kind === 'goto') {
      var d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < s.r) this.advanceStage();
    } else if (s.kind === 'entercar') {
      var car = g.findCar(s.car);
      if (!car) { this.fail('The mission car was destroyed'); return; }
      if (p.inCar === car) this.advanceStage();
    } else if (s.kind === 'deliver') {
      var carD = s.car ? g.findCar(s.car) : null;
      if (s.car && !carD) { this.fail('The mission car was destroyed'); return; }
      var useCar = s.car ? (p.inCar === carD) : true;
      var dd = Math.hypot(p.x - s.x, p.y - s.y);
      if (useCar && dd < s.r) {
        // Delivering a car parks it in the garage slot when the zone is the garage.
        if (s.x === 400 && s.y === 2000 && carD) g.parkInGarage(carD);
        this.advanceStage();
      }
    } else if (s.kind === 'hold') {
      var dh = Math.hypot(p.x - s.x, p.y - s.y);
      if (dh < s.r && g.input.eHeld && !p.inCar) {
        this.holdProgress += dt;
        if (this.holdProgress >= s.seconds) this.advanceStage();
      } else if (dh < s.r + 50 && g.input.eHeld && !p.inCar) {
        // Still holding E and just shoved off the spot: freeze the
        // progress instead of losing it — a cop shove must not wipe
        // seconds of safe-cracking.
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - dt * 2);
      }
    } else if (s.kind === 'survive') {
      var near = g.nearestPoliceDist();
      if (near !== null && near < s.clear) {
        // Spotted: the clock pauses and slowly erodes — one bad moment
        // no longer wipes 12 seconds of good driving. (stageTime already
        // grew by dt this frame, so -2dt nets -dt while spotted.)
        this.stageTime = Math.max(0, this.stageTime - dt * 2);
      } else if (this.stageTime >= s.seconds) {
        this.advanceStage();
      }
    } else if (s.kind === 'race') {
      var cp = s.points[this.racePoint];
      if (cp) {
        var dc = Math.hypot(p.x - cp.x, p.y - cp.y);
        if (dc < cp.r) {
          this.racePoint++;
          g.audio.pickup();
          if (this.racePoint >= s.points.length) this.advanceStage();
        }
      }
      if (this.stageTime > s.time) this.fail('Out of time on the race');
    }
  };

  MissionManager.prototype.restartMission = function () {
    if (this.done) return;
    this.game.respawnPlayer();
    this.startMission(this.missionIndex);
  };

  global.CinderMissions = MISSIONS;
  global.MissionManager = MissionManager;
})(typeof window !== 'undefined' ? window : globalThis);
