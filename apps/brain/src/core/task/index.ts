// apps/brain/src/core/task/index.ts
// Phase 3A: Task module barrel exports

export { Task, InvalidTaskStateTransitionError } from "./Task";
export {
  TaskRepository,
  TaskNotFoundError,
  type ITaskRepository,
} from "./TaskRepository";
export {
  TaskState,
  validateTaskStateTransition,
  TaskStateError,
  createStateSnapshot,
  type TaskStateSnapshot,
  type TaskStateTransition,
} from "./TaskState";
