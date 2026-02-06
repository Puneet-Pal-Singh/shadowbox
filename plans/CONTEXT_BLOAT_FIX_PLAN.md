# 🛠️ Task: Context Bloat & Loop Prevention

## 🎯 Goal
Stop the agent from "dumping" old code and stuck loops. Fix the `onFinish` crash and implement aggressive context pruning.

## 🏗️ 1. Fix the `onFinish` Persistence Crash (`apps/brain`)
**Problem**: `finalResult.responseMessages` is not the correct way to access messages in Vercel AI SDK v4 inside `onFinish`. 
**Fix**: Use `result.fullMessages` to get the complete history to save to the Durable Object.

## 🏗️ 2. Implement the "Goldfish" Pruner (`apps/brain`)
**Problem**: The AI sees every previous `list_files` and `read_file` output. 
**Logic**: 
- Before sending messages to the LLM, scan the history.
- If a `tool-result` for `list_files` is not from the **immediate last turn**, replace its content with `[Previous file list hidden]`.
- This forces the AI to focus on the *now*, not the *then*.

## 🏗️ 3. Tighten the Tool Output (`apps/secure-agent-api`)
**Problem**: The sandbox is returning too much data.
**Logic**:
- In `FileSystemPlugin.ts`, if `list_files` returns more than 20 files, return only the first 20 and a count.
- AI should only see a "Map," not a "Dump."

## 🏗️ 4. System Prompt Guardrail
**Logic**: Update `ChatController.ts` system prompt to include:
"CRITICAL: If you have already verified a file exists or a command has run successfully, DO NOT run it again. Move directly to answering the user."