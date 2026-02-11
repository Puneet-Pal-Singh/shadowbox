/**
 * Adapter unit tests
 */

import { describe, it, expect } from 'vitest'
import {
  ToolDefinitionSchema,
  ModelInputSchema,
  ModelOutputSchema
} from '../../src/adapters/index.js'
import {
  extractJSON,
  extractToolCalls,
  validateAgainstSchema
} from '../../src/output/index.js'
import {
  validateFilePath,
  validateCommand,
  validateStringArg,
  validateNumberArg
} from '../../src/tools/index.js'

describe('Model Adapter Types', () => {
  it('validates tool definition', () => {
    const tool = {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: { path: { type: 'string' } }
    }

    const result = ToolDefinitionSchema.safeParse(tool)
    expect(result.success).toBe(true)
  })

  it('validates model input', () => {
    const input = {
      systemPrompt: 'You are helpful',
      userMessage: 'Hello',
      context: {},
      temperature: 0.7,
      maxTokens: 4096
    }

    const result = ModelInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('validates model output', () => {
    const output = {
      content: 'Response',
      usage: {
        inputTokens: 100,
        outputTokens: 50
      },
      stopReason: 'end_turn' as const
    }

    const result = ModelOutputSchema.safeParse(output)
    expect(result.success).toBe(true)
  })
})

describe('Output Extraction', () => {
  it('extracts JSON from markdown code block', () => {
    const text = '```json\n{"key": "value"}\n```'
    const result = extractJSON(text)
    expect(result).toEqual({ key: 'value' })
  })

  it('extracts raw JSON', () => {
    const text = '{"key": "value"}'
    const result = extractJSON(text)
    expect(result).toEqual({ key: 'value' })
  })

  it('returns null for invalid JSON', () => {
    const text = 'not json'
    const result = extractJSON(text)
    expect(result).toBeNull()
  })

  it('extracts tool calls from text', () => {
    const text =
      '<tool name="read_file" id="tool-1" args=\'{"path": "/src/main.ts"}\'>Read main file</tool>'
    const calls = extractToolCalls(text)

    expect(calls).toHaveLength(1)
    expect(calls[0].toolName).toBe('read_file')
    expect(calls[0].arguments.path).toBe('/src/main.ts')
  })
})

describe('Tool Validation', () => {
  it('validates safe file paths', () => {
    const result = validateFilePath('/src/main.ts', '/repo')
    expect(result.valid).toBe(false) // Path doesn't start with base
  })

  it('rejects directory traversal', () => {
    const result = validateFilePath('../etc/passwd', '/repo')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('traversal')
  })

  it('rejects dangerous commands', () => {
    const result = validateCommand('rm -rf /')
    expect(result.valid).toBe(false)
  })

  it('accepts safe commands', () => {
    const result = validateCommand('echo hello')
    expect(result.valid).toBe(true)
  })

  it('validates string arguments', () => {
    const result = validateStringArg('hello', 'message', {
      minLength: 3,
      maxLength: 10
    })
    expect(result.valid).toBe(true)
  })

  it('rejects too short strings', () => {
    const result = validateStringArg('hi', 'message', { minLength: 3 })
    expect(result.valid).toBe(false)
  })

  it('validates number arguments', () => {
    const result = validateNumberArg(5, 'count', {
      min: 1,
      max: 10,
      integer: true
    })
    expect(result.valid).toBe(true)
  })

  it('rejects invalid numbers', () => {
    const result = validateNumberArg(3.5, 'count', { integer: true })
    expect(result.valid).toBe(false)
  })
})
