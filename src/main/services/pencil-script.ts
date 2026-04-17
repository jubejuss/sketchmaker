import type { DirectionSpec, VisualElement, FontWeight } from '../../shared/types.js'

// Pencil's batch_design DSL: operations are single-line calls like
//   binding=I(parent,{...})
//   G(binding,"stock","keywords")
//   U("nodeId",{...})
// Each batch_design call accepts up to 25 operations. Bindings live only
// within the batch; for cross-batch parent references we must use the real
// node ID returned from the previous batch.
//
// This module builds strings of operation lines from our DirectionSpec DSL.
// The orchestrator in mcp-pencil.ts chunks them into ≤24-op batches and
// feeds returned node IDs into later batches.

export const FW = 1440
export const COLUMN_GAP = 80

const WEIGHT_TO_CSS: Record<FontWeight, string> = {
  Regular: '400',
  Medium: '500',
  SemiBold: '600',
  Bold: '700',
  Black: '900'
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'on', 'in', 'with', 'and', 'or', 'for', 'to', 'at',
  'by', 'from', 'is', 'are', 'be', 'being', 'that', 'this', 'those', 'these',
  'it', 'its', 'as', 'into', 'over', 'under', 'between', 'very', 'warm',
  'cool', 'soft', 'hard', 'light', 'dark'
])

export function extractImageKeywords(prompt: string): string {
  const words = prompt.toLowerCase().split(/[^a-zA-Z0-9åäöõ]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  const out: string[] = []
  for (const w of words) {
    if (!out.includes(w)) out.push(w)
    if (out.length >= 3) break
  }
  return out.join(' ') || 'abstract texture'
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function normalizeHex(col?: string): string | undefined {
  if (!col) return undefined
  const s = col.trim()
  if (!s) return undefined
  const withHash = s.startsWith('#') ? s : '#' + s
  // Claude occasionally emits "transparent", "none", or a partial hex.
  // Pencil rejects anything non-hex with an error that rolls back the batch.
  return HEX_RE.test(withHash) ? withHash : undefined
}

function optionalStroke(color: string | undefined, weight: number | undefined): Record<string, unknown> | undefined {
  const fill = normalizeHex(color)
  if (!fill) return undefined
  return { thickness: weight || 1, fill }
}

function weightCss(w?: FontWeight): string | undefined {
  if (!w) return undefined
  return WEIGHT_TO_CSS[w] ?? '400'
}

function elementToNodeData(el: VisualElement, direction: DirectionSpec): Record<string, unknown> {
  const base: Record<string, unknown> = {
    x: Math.round(el.x || 0),
    y: Math.round(el.y || 0)
  }
  if (el.w !== undefined) base.width = Math.round(el.w)
  if (el.h !== undefined) base.height = Math.round(el.h)
  if (el.rotation) base.rotation = el.rotation
  if (el.opacity !== undefined && el.opacity !== 1) base.opacity = el.opacity

  switch (el.kind) {
    case 'text': {
      const family = el.fontFamily || direction.fonts.body || 'Inter'
      const w = weightCss(el.fontWeight) || '400'
      const size = el.fontSize || 16
      const content = transformCase(el.text || '', el.textCase)
      return {
        ...base,
        type: 'text',
        content: content.slice(0, 2000),
        fontFamily: family,
        fontWeight: w,
        fontSize: size,
        fill: normalizeHex(el.color) || '#1A1A1A'
      }
    }
    case 'rect': {
      const n: Record<string, unknown> = { ...base, type: 'rectangle' }
      const fill = normalizeHex(el.color)
      if (fill) n.fill = fill
      if (el.cornerRadius) n.cornerRadius = el.cornerRadius
      const stroke = optionalStroke(el.strokeColor, el.strokeWeight)
      if (stroke) n.stroke = stroke
      return n
    }
    case 'ellipse': {
      const n: Record<string, unknown> = { ...base, type: 'ellipse' }
      const fill = normalizeHex(el.color)
      if (fill) n.fill = fill
      const stroke = optionalStroke(el.strokeColor, el.strokeWeight)
      if (stroke) n.stroke = stroke
      return n
    }
    case 'line': {
      const x1 = el.x || 0
      const y1 = el.y || 0
      const x2 = el.x2 ?? x1
      const y2 = el.y2 ?? y1
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const rotation = Math.atan2(dy, dx) * 180 / Math.PI
      return {
        type: 'line',
        x: Math.round(x1),
        y: Math.round(y1),
        width: Math.round(len),
        height: 0,
        rotation,
        stroke: { thickness: el.strokeWeight || 1, fill: normalizeHex(el.color) || '#1A1A1A' }
      }
    }
    case 'frame': {
      const n: Record<string, unknown> = {
        ...base,
        type: 'frame',
        layout: 'none'
      }
      const fill = normalizeHex(el.color)
      if (fill) n.fill = fill
      if (el.cornerRadius) n.cornerRadius = el.cornerRadius
      const stroke = optionalStroke(el.strokeColor, el.strokeWeight)
      if (stroke) n.stroke = stroke
      return n
    }
    case 'image': {
      const n: Record<string, unknown> = { ...base, type: 'rectangle', fill: '#C7C2BA' }
      if (el.cornerRadius) n.cornerRadius = el.cornerRadius
      return n
    }
  }
}

function transformCase(s: string, mode?: VisualElement['textCase']): string {
  if (!mode || mode === 'original') return s
  if (mode === 'upper') return s.toUpperCase()
  if (mode === 'lower') return s.toLowerCase()
  if (mode === 'title') {
    return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase())
  }
  return s
}

export interface BuiltSubtree {
  lines: string[]
  rootBinding: string
}

export interface PendingImage {
  binding: string
  keywords: string
}

// Build all ops for a subtree rooted at el, inserted under `parent`. The
// Pencil DSL distinguishes between parents passed as binding variables
// (unquoted identifiers scoped to the current batch) and concrete node IDs
// (quoted strings). Within a subtree we recurse with the root binding as the
// children's parent, so the flag toggles once we descend.
//
// Image G() ops are NOT emitted inline — a single 404 from Pencil's stock
// service rolls back the entire batch, taking every other insert with it.
// Instead we push {binding, keywords} onto `images` for the caller to apply
// via separate batches after the real node IDs are resolved.
export function buildElementSubtree(
  parent: string,
  parentIsBinding: boolean,
  el: VisualElement,
  direction: DirectionSpec,
  bindingCounter: { value: number },
  images: PendingImage[]
): BuiltSubtree {
  const rootBinding = `n${bindingCounter.value++}`
  const lines: string[] = []
  const nodeData = elementToNodeData(el, direction)
  const parentExpr = parentIsBinding ? parent : JSON.stringify(parent)
  lines.push(`${rootBinding}=I(${parentExpr},${JSON.stringify(nodeData)})`)

  if (el.kind === 'image' && el.imagePrompt) {
    images.push({ binding: rootBinding, keywords: extractImageKeywords(el.imagePrompt) })
  }

  if (el.kind === 'frame' && Array.isArray(el.children)) {
    for (const child of el.children) {
      const sub = buildElementSubtree(rootBinding, true, child, direction, bindingCounter, images)
      lines.push(...sub.lines)
    }
  }

  return { lines, rootBinding }
}

export function countOpsInSubtree(el: VisualElement): number {
  let n = 1
  if (el.kind === 'frame' && Array.isArray(el.children)) {
    for (const c of el.children) n += countOpsInSubtree(c)
  }
  return n
}

export function columnFrameData(spec: DirectionSpec, index: number, columnHeight: number): Record<string, unknown> {
  const bg = spec.palette[spec.palette.length - 1] || '#F4F1EA'
  return {
    type: 'frame',
    name: spec.title || `Suund ${index + 1}`,
    layout: 'none',
    x: index * (FW + COLUMN_GAP),
    y: 0,
    width: FW,
    height: columnHeight,
    fill: normalizeHex(bg) || '#F4F1EA',
    cornerRadius: 10
  }
}

export function sectionFrameData(type: string, y: number, height: number): Record<string, unknown> {
  return {
    type: 'frame',
    name: type,
    layout: 'none',
    x: 0,
    y,
    width: FW,
    height
  }
}
