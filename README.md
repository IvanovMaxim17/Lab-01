# Lab 01 — The Event Loop Is the Game Loop

## SpaceFight

A small browser space game built with JavaScript and Canvas 2D.

## Implemented

- requestAnimationFrame game loop
- fixed timestep simulation at 60 Hz
- accumulator
- interpolation
- keyboard input using a closure
- isDown() and justPressed()
- ship movement and rotation
- wrap-around arena
- Canvas 2D rendering
- DPR-aware and resizable canvas
- grid and starfield
- HUD with Steps/s, Frames/s and Frame time
- rocket thrust and smoke
- boost mode after holding W for more than 2 seconds

## Project structure

- `loop.js` — game loop and fixed timestep
- `input.js` — keyboard input
- `sim/ship.js` — ship simulation
- `sim/arena.js` — wrap-around
- `render/canvas.js` — Canvas setup and resizing
- `render/draw.js` — game rendering

## Fixed timestep

The simulation uses a fixed timestep of:

`1 / 60` seconds

The accumulator allows the simulation to perform the required number of fixed updates independently from the rendering frame rate.

Interpolation is used to make the rendered movement smoother.

## Reflection

### Why does a synchronous busy loop freeze the page?

JavaScript executes synchronous code on the main thread. While a synchronous loop is running, the browser cannot process rendering, input or other tasks.

### Why use requestAnimationFrame?

`requestAnimationFrame` is designed for browser animation and synchronizes rendering with the browser's refresh cycle.

### Why use a fixed timestep?

A fixed timestep makes the simulation more predictable and helps keep the game physics independent from the rendering frame rate.

### Why use closures for keyboard input?

The input function keeps the keyboard state inside its closure, so other parts of the program can access the state through `isDown()` and `justPressed()` without directly accessing the internal Set.