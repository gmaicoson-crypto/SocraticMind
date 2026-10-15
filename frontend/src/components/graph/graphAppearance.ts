import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { type GraphPalette, NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS } from './graphSceneTypes'

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function color(name: string, fallback: string): THREE.Color {
  const value = css(name) || fallback
  const result = new THREE.Color()
  try {
    result.setStyle(value)
  } catch {
    result.setStyle(fallback)
  }
  return result
}

export function palette(): GraphPalette {
  return {
    background: color('--bg', '#f7f4ef'),
    blue: color('--blue', '#5ba3d9'),
    blue2: color('--blue-2', '#2e7fbb'),
    line: color('--graph-edge', '#a79986'),
    locked: color('--locked', '#c8c4bc'),
    surface: color('--graph-node-available-bg', '#ffffff'),
    mastered: color('--graph-node-mastered-bg', '#5ba3d9'),
  }
}

export function makeRoundedRect(width: number, height: number, radius: number) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return new THREE.ShapeGeometry(shape)
}

export function makeSelectionRing(paletteValue: GraphPalette) {
  const width = NODE_WIDTH + 8
  const height = NODE_HEIGHT + 8
  const radius = NODE_RADIUS + 4
  const cornerSegments = 8
  const points: THREE.Vector3[] = [
    new THREE.Vector3(-width / 2 + radius, height / 2, 0.22),
    new THREE.Vector3(width / 2 - radius, height / 2, 0.22),
  ]
  const corners: [number, number, number, number][] = [
    [width / 2 - radius, height / 2 - radius, Math.PI / 2, 0],
    [width / 2 - radius, -height / 2 + radius, 0, -Math.PI / 2],
    [-width / 2 + radius, -height / 2 + radius, -Math.PI / 2, -Math.PI],
    [-width / 2 + radius, height / 2 - radius, Math.PI, Math.PI / 2],
  ]
  corners.forEach(([centerX, centerY, startAngle, endAngle], cornerIndex) => {
    for (let index = 1; index <= cornerSegments; index += 1) {
      const angle = startAngle + ((endAngle - startAngle) * index) / cornerSegments
      points.push(
        new THREE.Vector3(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
          0.22,
        ),
      )
      if (cornerIndex === 0 && index === cornerSegments)
        points.push(new THREE.Vector3(width / 2, -height / 2 + radius, 0.22))
      if (cornerIndex === 1 && index === cornerSegments)
        points.push(new THREE.Vector3(-width / 2 + radius, -height / 2, 0.22))
      if (cornerIndex === 2 && index === cornerSegments)
        points.push(new THREE.Vector3(-width / 2, height / 2 - radius, 0.22))
    }
  })
  points.push(points[0].clone())

  const geometry = new LineGeometry()
  geometry.setPositions(points.flatMap((point) => [point.x, point.y, point.z]))
  const ring = new Line2(
    geometry,
    new LineMaterial({
      color: paletteValue.blue,
      transparent: true,
      opacity: 0.9,
      linewidth: 3,
      dashed: true,
      dashSize: 8,
      gapSize: 5,
    }),
  )
  ring.computeLineDistances()
  ring.visible = false
  return ring
}
