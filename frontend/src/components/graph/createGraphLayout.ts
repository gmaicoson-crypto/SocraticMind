import type { KNode } from '../../types'
import { graphDesktopPositions, graphLayoutScale, type GraphViewport } from './graphFit'
import { NODE_WIDTH, NODE_HEIGHT, GRAPH_VIEW_PADDING } from './graphSceneTypes'
import type { GraphSceneState } from './createGraphSceneState'

type Context = Pick<
  GraphSceneState,
  | 'layoutMode'
  | 'mobilePositions'
  | 'world'
  | 'desktopPositions'
  | 'layoutScale'
  | 'nodeObjects'
  | 'props'
>
export function createGraphLayout(context: Context) {
  const { layoutMode, mobilePositions, world, desktopPositions, layoutScale, nodeObjects, props } =
    context
  function nodeWorldPosition(node: KNode) {
    if (layoutMode.value === 'mobile') {
      const mobilePosition = mobilePositions.get(node.id)
      if (mobilePosition)
        return { x: mobilePosition.x - world.centerX, y: world.centerY - mobilePosition.y }
    }
    const position = desktopPositions.get(node.id) ?? node
    return {
      x: (position.x - world.centerX) * layoutScale.x,
      y: (world.centerY - position.y) * layoutScale.y,
    }
  }

  function setWorldBounds() {
    desktopPositions.clear()
    if (layoutMode.value === 'mobile') {
      const levels = [...new Set(props.nodes.map((node) => node.y))].sort((a, b) => a - b)
      mobilePositions.clear()
      const rows: KNode[][] = []
      levels.forEach((level) => {
        const levelNodes = props.nodes.filter((node) => node.y === level).sort((a, b) => a.x - b.x)
        const rowCount = Math.ceil(levelNodes.length / 3)
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
          rows.push(levelNodes.filter((_, index) => index % rowCount === rowIndex))
        }
      })
      const rowSpacing = rows.length > 1 ? Math.max(100, 520 / (rows.length - 1)) : 0
      rows.forEach((row, rowIndex) => {
        const y = rows.length > 1 ? 140 + rowSpacing * rowIndex : 400
        row.forEach((node, index) => {
          mobilePositions.set(node.id, {
            x: row.length > 1 ? 65 + (260 * index) / (row.length - 1) : 195,
            y,
          })
        })
      })
      const lastY = rows.length > 1 ? 140 + rowSpacing * (rows.length - 1) : 400
      world.width = 390
      world.height = Math.max(800, lastY - 140 + 280)
      world.centerX = 195
      world.centerY = rows.length > 1 ? (140 + lastY) / 2 : 400
      return
    }
    if (props.nodes.length === 0) {
      world.width = 1100
      world.height = 720
      world.centerX = 0
      world.centerY = 0
      return
    }
    graphDesktopPositions(props.nodes, props.edges).forEach((position, id) =>
      desktopPositions.set(id, position),
    )
    const positions = props.nodes.map((node) => desktopPositions.get(node.id) ?? node)
    const xs = positions.map((node) => node.x)
    const ys = positions.map((node) => node.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    world.centerX = (minX + maxX) / 2
    world.centerY = (minY + maxY) / 2
    world.width = Math.max(1100, maxX - minX + 240)
    world.height = Math.max(720, maxY - minY + 240)
  }

  function updateLayoutScale(viewport: GraphViewport, minimumVisibleWidth: number) {
    const nextScale =
      layoutMode.value === 'desktop'
        ? graphLayoutScale(
            props.nodes.map((node) => desktopPositions.get(node.id) ?? node),
            viewport,
            { width: NODE_WIDTH, height: NODE_HEIGHT, padding: GRAPH_VIEW_PADDING },
            minimumVisibleWidth,
          )
        : { x: 1, y: 1 }

    const changed =
      Math.abs(layoutScale.x - nextScale.x) > 0.01 || Math.abs(layoutScale.y - nextScale.y) > 0.01
    if (changed) {
      layoutScale.x = nextScale.x
      layoutScale.y = nextScale.y
    }
    return changed
  }

  function graphContentBounds() {
    if (nodeObjects.size === 0) return { width: world.width, height: world.height }

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    nodeObjects.forEach((group) => {
      const scale = group.scale.x || 1
      const halfWidth = (NODE_WIDTH * scale) / 2
      const halfHeight = (NODE_HEIGHT * scale) / 2
      minX = Math.min(minX, group.position.x - halfWidth)
      maxX = Math.max(maxX, group.position.x + halfWidth)
      minY = Math.min(minY, group.position.y - halfHeight)
      maxY = Math.max(maxY, group.position.y + halfHeight)
    })

    return {
      width: maxX - minX + GRAPH_VIEW_PADDING * 2,
      height: maxY - minY + GRAPH_VIEW_PADDING * 2,
    }
  }
  return { nodeWorldPosition, setWorldBounds, updateLayoutScale, graphContentBounds }
}
