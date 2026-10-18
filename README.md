# Lab 01 — The Event Loop Is the Game Loop

## SpaceFight

A small browser space game built with JavaScript and Canvas 2D.

## Implemented

- `requestAnimationFrame` game loop
- Fixed timestep simulation at 60 Hz
- Accumulator
- Interpolation
- Keyboard input using a closure
- `isDown()` and `justPressed()`
- Ship movement and rotation
- Wrap-around arena
- Canvas 2D rendering
- DPR-aware and resizable canvas
- Grid and starfield
- HUD with Steps/s, Frames/s and Frame time
- Rocket thrust and smoke
- Boost mode after holding W for more than 2 seconds

## Project structure

- `loop.js` — game loop and fixed timestep
- `input.js` — keyboard input
- `sim/ship.js` — ship simulation
- `sim/arena.js` — wrap-around
- `render/canvas.js` — Canvas setup and resizing
- `render/draw.js` — game rendering

## Fixed timestep

The simulation uses a fixed timestep of `1 / 60` seconds.

The accumulator allows the simulation to perform the required number of fixed updates independently from the rendering frame rate.

Interpolation is used to make the rendered movement smoother.

## Experiments

### Experiment 1 — Synchronous blocking

A synchronous `busyWait` of approximately 100 ms was intentionally added to the main thread.

Observed result:

- Busy wait: approximately **100 ms**
- Steps/s: approximately **55–60**
- Rendering became visibly less smooth during the blocking operation.

Conclusion:

JavaScript synchronous code runs on the main thread. While the busy loop is executing, the browser cannot process rendering and other main-thread work normally.

### Experiment 2 — setInterval vs requestAnimationFrame

The game loop was temporarily changed from `requestAnimationFrame` to `setInterval`.

Measured over approximately 10 seconds:

- `requestAnimationFrame`: **60.05 FPS**
- `setInterval`: **57.00 FPS**
- Average `setInterval` interval: **17.54 ms**
- After switching to another browser tab for approximately 5 seconds: **30.79 FPS**

Conclusion:

`requestAnimationFrame` is designed for browser rendering and synchronizes animation work with the browser's rendering cycle. `setInterval` does not provide the same rendering-oriented scheduling behavior.

### Experiment 3 — Variable timestep

The accumulator and fixed timestep were temporarily removed and the simulation was changed to use the real frame `deltaTime`.

With CPU throttling set to **6×**, the ship was moved by holding W for approximately 5 seconds.

Measured results:

| Mode | X | Vx |
|---|---:|---:|
| Variable timestep | 672.83 | 31.69 |
| Fixed timestep | 751.56 | 12.09 |

The final X positions differed by approximately **78.73 px**.

Conclusion:

The amount of simulation work performed per frame affects the result when using a variable timestep, especially when frame timing changes under CPU load. A fixed timestep keeps simulation updates at a constant `1/60` second step and makes the simulation more predictable.

## Reflection

### Why does a synchronous busy loop freeze the page?

JavaScript executes synchronous code on the main thread. While a synchronous loop is running, the browser cannot process rendering, input or other tasks normally.

### Why use requestAnimationFrame?

`requestAnimationFrame` is designed for browser animation and synchronizes rendering with the browser's refresh cycle.

### Why use a fixed timestep?

A fixed timestep makes the simulation more predictable and helps keep the game physics independent from the rendering frame rate.

### Why use closures for keyboard input?

The input function keeps the keyboard state inside its closure, so other parts of the program can access the state through `isDown()` and `justPressed()` without directly accessing the internal `Set`.

---

# Lab 02 — Object-Oriented SpaceFight

## Implemented

- `Vector2` class with vector operations: `add`, `sub`, `scale`, `length`, `normalize`, `rotate`, and `dot`.
- `Entity` base class with a private unique ID, position, velocity, angle, radius, and behaviors.
- `Ship` class extending `Entity`, with private HP, damage handling, and shooting.
- `World` class using a `Map` to store entities, with `spawn`, `despawn`, `get`, iteration, and `ofKind`.
- `Bullet` class with damage, owner ID, and time-to-live (TTL).
- `Asteroid` class with movement and bouncing at arena boundaries.
- Circle-circle collision detection between bullets, asteroids, and ships.
- Particle-based explosion effects.
- Ship respawning after a delay at a safe position.
- Homing behavior implemented through composition.
- Pickup items, including shield and rapid-fire effects.
- HUD with game metrics and score.

## Object-Oriented Design

### Inheritance

Inheritance represents an **is-a** relationship. For example, `Ship extends Entity` means that a ship is an entity and reuses common entity functionality.

The `Bullet` and `Asteroid` classes also extend `Entity`, allowing them to share position, velocity, radius, identity, and update behavior.

### Composition

Composition allows behavior to be added to an object without creating another subclass. For example, `HomingBehavior` can be attached to a bullet using `addBehavior()`.

This makes behavior reusable and keeps the class hierarchy simpler. A bullet can receive homing behavior without requiring a separate `HomingBullet` subclass.

Inheritance is useful for shared identity and common properties, while composition is useful for optional or interchangeable behaviors.

## The `this` Problem in Event Handlers

When a class method is passed directly as an event handler, its `this` context may be lost:

```js
button.addEventListener('click', ship.fire);
```

The method is passed as a function reference rather than being called as a method of `ship`. As a result, `this` may not refer to the ship instance when the event occurs.

One solution is to use `bind()`:

```js
button.addEventListener('click', ship.fire.bind(ship));
```

Another solution is to use an arrow function:

```js
button.addEventListener('click', () => ship.fire());
```

Both approaches ensure that `fire()` is called with the correct ship instance.

## World and Collision Detection

The `World` class manages entities using a `Map`. It provides methods to spawn, despawn, and retrieve entities, as well as iterate over all entities or entities of a specific kind.

During each simulation step, entities are updated, collisions are checked, and destroyed entities are removed.

Collision detection uses the distance between two circle centers and compares it with the sum of their radii. The collision loop checks bullet interactions with asteroids and ships.

## Particles and Respawning

Particle entities create temporary visual effects. An explosion is represented by multiple particles moving in different directions and disappearing when their time-to-live expires.

The respawn system creates a new ship after a delay and searches for a position that is sufficiently far from asteroids.

## Reflection

The second laboratory extends the original game loop with an object-oriented entity system. Encapsulation protects internal state, inheritance reuses common entity functionality, and composition allows behaviors to be added independently.

The `World` class manages entity updates and collisions, while particles, pickups, homing projectiles, and respawning add gameplay features to SpaceFight.
---

# Lab 03 — Async JavaScript

## Implemented

- JSON asset manifest in `public/assets/manifest.json`.
- Resource loaders: `loadImage`, `loadAudio`, and `loadJson`.
- HTTP status validation and JSON parsing error handling.
- `withRetry()` with exponential backoff and jitter.
- No retry for HTTP 4xx errors; aborts stop retrying.
- Concurrent resource loading through `Promise.all()`.
- Per-resource loading progress displayed on the Canvas.
- Game initialization waits for the required assets to load.
- Sprite-sheet rendering for bullets and asteroids.
- Web Audio API module with audio buffers decoded during loading.
- Audio unlock after a user gesture.
- Event-based communication between the simulation and audio module.
- Lobby with player name and arena selection.
- HTTP room loading, request timeout, refresh polling, and request cancellation.

## Asset loading

The manifest is stored in `public/assets/manifest.json`. It lists sprite images, audio files, and game configuration JSON.

The loader starts independent asset requests concurrently with `Promise.all()`. A progress callback updates the loading screen as each resource finishes.

The game starts only after `loadGameAssets()` successfully completes. If loading fails, the user can retry instead of starting with incomplete assets.

### Sequential versus concurrent loading

Sequential loading waits for each resource before requesting the next one:

```js
const results = [];

for (const asset of assets) {
  results.push(await loadAsset(asset));
}


Concurrent loading starts independent requests without waiting for earlier requests:
const results = await Promise.all(
  assets.map((asset) => loadAsset(asset))
);


Sequential loading time is approximately the sum of individual request durations. Concurrent loading time is closer to the duration of the slowest request, plus overhead, when requests can run independently.
To compare them fairly, run both methods with the same resources under similar network conditions and record elapsed time with performance.now(). Actual timing depends on the browser, cache, server, and network.
Retry and error handling
withRetry() retries eligible transient failures using exponential backoff and jitter. HTTP 4xx responses are treated as client errors and are not retried. An aborted operation stops immediately.
The JSON loader checks response.ok before parsing the response. Invalid JSON and unsuccessful HTTP responses produce errors rather than being silently accepted.
Web Audio and game events
src/audio/audio.js owns the AudioContext, decoded buffers, and playback. It unlocks audio after a user gesture and listens for game events.
The simulation emits events through src/events.js:
- fired — a projectile was fired.
- hit — a collision hit occurred.
- exploded — a target was destroyed or exploded.
The simulation does not need to import the audio module to trigger sounds.
Lobby
The lobby is implemented in src/lobby.js, with DOM rendering separated into src/lobby-view.js.
Room data is served from public/api/rooms.json. The player enters a name, selects an arena, and joins the game. Each arena specifies its asteroid count and difficulty.
The lobby refreshes the room list periodically. Requests use an abort signal and a timeout, and polling is stopped when the player joins the game.
Verification
The following checks were performed during development:
- Asset loader test: 7 of 7 resources loaded, progress reached 100%.
- Lobby test: the Training and Chaos arenas both started successfully.
- Abort test: the request was cancelled successfully using AbortController.
- Production build: npm.cmd run build completed successfully.
The diagnostic pages are public/loader-test.html and public/abort-test.html. These are development test pages, not part of the main game interface.
Event Loop exercises
Puzzle 1 — Promise and timer
console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
console.log('D');


Output: A D C B
Explanation: synchronous statements run first, then the Promise callback, then the timer callback.
Puzzle 2 — Nested microtask
console.log(1);
Promise.resolve().then(() => {
  console.log(2);
  Promise.resolve().then(() => console.log(3));
});
Promise.resolve().then(() => console.log(4));
console.log(5);


Output: 1 5 2 4 3
Explanation: microtasks run in queue order; the nested callback is queued after the already scheduled callback that prints 4.
Puzzle 3 — async and await
async function run() {
  console.log('A');
  await Promise.resolve();
  console.log('B');
}

console.log('C');
run();
console.log('D');


Output: C A D B
Explanation: await suspends the async function and resumes it through a microtask.
Puzzle 4 — Timer inside a Promise callback
Promise.resolve().then(() => {
  console.log('A');
  setTimeout(() => console.log('B'), 0);
});
Promise.resolve().then(() => console.log('C'));
console.log('D');


Output: D A C B
Explanation: the synchronous log runs first, both queued Promise callbacks run before the timer callback.
Puzzle 5 — requestAnimationFrame
console.log('A');
requestAnimationFrame(() => console.log('B'));
Promise.resolve().then(() => console.log('C'));
setTimeout(() => console.log('D'), 0);
console.log('E');


Output: A E C D B in a typical browser run where the timer fires before the next animation frame.
Explanation: synchronous code and microtasks run first; timers and animation-frame callbacks are scheduled by different browser mechanisms, so their relative order is not guaranteed in every situation.
Reflection
Asynchronous loading prevents the game from waiting for each independent asset one at a time. Retry logic and abort signals help control failed or unnecessary requests. The lobby separates room selection from gameplay, while custom events keep simulation logic independent of audio playback.
