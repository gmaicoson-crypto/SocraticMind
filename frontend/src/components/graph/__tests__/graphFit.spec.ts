import { describe, expect, it } from 'vitest'
import { graphCameraFrame, graphDesktopPositions, graphLayoutScale } from '../graphFit'

const node = { width: 190, height: 82, padding: 32 }
const nodes = [
  { x: 590, y: 120 },
  { x: 394, y: 300 },
  { x: 590, y: 300 },
  { x: 786, y: 300 },
  ...Array.from({ length: 6 }, (_, index) => ({ x: 100 + index * 196, y: 480 })),
]

describe('graph viewport fit', () => {
  it.each([
    { width: 1300, height: 1390, top: 112, bottom: 68, side: 28 },
    { width: 760, height: 780, top: 112, bottom: 68, side: 28 },
  ])('fits the usable desktop canvas at $width x $height without stretching tiers', (viewport) => {
    const scale = graphLayoutScale(nodes, viewport, node)
    const bounds = {
      width: 980 * scale.x + node.width + node.padding * 2,
      height: 360 * scale.y + node.height + node.padding * 2,
    }
    const frame = graphCameraFrame(bounds, viewport)
    const contentWidth = ((bounds.width - node.padding * 2) / frame.visibleWidth) * viewport.width
    const contentHeight = ((bounds.height - node.padding * 2) / frame.visibleWidth) * viewport.width
    const centerY = viewport.height / 2 + (frame.centerY / frame.visibleWidth) * viewport.width

    expect((viewport.width - contentWidth) / 2).toBeGreaterThanOrEqual(viewport.side)
    expect(centerY - contentHeight / 2).toBeGreaterThanOrEqual(viewport.top)
    expect(centerY + contentHeight / 2).toBeLessThanOrEqual(viewport.height - viewport.bottom)
    expect(contentWidth / (viewport.width - viewport.side * 2)).toBeGreaterThan(0.85)
    expect(scale.y).toBeLessThanOrEqual(1.4)
    expect(196 * scale.x).toBeGreaterThanOrEqual(node.width + 16)
  })

  it('keeps a single node finite and centered in the usable region', () => {
    const viewport = { width: 390, height: 720, top: 140, bottom: 68, side: 16 }
    expect(graphLayoutScale([nodes[0]], viewport, node)).toEqual({ x: 1, y: 1 })
    const minimumVisibleWidth = (node.width * 0.6 * viewport.width) / 120
    const frame = graphCameraFrame({ width: 178, height: 113 }, viewport, minimumVisibleWidth)
    expect(Number.isFinite(frame.visibleWidth)).toBe(true)
    expect(frame.centerY).toBeGreaterThan(0)
    expect((node.width * 0.6 * viewport.width) / frame.visibleWidth).toBeCloseTo(120)
  })

  it('caps vertical spacing for a narrow graph', () => {
    const viewport = { width: 1300, height: 1390, top: 112, bottom: 68, side: 28 }
    const minimumVisibleWidth = (node.width * viewport.width) / 220
    const scale = graphLayoutScale(
      [
        { x: 500, y: 120 },
        { x: 500, y: 300 },
      ],
      viewport,
      node,
      minimumVisibleWidth,
    )
    const bounds = {
      width: node.width + node.padding * 2,
      height: 180 * scale.y + node.height + node.padding * 2,
    }
    const frame = graphCameraFrame(bounds, viewport, minimumVisibleWidth)
    const contentHeight = ((bounds.height - node.padding * 2) / frame.visibleWidth) * viewport.width

    expect(scale.y).toBe(1.4)
    expect(contentHeight / (viewport.height - viewport.top - viewport.bottom)).toBeLessThan(0.65)
    expect((node.width * viewport.width) / frame.visibleWidth).toBeLessThanOrEqual(220)
  })

  it('stagger pairs of leaves while retaining their parent columns', () => {
    const treeNodes = [
      { id: 'root', x: 590, y: 120 },
      ...['a', 'b', 'c'].map((id, index) => ({ id, x: 394 + index * 196, y: 300 })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `leaf-${index}`,
        x: 100 + index * 196,
        y: 480,
      })),
    ]
    const edges = Array.from({ length: 6 }, (_, index) => ({
      source: ['a', 'b', 'c'][Math.floor(index / 2)],
      target: `leaf-${index}`,
    }))
    const positions = graphDesktopPositions(treeNodes, edges)

    expect(positions.size).toBe(6)
    expect(positions.get('leaf-0')).toEqual({ x: 294, y: 480 })
    expect(positions.get('leaf-1')).toEqual({ x: 494, y: 570 })
    expect(positions.get('leaf-4')).toEqual({ x: 686, y: 480 })
    expect(positions.get('leaf-5')).toEqual({ x: 886, y: 570 })
  })

  it('leaves other graph shapes at their supplied coordinates', () => {
    expect(
      graphDesktopPositions(
        [
          { id: 'root', x: 0, y: 0 },
          { id: 'a', x: -100, y: 100 },
          { id: 'b', x: 0, y: 100 },
          { id: 'c', x: 100, y: 100 },
        ],
        [],
      ).size,
    ).toBe(0)
  })
})
