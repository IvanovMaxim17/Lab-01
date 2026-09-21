export function drawBackground(context, width, height) {
  // Темний космічний фон
  context.fillStyle = '#050914'
  context.fillRect(0, 0, width, height)

  // =========================
  // СІТКА
  // =========================

  context.strokeStyle = 'rgba(80, 130, 180, 0.15)'
  context.lineWidth = 1

  const gridSize = 50

  for (let x = 0; x <= width; x += gridSize) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }

  for (let y = 0; y <= height; y += gridSize) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }

  // =========================
  // ЗОРІ
  // =========================

  context.fillStyle = 'rgba(255, 255, 255, 0.7)'

  for (let x = 20; x < width; x += 80) {
    for (let y = 20; y < height; y += 80) {
      const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453

      const random = value - Math.floor(value)

      const size = 1 + random * 2

      context.beginPath()
      context.arc(x, y, size, 0, Math.PI * 2)

      context.fill()
    }
  }
}

export function drawShip(context, ship) {
  context.save()

  context.translate(ship.x, ship.y)
  context.rotate(ship.angle)

  const strongThrust = ship.thrust > 0 && ship.thrustTime > 2

  // =========================
  // ДИМ
  // =========================

  if (ship.thrust > 0) {
    const smokeScale = strongThrust ? 2 : 1

    for (let i = 0; i < 9; i++) {
      const distance = (35 + i * 9) * smokeScale

      const size = (3 + i * 1.2) * smokeScale

      context.beginPath()

      context.arc(-distance, Math.sin(i * 2.5) * 4, size, 0, Math.PI * 2)

      const alpha = Math.max(0.05, 0.45 - i * 0.045)

      context.fillStyle = `rgba(180, 180, 190, ${alpha})`

      context.fill()
    }
  }

  // =========================
  // ПОЛУМ'Я
  // =========================

  if (ship.thrust > 0) {
    if (strongThrust) {
      // 🔵 СИЛЬНЕ ПОЛУМ'Я ПІСЛЯ 2 СЕКУНД

      // Зовнішнє синє полум'я
      context.beginPath()

      context.moveTo(-25, -14)
      context.lineTo(-100, 0)
      context.lineTo(-25, 14)

      context.closePath()

      const blueFlame = context.createLinearGradient(-100, 0, -25, 0)

      blueFlame.addColorStop(0, '#1976ff')
      blueFlame.addColorStop(0.5, '#39a9ff')
      blueFlame.addColorStop(1, '#ff6a00')

      context.fillStyle = blueFlame
      context.fill()

      // Жовто-помаранчева середина
      context.beginPath()

      context.moveTo(-25, -8)
      context.lineTo(-72, 0)
      context.lineTo(-25, 8)

      context.closePath()

      const middleFlame = context.createLinearGradient(-72, 0, -25, 0)

      middleFlame.addColorStop(0, '#4fc3ff')
      middleFlame.addColorStop(0.5, '#ffd84d')
      middleFlame.addColorStop(1, '#ff8c00')

      context.fillStyle = middleFlame
      context.fill()

      // Біле ядро
      context.beginPath()

      context.moveTo(-25, -4)
      context.lineTo(-55, 0)
      context.lineTo(-25, 4)

      context.closePath()

      context.fillStyle = '#fff5d6'
      context.fill()
    } else {
      // 🔥 ЗВИЧАЙНЕ ПОЛУМ'Я

      context.beginPath()

      context.moveTo(-20, -7)
      context.lineTo(-55, 0)
      context.lineTo(-20, 7)

      context.closePath()

      context.fillStyle = '#ff5a00'
      context.fill()

      // Жовта внутрішня частина
      context.beginPath()

      context.moveTo(-21, -4)
      context.lineTo(-43, 0)
      context.lineTo(-21, 4)

      context.closePath()

      context.fillStyle = '#ffd84d'
      context.fill()

      // Біле ядро
      context.beginPath()

      context.moveTo(-21, -2)
      context.lineTo(-34, 0)
      context.lineTo(-21, 2)

      context.closePath()

      context.fillStyle = '#fff5d6'
      context.fill()
    }
  }

  // =========================
  // НИЖНЄ ВЕЛИКЕ КРИЛО
  // =========================

  context.beginPath()

  context.moveTo(-5, 7)
  context.lineTo(-28, 38)
  context.lineTo(10, 18)
  context.lineTo(8, 8)

  context.closePath()

  context.fillStyle = '#555b63'
  context.fill()

  context.strokeStyle = '#cfd3d8'
  context.lineWidth = 1.5
  context.stroke()

  // =========================
  // ВЕРХНЄ ВЕЛИКЕ КРИЛО
  // =========================

  context.beginPath()

  context.moveTo(-5, -7)
  context.lineTo(-28, -38)
  context.lineTo(10, -18)
  context.lineTo(8, -8)

  context.closePath()

  context.fillStyle = '#555b63'
  context.fill()

  context.strokeStyle = '#cfd3d8'
  context.stroke()

  // =========================
  // ДОВГИЙ КОРПУС
  // =========================

  context.beginPath()

  context.moveTo(45, 0)

  context.quadraticCurveTo(32, -11, 10, -13)

  context.lineTo(-25, -11)

  context.quadraticCurveTo(-35, -6, -38, 0)

  context.quadraticCurveTo(-35, 6, -25, 11)

  context.lineTo(10, 13)

  context.quadraticCurveTo(32, 11, 45, 0)

  context.closePath()

  const bodyGradient = context.createLinearGradient(0, -14, 0, 14)

  bodyGradient.addColorStop(0, '#f2f2f2')

  bodyGradient.addColorStop(0.5, '#bfc3c7')

  bodyGradient.addColorStop(1, '#686d73')

  context.fillStyle = bodyGradient
  context.fill()

  context.strokeStyle = '#ffffff'
  context.lineWidth = 1.5
  context.stroke()

  // =========================
  // НОСОВА ЧАСТИНА
  // =========================

  context.beginPath()

  context.moveTo(45, 0)
  context.lineTo(20, -9)
  context.lineTo(20, 9)

  context.closePath()

  context.fillStyle = '#eeeeee'
  context.fill()

  context.strokeStyle = '#ffffff'
  context.stroke()

  // =========================
  // КІЛЬЦЕ НА КОРПУСІ
  // =========================

  context.beginPath()

  context.moveTo(-5, -12)
  context.lineTo(-5, 12)

  context.strokeStyle = '#777c82'
  context.lineWidth = 2
  context.stroke()

  // =========================
  // ІЛЮМІНАТОР
  // =========================

  context.beginPath()

  context.arc(15, 0, 6, 0, Math.PI * 2)

  const windowGradient = context.createRadialGradient(16, -2, 1, 15, 0, 6)

  windowGradient.addColorStop(0, '#e6f8ff')

  windowGradient.addColorStop(0.5, '#54b9ff')

  windowGradient.addColorStop(1, '#1764a0')

  context.fillStyle = windowGradient
  context.fill()

  context.strokeStyle = '#ffffff'
  context.lineWidth = 1
  context.stroke()

  // =========================
  // ЗАДНЯ ЧАСТИНА
  // =========================

  context.beginPath()

  context.arc(-30, 0, 7, 0, Math.PI * 2)

  context.fillStyle = '#34383d'
  context.fill()

  context.strokeStyle = '#999999'
  context.stroke()

  context.restore()
}
