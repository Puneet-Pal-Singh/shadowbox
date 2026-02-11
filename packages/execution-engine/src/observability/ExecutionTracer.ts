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
   * Complete a span (pop from stack)
   */
  endSpan(id: string, status: 'completed' | 'failed' = 'completed'): void {
    const span = this.spanMap.get(id)
    if (!span) return

    span.endTime = Date.now()
    span.duration = span.endTime - span.startTime
    span.status = status

    // Pop from stack if it's the current span
    if (this.spanStack[this.spanStack.length - 1]?.id === id) {
      this.spanStack.pop()
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
   * Get critical path (longest span sequence)
   */
  getCriticalPath(): ExecutionSpan[] {
    const rootSpans = this.timeline.spans.filter(s => !s.parentId)
    let longestPath: ExecutionSpan[] = []

    for (const span of rootSpans) {
      const path = this.getSpanPath(span)
      if (path.length > longestPath.length) {
        longestPath = path
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

    for (const child of children) {
      const path = this.getSpanPath(child)
      if (path.length > longestChildPath.length) {
        longestChildPath = path
      }
    }

    return [span, ...longestChildPath]
  }
}
