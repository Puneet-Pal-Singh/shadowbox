/**
 * Integration tests for artifact store with execution engine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PlanExecutionEngine, InMemoryArtifactStore, FileArtifactStore, LocalMockAdapter } from '../../src/index.js'
import type { Plan } from '../../src/types/index.js'
import { promises as fs } from 'fs'
import { join } from 'path'

describe('Artifact Store Integration', () => {
  let plan: Plan
  let mockAdapter: LocalMockAdapter

  beforeEach(() => {
    mockAdapter = new LocalMockAdapter({
      responseContent: 'Task completed',
      inputTokens: 100,
      outputTokens: 50
    })

    plan = {
      id: 'artifact-test-plan',
      goal: 'test artifact storage',
      description: 'verify artifacts are persisted correctly',
      steps: [
        {
          id: 'step-1',
          type: 'analysis',
          title: 'Analyze Task',
          description: 'analyze the requirements',
          input: { prompt: 'analyze this' }
        },
        {
          id: 'step-2',
          type: 'code_change',
          title: 'Implement Solution',
          description: 'implement the solution',
          input: { prompt: 'implement this' }
        }
      ]
    }
  })

  describe('InMemoryArtifactStore with Engine', () => {
    it('saves execution state to artifact store', async () => {
      const artifactStore = new InMemoryArtifactStore()
      const engine = new PlanExecutionEngine({
        maxIterations: 10,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-inmem-1')

      // Verify state was persisted
      const loaded = await artifactStore.loadSnapshot('run-inmem-1')
      expect(loaded).toBeDefined()
      expect(loaded?.runId).toBe('run-inmem-1')
      expect(loaded?.planId).toBe(plan.id)
      expect(loaded?.status).toBe('completed')
    })

    it('preserves execution state details', async () => {
      const artifactStore = new InMemoryArtifactStore()
      const engine = new PlanExecutionEngine({
        maxIterations: 10,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-inmem-2')

      const loaded = await artifactStore.loadSnapshot('run-inmem-2')
      expect(loaded?.currentStepIndex).toBe(state.currentStepIndex)
      expect(loaded?.iterationCount).toBe(state.iterationCount)
      expect(loaded?.startTime).toBe(state.startTime)
    })

    it('tracks multiple runs independently', async () => {
      const artifactStore = new InMemoryArtifactStore()
      const engine = new PlanExecutionEngine({
        maxIterations: 10,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      await engine.execute(plan, '/repo', 'run-inmem-3')
      await engine.execute(plan, '/repo', 'run-inmem-4')

      const run3 = await artifactStore.loadSnapshot('run-inmem-3')
      const run4 = await artifactStore.loadSnapshot('run-inmem-4')

      expect(run3?.runId).toBe('run-inmem-3')
      expect(run4?.runId).toBe('run-inmem-4')
    })
  })

  describe('FileArtifactStore with Engine', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = join(process.cwd(), '.test-file-artifacts')
    })

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })

    it('persists execution state to filesystem', async () => {
      const artifactStore = new FileArtifactStore({ basePath: tempDir })
      const engine = new PlanExecutionEngine({
        maxIterations: 10,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-file-1')

      // Verify state was persisted to file
      const loaded = await artifactStore.loadSnapshot('run-file-1')
      expect(loaded).toBeDefined()
      expect(loaded?.runId).toBe('run-file-1')
      expect(loaded?.planId).toBe(plan.id)
    })

    it('creates proper directory structure', async () => {
      const artifactStore = new FileArtifactStore({ basePath: tempDir })
      const engine = new PlanExecutionEngine({
        maxIterations: 10,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      await engine.execute(plan, '/repo', 'run-file-2')

      // Verify directory structure exists
      const runDir = join(tempDir, 'runs', 'run-file-2')
      const snapshotFile = join(runDir, 'snapshot.json')

      const content = await fs.readFile(snapshotFile, 'utf-8')
      const parsed = JSON.parse(content)

      expect(parsed.runId).toBe('run-file-2')
    })

    it('handles multiple concurrent runs', async () => {
      const artifactStore = new FileArtifactStore({ basePath: tempDir })
      const engine = new PlanExecutionEngine({
        maxIterations: 10,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      // Execute multiple runs
      await Promise.all([
        engine.execute(plan, '/repo', 'run-file-3'),
        engine.execute(plan, '/repo', 'run-file-4'),
        engine.execute(plan, '/repo', 'run-file-5')
      ])

      // Verify all snapshots exist independently
      const run3 = await artifactStore.loadSnapshot('run-file-3')
      const run4 = await artifactStore.loadSnapshot('run-file-4')
      const run5 = await artifactStore.loadSnapshot('run-file-5')

      expect(run3?.runId).toBe('run-file-3')
      expect(run4?.runId).toBe('run-file-4')
      expect(run5?.runId).toBe('run-file-5')
    })

    it('deletes run artifacts correctly', async () => {
      const artifactStore = new FileArtifactStore({ basePath: tempDir })
      const engine = new PlanExecutionEngine({
        maxIterations: 10,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      await engine.execute(plan, '/repo', 'run-file-6')
      const before = await artifactStore.loadSnapshot('run-file-6')
      expect(before).toBeDefined()

      await artifactStore.deleteRun('run-file-6')
      const after = await artifactStore.loadSnapshot('run-file-6')
      expect(after).toBeNull()
    })
  })

  describe('Artifact Store Consistency', () => {
    it('ensures InMemory and File store have same interface', async () => {
      const inMemory = new InMemoryArtifactStore()
      const fileStore = new FileArtifactStore({ basePath: '/tmp/test' })

      // Both should have same methods
      expect(typeof inMemory.saveSnapshot).toBe('function')
      expect(typeof fileStore.saveSnapshot).toBe('function')

      expect(typeof inMemory.loadSnapshot).toBe('function')
      expect(typeof fileStore.loadSnapshot).toBe('function')

      expect(typeof inMemory.saveArtifact).toBe('function')
      expect(typeof fileStore.saveArtifact).toBe('function')

      expect(typeof inMemory.getArtifact).toBe('function')
      expect(typeof fileStore.getArtifact).toBe('function')

      expect(typeof inMemory.listArtifacts).toBe('function')
      expect(typeof fileStore.listArtifacts).toBe('function')

      expect(typeof inMemory.deleteRun).toBe('function')
      expect(typeof fileStore.deleteRun).toBe('function')
    })
  })
})
