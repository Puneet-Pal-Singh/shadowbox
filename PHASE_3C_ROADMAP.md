# 🚀 Phase 3C - DAG + Parallelism Implementation

**Branch:** `feat/phase3c-dag-parallelism`  
**Status:** In Progress  
**Base:** Phase 3B (Explicit Planning) - COMPLETE

---

## 📋 Overview

Phase 3C builds on Phase 3B by adding:

1. **Directed Acyclic Graph (DAG) Validation** - Detect cycles in task dependencies
2. **Parallel Execution** - Run independent tasks concurrently (with concurrency limits)
3. **Retry Logic** - Exponential backoff for failed tasks
4. **Resume Capability** - Continue runs after interruption

---

## 🎯 Implementation Plan

### 1. DependencyResolver - Cycle Detection

**File:** `apps/brain/src/core/orchestration/DependencyResolver.ts`

- [ ] Create interface `IDependencyResolver`
- [ ] Implement cycle detection using DFS
- [ ] Validate DAG structure on task creation
- [ ] Reject plans with circular dependencies
- [ ] Unit tests: cycle detection, valid DAGs, edge cases

**Key Methods:**
- `validateDAG(tasks: Task[]): ValidationResult`
- `detectCycles(tasks: Task[]): CycleError | null`
- `topologicalSort(tasks: Task[]): Task[]`
- `areMet(dependencies: string[], runId: string): Promise<boolean>`

---

### 2. TaskScheduler Enhancement - Parallelism

**File:** `apps/brain/src/core/orchestration/TaskScheduler.ts`

- [ ] Update `execute(runId)` to support parallel execution
- [ ] Implement concurrency limit configuration
- [ ] Change sequential loop to `Promise.all` with limiting
- [ ] Handle partial failures gracefully
- [ ] Unit tests: parallel execution, concurrency limits, deadlock scenarios

**Changes:**
- Replace `for` loop with `Promise.all` wrapper
- Add `concurrencyLimit` config (default: 3)
- Track in-flight tasks
- Wait for batch completion before next round

**Key Methods:**
- `findReadyTasks(runId): Task[]` - Returns ALL ready tasks
- `executeBatch(tasks: Task[]): Promise<TaskResult[]>` - NEW
- `execute(runId)` - Updated to use batches

---

### 3. Retry Logic

**File:** `apps/brain/src/core/orchestration/RetryPolicy.ts` (NEW)

- [ ] Create `RetryPolicy` interface
- [ ] Implement exponential backoff (2^attempt * baseDelay)
- [ ] Configurable max retries (default: 3)
- [ ] Configurable base delay (default: 1s)
- [ ] Unit tests: backoff calculation, retry limits

**Key Methods:**
- `shouldRetry(task: Task, attempt: number): boolean`
- `getBackoffDelay(attempt: number): number`

**Integration:**
- Call `retryPolicy.shouldRetry()` in `TaskScheduler.handleFailure()`
- Delay before retry using `setTimeout`

---

### 4. Run Resume Capability

**File:** `apps/brain/src/core/orchestration/RunRecovery.ts` (NEW)

- [ ] Create `RunRecovery` service
- [ ] Implement state reconstruction on restart
- [ ] Resume from last incomplete task
- [ ] Unit tests: recovery scenarios, state consistency

**Key Methods:**
- `resumeRun(runId: string): Promise<Run>`
- `reconstructState(run: Run): Promise<void>`
- `findLastReadyTask(runId: string): Promise<Task | null>`

---

## 📊 Testing Strategy

### Unit Tests
- `DependencyResolver.test.ts` - Cycle detection, topological sort
- `TaskScheduler.test.ts` - Parallel execution, batching
- `RetryPolicy.test.ts` - Backoff calculations
- `RunRecovery.test.ts` - State reconstruction

### Integration Tests
- Parallel task execution with dependencies
- Failed task cascade with retries
- Run resumption after simulated crash

---

## ✅ Acceptance Criteria

1. **DAG Validation**
   - Cycles are detected and rejected
   - Valid DAGs pass validation
   - Error messages are clear

2. **Parallel Execution**
   - Independent tasks run concurrently
   - Concurrency limit is respected
   - No race conditions

3. **Retry Logic**
   - Failed tasks retry with backoff
   - Retries respect max limit
   - Exponential backoff is correct

4. **Resume Capability**
   - Runs survive server restart
   - State reconstructs correctly
   - Execution continues from last point

---

## 📝 Code Review Checklist

Per AGENTS.md Section 11:

- [ ] No `any` types used
- [ ] All functions < 50 lines
- [ ] Dependencies injected (no hardcoded services)
- [ ] Zod schemas for configuration
- [ ] Tests co-located with source
- [ ] Proper error handling
- [ ] Logging with domain prefixes
- [ ] No magic numbers (constants extracted)

---

## 🔄 Git Workflow

1. **Create feature branch** ✅ `feat/phase3c-dag-parallelism`
2. **Implement features** (this phase)
3. **Run tests** - `npm test`
4. **Type check** - `npm run check-types`
5. **Create PR** - Link to phase 3 task
6. **Code review** - Follow AGENTS.md
7. **Merge to main** - Squash if needed

---

## 📈 Progress Tracking

- [ ] DependencyResolver created and tested
- [ ] TaskScheduler parallelization implemented
- [ ] RetryPolicy created and integrated
- [ ] RunRecovery service implemented
- [ ] All type checks passing
- [ ] All tests passing (70%+ coverage)
- [ ] Code review feedback addressed
- [ ] PR ready for merge

---

**Created:** 2026-02-13  
**Phase 3B Reference:** Merge PR #29
