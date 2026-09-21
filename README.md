# Lab 01 — The Event Loop Is the Game Loop

## SpaceFight

A small browser space game built with JavaScript and Canvas 2D.

## Implemented

* `requestAnimationFrame` game loop
* fixed timestep simulation at 60 Hz
* accumulator
* interpolation
* keyboard input using a closure
* `isDown()` and `justPressed()`
* ship movement and rotation
* wrap-around arena
* Canvas 2D rendering
* DPR-aware and resizable canvas
* grid and starfield
* HUD with Steps/s, Frames/s and Frame time
* rocket thrust and smoke
* boost mode after holding W for more than 2 seconds

## Project structure

* `loop.js` — game loop and fixed timestep
* `input.js` — keyboard input
* `sim/ship.js` — ship simulation
* `sim/arena.js` — wrap-around
* `render/canvas.js` — Canvas setup and resizing
* `render/draw.js` — game rendering

## Fixed timestep

The simulation uses a fixed timestep of:

`1 / 60` seconds

The accumulator allows the simulation to perform the required number of fixed updates independently from the rendering frame rate.

Interpolation is used to make the rendered movement smoother.

## Experiments

### Experiment 1 — Synchronous blocking

A synchronous `busyWait` of approximately 100 ms was intentionally added to the main thread.

Observed result:

* Busy wait: approximately **100 ms**
* Steps/s: approximately **55–60**
* Rendering became visibly less smooth during the blocking operation.

Conclusion:

JavaScript synchronous code runs on the main thread. While the busy loop is executing, the browser cannot process rendering and other main-thread work normally.

### Experiment 2 — setInterval vs requestAnimationFrame

The game loop was temporarily changed from `requestAnimationFrame` to `setInterval`.

Measured over approximately 10 seconds:

* `requestAnimationFrame`: **60.05 FPS**
* `setInterval`: **57.00 FPS**
* Average `setInterval` interval: **17.54 ms**
* After switching to another browser tab for approximately 5 seconds: **30.79 FPS**

Conclusion:

`requestAnimationFrame` is designed for browser rendering and synchronizes animation work with the browser's rendering cycle. `setInterval` does not provide the same rendering-oriented scheduling behavior.

### Experiment 3 — Variable timestep

The accumulator and fixed timestep were temporarily removed and the simulation was changed to use the real frame `deltaTime`.

With CPU throttling set to **6×**, the ship was moved by holding W for approximately 5 seconds.

Measured results:

| Mode              |      X |    Vx |
| ----------------- | -----: | ----: |
| Variable timestep | 672.83 | 31.69 |
| Fixed timestep    | 751.56 | 12.09 |

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
