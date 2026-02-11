/**
 * Tool registry and executor tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Tool, ToolRegistry, ToolExecutor } from '../../src/tools/index.js'
import { createExecutionContext, initializeExecutionState, createToolResult } from '../../src/types/index.js'
import type { ExecutionContext, ToolResult } from '../../src/types/index.js'
import type { Plan } from '../../src/types/index.js'

/**
 * Mock tool for testing
 */
class MockTool extends Tool {
  constructor(
    private name: string = 'mock_tool',
    private shouldFail: boolean = false
  ) {
    super()
  }

  getName(): string {
    return this.name
  }

  getDescription(): string {
    return 'A mock tool for testing'
  }

  getInputSchema(): Record<string, unknown> {
    return {
      input: { type: 'string' }
    }
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (this.shouldFail) {
      return createToolResult(
        this.name,
        args,
        'error',
        undefined,
        'Mock tool failed'
      )
    }

    return createToolResult(
      this.name,
      args,
      'success',
      { result: 'mock result' }
    )
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  it('registers a tool', () => {
    const tool = new MockTool('test_tool')
    registry.register(tool)

    expect(registry.hasTool('test_tool')).toBe(true)
    expect(registry.getTool('test_tool')).toBe(tool)
  })

  it('registers multiple tools', () => {
    const tool1 = new MockTool('tool1')
    const tool2 = new MockTool('tool2')

    registry.registerMultiple([tool1, tool2])

    expect(registry.getToolCount()).toBe(2)
    expect(registry.getToolNames()).toContain('tool1')
    expect(registry.getToolNames()).toContain('tool2')
  })

  it('gets available tool definitions', () => {
    const tool = new MockTool('test_tool')
    registry.register(tool)

    const definitions = registry.getAvailableTools()

    expect(definitions).toHaveLength(1)
    expect(definitions[0].name).toBe('test_tool')
    expect(definitions[0].description).toBeTruthy()
  })

  it('returns undefined for unknown tool', () => {
    expect(registry.getTool('unknown')).toBeUndefined()
  })

  it('clears all tools', () => {
    registry.register(new MockTool('tool1'))
    registry.register(new MockTool('tool2'))

    expect(registry.getToolCount()).toBe(2)

    registry.clear()

    expect(registry.getToolCount()).toBe(0)
  })
})

describe('ToolExecutor', () => {
  let executor: ToolExecutor
  let plan: Plan
  let context: ExecutionContext

  beforeEach(() => {
    executor = new ToolExecutor({
      defaultTimeoutMs: 5000,
      maxRetries: 1
    })

    plan = {
      id: 'plan-1',
      goal: 'test',
      description: 'test plan',
      steps: [
        {
          id: 'step-1',
          type: 'analysis',
          title: 'Analyze',
          description: 'analyze',
          input: {}
        }
      ]
    }

    context = createExecutionContext('run-1', 'task-1', '/repo', plan.steps[0])
  })

  it('executes registered tool', async () => {
    const tool = new MockTool('test_tool')
    executor.registerTool(tool)

    const result = await executor.execute('test_tool', { input: 'test' }, context)

    expect(result.status).toBe('success')
    expect(result.output).toEqual({ result: 'mock result' })
  })

  it('returns error for unknown tool', async () => {
    const result = await executor.execute('unknown_tool', {}, context)

    expect(result.status).toBe('error')
    expect(result.error).toContain('not found')
  })

  it('handles tool execution errors', async () => {
    const tool = new MockTool('failing_tool', true)
    executor.registerTool(tool)

    const result = await executor.execute('failing_tool', {}, context)

    expect(result.status).toBe('error')
    expect(result.error).toContain('Mock tool failed')
  })

  it('respects execution timeout', async () => {
    class SlowTool extends Tool {
      getName(): string {
        return 'slow'
      }
      getDescription(): string {
        return 'Slow tool'
      }
      getInputSchema(): Record<string, unknown> {
        return {}
      }
      async execute(): Promise<ToolResult> {
        await new Promise(resolve => setTimeout(resolve, 10000))
        return createToolResult('slow', {}, 'success')
      }
    }

    executor.registerTool(new SlowTool())

    const result = await executor.execute('slow', {}, context, 100)

    expect(result.status).toBe('error')
    expect(result.error).toContain('timeout')
  })

  it('gets available tools', () => {
    const tool1 = new MockTool('tool1')
    const tool2 = new MockTool('tool2')

    executor.registerTools([tool1, tool2])

    const available = executor.getAvailableTools()

    expect(available).toHaveLength(2)
    expect(available.map(t => t.name)).toContain('tool1')
  })
})
