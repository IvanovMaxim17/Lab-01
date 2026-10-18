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