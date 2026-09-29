interface Point {
  x: number
  y: number
}

interface PositionedNode extends Point {
  id: string
}

interface PositionedEdge {
  source: string
  target: string
}

export interface GraphViewport {
  width: number
  height: number
  top: number
  bottom: number
  side: number
}

interface NodeSize {
  width: number
  height: number
  padding: number
}

export function graphDesktopPositions(nodes: PositionedNode[], edges: PositionedEdge[]) {
  const positions = new Map<string, Point>()
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const parentById = new Map(edges.map((edge) => [edge.target, edge.source]))
  const levels = [...new Set(nodes.map((node) => node.y))]

  levels.forEach((level) => {
    const levelNodes = nodes.filter((node) => node.y === level)
    if (levelNodes.length < 4) return
    const groups = new Map<string, PositionedNode[]>()
    levelNodes.forEach((node) => {
      const parentId = parentById.get(node.id)
      if (!parentId) return
      const siblings = groups.get(parentId) ?? []
      siblings.push(node)
      groups.set(parentId, siblings)
    })
    const siblingGroups = [...groups.values()]
    if (
      groups.size < 2 ||
      groups.size > 3 ||
      siblingGroups.some((siblings) => siblings.length !== 2) ||
      siblingGroups.reduce((count, siblings) => count + siblings.length, 0) !== levelNodes.length
    )
      return

    groups.forEach((siblings, parentId) => {
      const parent = nodesById.get(parentId)
      if (!parent) return
      const parentPosition = positions.get(parentId) ?? parent
      siblings.sort((a, b) => a.x - b.x)
      siblings.forEach((node, index) => {
        positions.set(node.id, {
          x: parentPosition.x + (index === 0 ? -100 : 100),
          y: node.y + index * 90,
        })
      })
    })
  })

  return positions
}

export function graphLayoutScale(
  nodes: Point[],
  viewport: GraphViewport,
  node: NodeSize,
  minimumVisibleWidth = 0,
) {
  if (nodes.length < 2) return { x: 1, y: 1 }

  const xs = nodes.map((item) => item.x)
  const ys = nodes.map((item) => item.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const width = Math.max(viewport.width - viewport.side * 2, 1)
  const height = Math.max(viewport.height - viewport.top - viewport.bottom, 1)
  const rawWidth = spanX + node.width + node.padding * 2
  const rawHeight = spanY + node.height + node.padding * 2
  const targetAspect = width / height
  const rawAspect = rawWidth / rawHeight
  const rows = new Map<number, number[]>()
  nodes.forEach((item) => {
    const row = rows.get(item.y) ?? []
    row.push(item.x)
    rows.set(item.y, row)
  })
  let minimumSiblingGap = Infinity
  rows.forEach((row) => {
    row.sort((a, b) => a - b)
    for (let index = 1; index < row.length; index += 1) {
      const gap = row[index] - row[index - 1]
      if (gap > 0) minimumSiblingGap = Math.min(minimumSiblingGap, gap)
    }
  })
  const minimumXScale = (node.width + 16) / minimumSiblingGap
  const x = Math.max(
    rawAspect > targetAspect ? Math.max(0.72, targetAspect / rawAspect) : 1,
    minimumXScale,
  )
  const scaledWidth = spanX * x + node.width + node.padding * 2
  const visibleWidth = Math.max((scaledWidth * viewport.width) / width, minimumVisibleWidth)
  const y =
    spanY > 0
      ? Math.min(
          1.4,
          Math.max(
            1,
            (visibleWidth * (height / viewport.width) - node.height - node.padding * 2) / spanY,
          ),
        )
      : 1

  return { x, y }
}

export function graphCameraFrame(
  bounds: { width: number; height: number },
  viewport: GraphViewport,
  minimumVisibleWidth = 0,
) {
  const width = Math.max(viewport.width, 1)
  const height = Math.max(viewport.height, 1)
  const availableWidth = Math.max(width - viewport.side * 2, 1)
  const availableHeight = Math.max(height - viewport.top - viewport.bottom, 1)
  const visibleWidth = Math.max(
    (bounds.width * width) / availableWidth,
    (bounds.height * width) / availableHeight,
    minimumVisibleWidth,
  )
  const visibleHeight = (visibleWidth * height) / width

  return {
    visibleWidth,
    centerY: ((viewport.top - viewport.bottom) * visibleHeight) / (2 * height),
  }
}
