import { createLoop } from './loop.js'
import { createInput } from './input.js'
import { createShip, integrate } from './sim/ship.js'
import { wrapShip } from './sim/arena.js'
import { createCanvas } from './render/canvas.js'
import {
  drawBackground,
  drawShip,
} from './render/draw.js'

const app = document.querySelector('#app')

app.innerHTML = ''

const title = document.createElement('h1')
title.textContent = 'SpaceFight — Lab 01'

const hud = document.createElement('p')
hud.textContent = 'Steps/s: 0 | Frames/s: 0 | Frame time: 0 ms'

const controls = document.createElement('p')
controls.textContent = 'W = thrust | A = left | D = right'

app.append(title, hud, controls)

const input = createInput()
const ship = createShip()
const canvas = createCanvas()

let previousShip = { ...ship }

let totalSteps = 0
let frames = 0

let lastMetricsTime = performance.now()
let stepsPerSecond = 0
let framesPerSecond = 0

function lerp(a, b, alpha) {
  return a + (b - a) * alpha
}

function lerpAngle(a, b, alpha) {
  let difference = b - a

  while (difference > Math.PI) {
    difference -= Math.PI * 2
  }

  while (difference < -Math.PI) {
    difference += Math.PI * 2
  }

  return a + difference * alpha
}

const loop = createLoop({
  simulate(deltaTime) {
    previousShip = { ...ship }

    integrate(ship, input, deltaTime)

    wrapShip(ship, canvas.width, canvas.height)

    totalSteps++
  },

  render(alpha, steps, frameTime) {
    frames++

    const now = performance.now()

    if (now - lastMetricsTime >= 1000) {
      stepsPerSecond = totalSteps
      framesPerSecond = frames

      totalSteps = 0
      frames = 0
      lastMetricsTime = now
    }

    hud.textContent =
      `Steps/s: ${stepsPerSecond} | ` +
      `Frames/s: ${framesPerSecond} | ` +
      `Frame time: ${frameTime.toFixed(2)} ms`

    const renderX = lerp(
      previousShip.x,
      ship.x,
      alpha,
    )

    const renderY = lerp(
      previousShip.y,
      ship.y,
      alpha,
    )

    const renderAngle = lerpAngle(
  previousShip.angle,
  ship.angle,
  alpha,
)

const renderShip = {
  ...ship,
  x: renderX,
  y: renderY,
  angle: renderAngle,
}

    drawBackground(
  canvas.context,
  canvas.width,
  canvas.height,
)

drawShip(
  canvas.context,
  renderShip,
)
  },
})

loop.start()