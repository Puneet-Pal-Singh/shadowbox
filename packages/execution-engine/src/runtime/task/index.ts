// apps/brain/src/core/task/index.ts
// Phase 3A: Task module barrel exports

export { Task, InvalidTaskStateTransitionError } from "./Task.js";
export {
  TaskRepository,
  TaskNotFoundError,
  type ITaskRepository,
} from "./TaskRepository.js";
export {
  TaskState,
  validateTaskStateTransition,
  TaskStateError,
  createStateSnapshot,
  type TaskStateSnapshot,
  type TaskStateTransition,
} from "./TaskState.js";
