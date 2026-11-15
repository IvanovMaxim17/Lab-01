import test from 'node:test';
import assert from 'node:assert/strict';
import {
  World,
  Ship,
  Asteroid,
  Vector2,
  Entity,
  FIXED_DT,
  encodeMessage,
  decodeMessage,
} from 'shared';

test('Детермінізм симуляції: однаковий seed дає ідентичний стан світу', () => {
  function runSimulation() {
    Entity.resetIds(1);
    const world = new World({ width: 800, height: 600, seed: 777 });
    world.spawnAsteroids(5);

    const ship = world.spawn(
      new Ship({
        playerId: 1,
        name: 'Ace',
        pos: new Vector2(400, 300),
        angle: 0,
      }),
    );

    for (let tick = 0; tick < 60; tick++) {
      const bullet = ship.applyInput(
        { turn: tick % 20 < 10 ? 1 : -1, thrust: 1, fire: tick === 15 ? 1 : 0 },
        FIXED_DT,
      );
      if (bullet) world.spawn(bullet);
      world.step(FIXED_DT);
    }

    return [...world].map((e) => e.toSnapshot());
  }

  assert.deepEqual(runSimulation(), runSimulation());
});

test('Постріл і зіткнення знищують астероїд та нараховують очки', () => {
  Entity.resetIds(1);
  const world = new World({ width: 800, height: 600, seed: 1 });

  const ship = world.spawn(
    new Ship({
      playerId: 1,
      name: 'Shooter',
      pos: new Vector2(100, 300),
      angle: 0,
    }),
  );

  const asteroid = world.spawn(
    new Asteroid({
      pos: new Vector2(160, 300),
      vel: new Vector2(0, 0),
      radius: 20,
    }),
  );

  const bullet = ship.applyInput({ turn: 0, thrust: 0, fire: 1 }, FIXED_DT);
  assert.ok(bullet, 'Куля повинна створитися');
  world.spawn(bullet);

  for (let i = 0; i < 10; i++) {
    world.step(FIXED_DT);
  }

  assert.equal(asteroid.alive, false);
  assert.equal(ship.score, 25);

  const events = world.drainEvents();
  assert.ok(events.some((e) => e.type === 'hit'));
  assert.ok(events.some((e) => e.type === 'exploded'));
});

test('Бінарний та JSON кодеки коректно пакують і розпаковують пакети з версією та Int16 кутом', () => {
  const rawInput = { type: 'input', seq: 42, tick: 120, turn: -5, thrust: 1, fire: 1 };
  const binInput = encodeMessage(rawInput, 'binary');
  assert.equal(binInput.byteLength, 13);
  assert.equal(new Uint8Array(binInput)[0], 1); // byte 0 = PROTOCOL_VERSION

  assert.deepEqual(decodeMessage(binInput), {
    type: 'input',
    seq: 42,
    tick: 120,
    turn: -1,
    thrust: 1,
    fire: 1,
  });

  const pingMsg = decodeMessage(encodeMessage({ type: 'ping', clientTime: 123456789 }, 'binary'));
  assert.deepEqual(pingMsg, { type: 'ping', clientTime: 123456789 });

  Entity.resetIds(1);
  const ship = new Ship({
    playerId: 7,
    name: 'Pilot_UA',
    pos: new Vector2(123.5, 456.25),
    vel: new Vector2(10, -20),
    angle: 1.5,
    hp: 2,
    score: 150,
    thrust: 1,
    invulnerable: true,
  });

  const snapshotPayload = {
    type: 'snapshot',
    tick: 99,
    lastProcessedSeq: 42,
    yourShipId: ship.id,
    entities: [ship.toSnapshot()],
  };

  const binSnap = encodeMessage(snapshotPayload, 'binary');
  const jsonSnap = encodeMessage(snapshotPayload, 'json');
  assert.ok(binSnap.byteLength < jsonSnap.length, 'Бінарний знімок має бути компактнішим за JSON');

  const decodedSnap = decodeMessage(binSnap);
  assert.equal(decodedSnap.type, 'snapshot');
  assert.equal(decodedSnap.tick, 99);
  assert.equal(decodedSnap.lastProcessedSeq, 42);
  assert.equal(decodedSnap.yourShipId, ship.id);
  assert.equal(decodedSnap.entities.length, 1);
  assert.equal(decodedSnap.entities[0].hp, 2);
  assert.equal(decodedSnap.entities[0].score, 150);
  assert.equal(decodedSnap.entities[0].invulnerable, true);
  assert.ok(Math.abs(decodedSnap.entities[0].angle - 1.5) < 0.002);
});