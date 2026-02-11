/**
 * Model adapter integration tests
 */

import { describe, it, expect, vi } from 'vitest'
import { OpenAIAdapter, LocalMockAdapter } from '../../src/adapters/index.js'
import { buildSystemPrompt, buildUserMessage } from '../../src/adapters/index.js'
import { createExecutionContext, initializeExecutionState } from '../../src/types/index.js'
import type { Plan } from '../../src/types/index.js'

describe('LocalMockAdapter', () => {
  it('generates deterministic response', async () => {
    const adapter = new LocalMockAdapter({
      responseContent: 'Mock response',
      inputTokens: 100,
      outputTokens: 50
    })

    const output = await adapter.generate({
      systemPrompt: 'You are helpful',
      userMessage: 'Hello',
      context: {}
    })

    expect(output.content).toBe('Mock response')
    expect(output.usage.inputTokens).toBe(100)
    expect(output.usage.outputTokens).toBe(50)
    expect(output.stopReason).toBe('end_turn')
  })

  it('returns tool calls when configured', async () => {
    const adapter = new LocalMockAdapter({
      toolCalls: [
        {
          id: 'tool-1',
          toolName: 'read_file',
          arguments: { path: '/src/main.ts' }
        }
      ]
    })

    const output = await adapter.generate({
      systemPrompt: 'You are helpful',
      userMessage: 'Read file',
      context: {}
    })

    expect(output.toolCalls).toHaveLength(1)
    expect(output.toolCalls?.[0].toolName).toBe('read_file')
  })

  it('respects delay configuration', async () => {
    const adapter = new LocalMockAdapter({ delayMs: 100 })

    const start = Date.now()
    await adapter.generate({
      systemPrompt: 'test',
      userMessage: 'test',
      context: {}
    })
    const duration = Date.now() - start

    expect(duration).toBeGreaterThanOrEqual(100)
  })

  it('updates response for test sequences', async () => {
    const adapter = new LocalMockAdapter({
      responseContent: 'First response'
    })

    const first = await adapter.generate({
      systemPrompt: 'test',
      userMessage: 'test',
      context: {}
    })
    expect(first.content).toBe('First response')

    adapter.setNextResponse({ responseContent: 'Second response' })

    const second = await adapter.generate({
      systemPrompt: 'test',
      userMessage: 'test',
      context: {}
    })
    expect(second.content).toBe('Second response')
  })

  it('is always available', async () => {
    const adapter = new LocalMockAdapter()
    const available = await adapter.isAvailable()
    expect(available).toBe(true)
  })
})

describe('OpenAIAdapter', () => {
  it('requires API key', () => {
    expect(
      () =>
        new OpenAIAdapter({
          apiKey: ''
        })
    ).toThrow('OpenAI API key is required')
  })

  it('has correct name', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test-key' })
    expect(adapter.getName()).toContain('gpt-4')
  })

  it('allows custom model', () => {
    const adapter = new OpenAIAdapter({
      apiKey: 'test-key',
      model: 'gpt-3.5-turbo'
    })
    expect(adapter.getName()).toContain('gpt-3.5-turbo')
  })
})

describe('Helper Functions', () => {
  it('builds system prompt with context', () => {
    const plan: Plan = {
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

    const state = initializeExecutionState('run-1', 'plan-1')
    const context = createExecutionContext('run-1', 'task-1', '/repo', plan.steps[0])

    const prompt = buildSystemPrompt('Base prompt', context)

    expect(prompt).toContain('Base prompt')
    expect(prompt).toContain('run-1')
    expect(prompt).toContain('task-1')
    expect(prompt).toContain('/repo')
  })

  it('builds user message with step info', () => {
    const message = buildUserMessage('Do this', 'Step 1', 'Description')

    expect(message).toContain('Step 1')
    expect(message).toContain('Description')
    expect(message).toContain('Do this')
  })
})
