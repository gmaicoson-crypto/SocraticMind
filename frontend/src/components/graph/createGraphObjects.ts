import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { KNode } from '../../types'
import { makeRoundedRect, makeSelectionRing } from './graphAppearance'
import type { GraphSceneState } from './createGraphSceneState'
import type { createGraphLayout } from './createGraphLayout'
import {
  type GraphPalette,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_RADIUS,
  EDGE_SAMPLES,
  type EdgeObject,
} from './graphSceneTypes'

type Context = Pick<GraphSceneState, 'scene' | 'nodeObjects' | 'edgeObjects' | 'props'> &
  Pick<ReturnType<typeof createGraphLayout>, 'nodeWorldPosition'>
export function createGraphObjects(context: Context) {
  const { scene, nodeObjects, edgeObjects, props, nodeWorldPosition } = context
  function disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry)
        child.geometry.dispose()
      if ('material' in child) {
        const material = child.material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else if (material instanceof THREE.Material) material.dispose()
      }
    })
  }

  function clearScene() {
    scene.children.slice().forEach((child) => {
      scene.remove(child)
      disposeObject(child)
    })
    nodeObjects.clear()
    edgeObjects.splice(0)
  }

  function makeNode(node: KNode, colors: GraphPalette) {
    const group = new THREE.Group()
    const position = nodeWorldPosition(node)
    group.position.set(position.x, position.y, 0)
    group.userData.nodeId = node.id
    group.userData.baseX = position.x
    group.userData.baseY = position.y
    group.userData.homeX = position.x
    group.userData.homeY = position.y
    group.userData.phase = node.id.length * 0.73
    group.userData.state = node.state

    const fill =
      node.state === 'mastered'
        ? colors.mastered
        : node.state === 'available'
          ? colors.surface
          : colors.locked
    const stroke =
      node.state === 'mastered'
        ? colors.blue2
        : node.state === 'available'
          ? colors.blue
          : colors.locked
    const body = new THREE.Mesh(
      makeRoundedRect(NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS),
      new THREE.MeshBasicMaterial({
        color: fill,
        transparent: true,
        opacity: node.state === 'locked' ? 0.55 : 0.96,
      }),
    )
    body.userData.nodeId = node.id
    const mask = new THREE.Mesh(
      body.geometry,
      new THREE.MeshBasicMaterial({ color: colors.background }),
    )
    mask.position.z = -0.1
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(body.geometry),
      new THREE.LineBasicMaterial({
        color: stroke,
        transparent: true,
        opacity: node.state === 'locked' ? 0.5 : 0.95,
      }),
    )
    outline.scale.set(1.005, 1.005, 1.005)
    const selectionRing = makeSelectionRing(colors)

    group.add(mask, body, outline, selectionRing)
    group.userData.body = body
    group.userData.mask = mask
    group.userData.outline = outline
    group.userData.selectionRing = selectionRing
    scene.add(group)
    nodeObjects.set(node.id, group)
  }

  function makeEdge(source: string, target: string, colors: GraphPalette) {
    const from = props.nodes.find((node) => node.id === source)
    const to = props.nodes.find((node) => node.id === target)
    if (!from || !to) return
    const start = nodeWorldPosition(from)
    const end = nodeWorldPosition(to)
    const dx = end.x - start.x
    const dy = end.y - start.y
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(start.x, start.y, -0.2),
      new THREE.Vector3(start.x + dx * 0.1, start.y + dy * 0.55, -0.2),
      new THREE.Vector3(end.x - dx * 0.1, end.y - dy * 0.55, -0.2),
      new THREE.Vector3(end.x, end.y, -0.2),
    )
    const points = curve.getPoints(EDGE_SAMPLES)
    const geometry = new LineGeometry()
    geometry.setPositions(points.flatMap((point) => [point.x, point.y, point.z]))
    const positionBuffer = (
      geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute
    ).data
    positionBuffer.setUsage(THREE.DynamicDrawUsage)
    const line = new Line2(
      geometry,
      new LineMaterial({
        color: colors.line,
        linewidth: 3,
      }),
    )
    scene.add(line)
    edgeObjects.push({
      source,
      target,
      line,
      maxLength: 0,
    })
  }

  function updateEdge(edge: EdgeObject) {
    const from = nodeObjects.get(edge.source)?.position
    const to = nodeObjects.get(edge.target)?.position
    if (!from || !to) return
    const dx = to.x - from.x
    const dy = to.y - from.y
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(from.x, from.y, -0.2),
      new THREE.Vector3(from.x + dx * 0.1, from.y + dy * 0.55, -0.2),
      new THREE.Vector3(to.x - dx * 0.1, to.y - dy * 0.55, -0.2),
      new THREE.Vector3(to.x, to.y, -0.2),
    )
    const points = curve.getPoints(EDGE_SAMPLES)
    const buffer = (
      edge.line.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute
    ).data
    for (let index = 0; index < EDGE_SAMPLES; index += 1) {
      const offset = index * 6
      const start = points[index]
      const end = points[index + 1]
      buffer.array.set([start.x, start.y, start.z, end.x, end.y, end.z], offset)
    }
    buffer.needsUpdate = true
    edge.line.geometry.computeBoundingSphere()
  }
  return { disposeObject, clearScene, makeNode, makeEdge, updateEdge }
}
