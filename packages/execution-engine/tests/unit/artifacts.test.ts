/**
 * Artifact store tests (InMemory and File implementations)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InMemoryArtifactStore, FileArtifactStore } from '../../src/artifacts/index.js'
import { initializeExecutionState } from '../../src/types/index.js'
import { createArtifact } from '../../src/types/artifacts.js'
import { promises as fs } from 'fs'
import { join } from 'path'

describe('InMemoryArtifactStore', () => {
  let store: InMemoryArtifactStore

  beforeEach(() => {
    store = new InMemoryArtifactStore()
  })

  it('saves and loads execution state snapshots', async () => {
    const state = initializeExecutionState('run-1', 'plan-1')
    state.status = 'completed'
    state.iterationCount = 5

    await store.saveSnapshot(state)
    const loaded = await store.loadSnapshot('run-1')

    expect(loaded).toBeDefined()
    expect(loaded?.status).toBe('completed')
    expect(loaded?.iterationCount).toBe(5)
  })

  it('returns null for missing snapshots', async () => {
    const loaded = await store.loadSnapshot('nonexistent')
    expect(loaded).toBeNull()
  })

  it('saves and retrieves artifacts', async () => {
    const artifact = createArtifact('run-1', 'step-1', 'log', 'text', 'log content')

    await store.saveArtifact(artifact)
    const retrieved = await store.getArtifact('run-1', artifact.id)

    expect(retrieved).toBeDefined()
    expect(retrieved?.content).toBe('log content')
    expect(retrieved?.type).toBe('log')
  })

  it('returns null for missing artifacts', async () => {
    const retrieved = await store.getArtifact('run-1', 'nonexistent')
    expect(retrieved).toBeNull()
  })

  it('lists all artifacts for a run', async () => {
    const art1 = createArtifact('run-1', 'step-1', 'log', 'text', 'log1')
    const art2 = createArtifact('run-1', 'step-2', 'log', 'text', 'log2')
    const art3 = createArtifact('run-2', 'step-1', 'log', 'text', 'log3')

    await store.saveArtifact(art1)
    await store.saveArtifact(art2)
    await store.saveArtifact(art3)

    const artifacts = await store.listArtifacts('run-1')

    expect(artifacts).toHaveLength(2)
    expect(artifacts[0].content).toMatch(/log1|log2/)
  })

  it('returns empty array for missing run', async () => {
    const artifacts = await store.listArtifacts('nonexistent')
    expect(artifacts).toEqual([])
  })

  it('deletes all artifacts for a run', async () => {
    const art1 = createArtifact('run-1', 'step-1', 'log', 'text', 'log1')
    const art2 = createArtifact('run-2', 'step-1', 'log', 'text', 'log2')

    await store.saveArtifact(art1)
    await store.saveArtifact(art2)

    await store.deleteRun('run-1')

    const run1Artifacts = await store.listArtifacts('run-1')
    const run2Artifacts = await store.listArtifacts('run-2')

    expect(run1Artifacts).toEqual([])
    expect(run2Artifacts).toHaveLength(1)
  })

  it('deep clones data to prevent external mutations', async () => {
    const state = initializeExecutionState('run-1', 'plan-1')
    await store.saveSnapshot(state)

    const loaded = await store.loadSnapshot('run-1')
    if (loaded) {
      loaded.status = 'failed'
    }

    const reloaded = await store.loadSnapshot('run-1')
    expect(reloaded?.status).toBe('pending')
  })

  it('provides utility methods for testing', () => {
    expect(store.getRunCount()).toBe(0)

    store.clear()
    expect(store.getRunCount()).toBe(0)

    expect(store.getArtifactCount('run-1')).toBe(0)
  })
})

describe('FileArtifactStore', () => {
  let store: FileArtifactStore
  let tempDir: string

  beforeEach(async () => {
    tempDir = join(process.cwd(), '.test-artifacts')
    store = new FileArtifactStore({ basePath: tempDir })
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('saves and loads execution state snapshots', async () => {
    const state = initializeExecutionState('run-1', 'plan-1')
    state.status = 'completed'
    state.iterationCount = 5

    await store.saveSnapshot(state)
    const loaded = await store.loadSnapshot('run-1')

    expect(loaded).toBeDefined()
    expect(loaded?.status).toBe('completed')
    expect(loaded?.iterationCount).toBe(5)
  })

  it('returns null for missing snapshots', async () => {
    const loaded = await store.loadSnapshot('nonexistent')
    expect(loaded).toBeNull()
  })

  it('saves and retrieves artifacts from files', async () => {
    const artifact = createArtifact('run-1', 'step-1', 'log', 'text', 'log content')

    await store.saveArtifact(artifact)
    const retrieved = await store.getArtifact('run-1', artifact.id)

    expect(retrieved).toBeDefined()
    expect(retrieved?.content).toBe('log content')
  })

  it('returns null for missing artifacts', async () => {
    const retrieved = await store.getArtifact('run-1', 'nonexistent')
    expect(retrieved).toBeNull()
  })

  it('lists all artifacts for a run from filesystem', async () => {
    const art1 = createArtifact('run-1', 'step-1', 'log', 'text', 'log1')
    const art2 = createArtifact('run-1', 'step-2', 'log', 'text', 'log2')

    await store.saveArtifact(art1)
    await store.saveArtifact(art2)

    const artifacts = await store.listArtifacts('run-1')

    expect(artifacts).toHaveLength(2)
  })

  it('returns empty array for missing run directory', async () => {
    const artifacts = await store.listArtifacts('nonexistent')
    expect(artifacts).toEqual([])
  })

  it('deletes all artifacts for a run', async () => {
    const art1 = createArtifact('run-1', 'step-1', 'log', 'text', 'log1')
    const art2 = createArtifact('run-2', 'step-1', 'log', 'text', 'log2')

    await store.saveArtifact(art1)
    await store.saveArtifact(art2)

    await store.deleteRun('run-1')

    const run1Artifacts = await store.listArtifacts('run-1')
    const run2Artifacts = await store.listArtifacts('run-2')

    expect(run1Artifacts).toEqual([])
    expect(run2Artifacts).toHaveLength(1)
  })

  it('creates directory structure automatically', async () => {
    const artifact = createArtifact('run-1', 'step-1', 'log', 'text', 'content')
    await store.saveArtifact(artifact)

    const runDir = join(tempDir, 'runs', 'run-1', 'artifacts')
    const files = await fs.readdir(runDir)

    expect(files.length).toBeGreaterThan(0)
  })

  it('stores snapshots in snapshot.json', async () => {
    const state = initializeExecutionState('run-1', 'plan-1')
    await store.saveSnapshot(state)

    const snapshotPath = join(tempDir, 'runs', 'run-1', 'snapshot.json')
    const content = await fs.readFile(snapshotPath, 'utf-8')
    const loaded = JSON.parse(content)

    expect(loaded.runId).toBe('run-1')
  })

  it('respects autoCreate configuration', async () => {
    const noCreateStore = new FileArtifactStore({
      basePath: tempDir,
      autoCreate: false
    })

    const artifact = createArtifact('run-1', 'step-1', 'log', 'text', 'content')

    await expect(noCreateStore.saveArtifact(artifact)).rejects.toThrow()
  })

  it('returns base path', () => {
    expect(store.getBasePath()).toBe(tempDir)
  })
})
