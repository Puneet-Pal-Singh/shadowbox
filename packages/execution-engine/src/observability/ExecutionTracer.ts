/**
 * Execution Tracer - Timeline tracking for execution operations
 * Builds execution timeline with span tracking
 */

/**
 * Execution span (event with timing)
 */
export interface ExecutionSpan {
  id: string
  name: string
  startTime: number
  endTime?: number
  duration?: number
  status: 'pending' | 'active' | 'completed' | 'failed'
  parentId?: string
  metadata?: Record<string, unknown>
}

/**
 * Execution timeline
 */
export interface ExecutionTimeline {
  runId: string
  startTime: number
  endTime?: number
  spans: ExecutionSpan[]
}

/**
 * Execution tracer for timeline building
 */
export class ExecutionTracer {
  private timeline: ExecutionTimeline
  private spanStack: ExecutionSpan[] = []
  private spanMap: Map<string, ExecutionSpan> = new Map()

  constructor(runId: string) {
    this.timeline = {
      runId,
      startTime: Date.now(),
      spans: []
    }
  }

  /**
   * Start a new span
   */
  startSpan(id: string, name: string, metadata?: Record<string, unknown>): ExecutionSpan {
    // Guard against duplicate span IDs
    if (this.spanMap.has(id)) {
      throw new Error(`Span with ID '${id}' already exists`)
    }

    const parentId = this.spanStack[this.spanStack.length - 1]?.id

    const span: ExecutionSpan = {
      id,
      name,
      startTime: Date.now(),
      status: 'active',
      parentId,
      metadata
    }

    this.spanStack.push(span)
    this.spanMap.set(id, span)
    this.timeline.spans.push(span)

    return span
  }

  /**
   * Complete a span
   * Removes span from stack regardless of order (e.g., parent ended before child)
   */
  endSpan(id: string, status: 'completed' | 'failed' = 'completed'): void {
    const span = this.spanMap.get(id)
    if (!span) return

    span.endTime = Date.now()
    span.duration = span.endTime - span.startTime
    span.status = status

    // Remove span from stack by finding its position
    const index = this.spanStack.findIndex(s => s.id === id)
    if (index !== -1) {
      this.spanStack.splice(index, 1)
    }
  }

  /**
   * Finish timeline
   */
  finish(): ExecutionTimeline {
    this.timeline.endTime = Date.now()
    return this.timeline
  }

  /**
   * Get timeline
   */
  getTimeline(): ExecutionTimeline {
    return { ...this.timeline }
  }

  /**
   * Get total duration
   */
  getTotalDuration(): number {
    if (!this.timeline.endTime) return Date.now() - this.timeline.startTime
    return this.timeline.endTime - this.timeline.startTime
  }

  /**
   * Get critical path (longest cumulative duration)
   * Critical path refers to the sequence with greatest total duration, not span count
   */
  getCriticalPath(): ExecutionSpan[] {
    const rootSpans = this.timeline.spans.filter(s => !s.parentId)
    let longestPath: ExecutionSpan[] = []
    let longestDuration = -1

    for (const span of rootSpans) {
      const path = this.getSpanPath(span)
      const duration = this.calculatePathDuration(path)
      if (duration >= longestDuration) {
        longestPath = path
        longestDuration = duration
      }
    }

    return longestPath
  }

  /**
   * Get span and its children recursively
   */
  private getSpanPath(span: ExecutionSpan): ExecutionSpan[] {
    const children = this.timeline.spans.filter(s => s.parentId === span.id)
    let longestChildPath: ExecutionSpan[] = []
    let longestDuration = 0

    for (const child of children) {
      const path = this.getSpanPath(child)
      const duration = this.calculatePathDuration(path)
      if (duration > longestDuration) {
        longestChildPath = path
        longestDuration = duration
      }
    }

    return [span, ...longestChildPath]
  }

  /**
   * Calculate cumulative duration of a path
   */
  private calculatePathDuration(path: ExecutionSpan[]): number {
    return path.reduce((sum, span) => sum + (span.duration ?? 0), 0)
  }
}
