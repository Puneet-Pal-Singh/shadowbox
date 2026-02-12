// apps/brain/src/core/run/index.ts
// Phase 3A: Run module barrel exports

export { Run, InvalidStateTransitionError } from "./Run";
export {
  RunRepository,
  RunNotFoundError,
  type IRunRepository,
} from "./RunRepository";
export {
  RunStateMachine,
  validateStateTransition,
  StateMachineError,
  type StateTransition,
} from "./RunStateMachine";
