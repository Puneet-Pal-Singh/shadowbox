# M1.3d Smoke Test Checklist

**Purpose**: Manual verification that M1.3d chat flow unbreak is working end-to-end

**Duration**: ~10 minutes

**Prerequisites**:
- All M1.3d PRs merged to main
- `.dev.vars` files created in `apps/secure-agent-api` and `apps/brain` with real API keys
- Dev servers running: web, brain, secure-agent-api
- Browser: http://localhost:5173

---

## ✅ Smoke Test 1: CORS Configuration

**Goal**: Verify chat history can be fetched without CORS blocks

### Steps:

1. **Start secure-api dev server**:
   ```bash
   pnpm --filter @shadowbox/secure-agent-api dev
   ```
   - Should listen on `http://localhost:8787`

2. **Test CORS from curl**:
   ```bash
   curl -i -H "Origin: http://localhost:5173" \
     http://localhost:8787/api/chat/history/test-run
   ```

3. **Verify response**:
   - [ ] HTTP 200 or 404 (endpoint exists test)
   - [ ] **Header present**: `Access-Control-Allow-Origin: http://localhost:5173`
   - [ ] **Header present**: `Access-Control-Allow-Credentials: true`

### Expected Result:
✅ CORS headers returned for localhost origin

---

## ✅ Smoke Test 2: LLM Provider Configuration

**Goal**: Verify provider env config is validated, not silently failing

### Steps:

1. **Check brain `.dev.vars`**:
   ```bash
   cat apps/brain/.dev.vars | grep -E "(LLM_PROVIDER|DEFAULT_MODEL|GROQ_API_KEY)"
   ```

2. **Should see**:
    ```ini
    LLM_PROVIDER=litellm
    DEFAULT_MODEL=llama-3.3-70b-versatile
    GROQ_API_KEY=xxx...
    ```

3. **Watch server logs on startup**:
   ```bash
   pnpm --filter @shadowbox/brain dev
   ```

4. **Look for**:
   - [ ] No `[ai/runtime] Provider validation failed` errors
   - [ ] See logs like: `[ai/runtime] Chat stream ready`

### Expected Result:
✅ Brain starts without provider config errors

---

## ✅ Smoke Test 3: Web Chat Initialization

**Goal**: Verify web app loads and chat UI is ready

### Steps:

1. **Start web dev server**:
   ```bash
   pnpm --filter @shadowbox/web dev
   ```
   - Should be at `http://localhost:5173`

2. **Open browser**:
   - [ ] Page loads (no 500 errors)
   - [ ] See "Shadowbox" branding

3. **Check console**:
   - [ ] No CORS errors (red text)
   - [ ] No 500 errors
   - [ ] Navigate to http://localhost:5173 in browser

### Expected Result:
✅ Web app loads without errors

---

## ✅ Smoke Test 4: Provider/Model Selection in Setup

**Goal**: Verify model dropdown works in AgentSetup

### Steps:

1. **In browser**, create a new session:
   - Click "New"
   - Select a GitHub repository
   - Should see AgentSetup form

2. **Look for model dropdown**:
   - [ ] See dropdown button in input area (left of text input)
   - [ ] Button shows model name (e.g., "Select", "llama-3.3-70b-versatile")

3. **Click dropdown**:
   - [ ] Dropdown opens
   - [ ] See provider options (OpenRouter, OpenAI)
   - [ ] See model list below provider

4. **Select a different model**:
   - [ ] Click dropdown
   - [ ] Select "OpenRouter" provider
   - [ ] Select a model (e.g., "Claude 3.5 Sonnet")
   - [ ] Dropdown closes
   - [ ] Button now shows selected model name

### Expected Result:
✅ Model dropdown is functional in setup

---

## ✅ Smoke Test 5: Chat Message Send (Critical)

**Goal**: End-to-end test that chat actually works

### Steps:

1. **In browser, enter task**:
   - Type a simple task: `"Hello, what is 2 + 2?"`

2. **Click Start**:
   - [ ] Setup closes
   - [ ] Workspace loads
   - [ ] Chat area appears

3. **Verify model selection persisted**:
   - [ ] Model dropdown in chat shows same selection as setup
   - [ ] (Or default model if none selected)

4. **Send first message**:
   - [ ] See input field ready
   - [ ] Model dropdown visible (left of input)
   - [ ] Click input field
   - [ ] Type: `"What is 2+2?"`
   - [ ] Press Enter or click Send button

5. **Watch for response**:
   - [ ] "Thinking..." indicator appears
   - [ ] **No CORS errors in console**
   - [ ] **No 500 errors in console**
   - [ ] Response text appears (may be slow, up to 10 seconds)

6. **Verify response**:
   - [ ] Response contains answer (should be "4" or similar)
   - [ ] Message appears in chat history
   - [ ] Can send follow-up message

### Expected Result:
✅ Chat send/receive works end-to-end

---

## ✅ Smoke Test 6: Provider/Model Persistence in Chat

**Goal**: Verify selected model persists through chat

### Steps:

1. **In active chat**, click model dropdown:
   - [ ] Shows currently selected provider/model
   - [ ] Can change to different model
   - [ ] (Optional: send message to verify new model works)

2. **Refresh page** (hard refresh: Cmd+Shift+R or Ctrl+Shift+R):
   - [ ] Chat history loads
   - [ ] Model dropdown shows same selection
   - [ ] Can send new messages

3. **Create another session**:
   - Click "New"
   - Create new session
   - In AgentSetup, **do NOT select model** (use default)

4. **Start chat**:
   - [ ] Model dropdown shows default model
   - [ ] Different from previous session's selection
   - [ ] Session isolation is maintained

### Expected Result:
✅ Model selection is per-session and persists

---

## ✅ Smoke Test 7: Provider API Keys (Optional Advanced)

**Goal**: Verify provider credentials work (if configured)

### Steps:

1. **If you have an OpenAI API key**:
   - In chat, click model dropdown
   - Change provider to "OpenAI"
   - Select a model (e.g., "GPT-4")
   - Send a message

2. **Watch console**:
   - [ ] No "provider disconnected" errors
   - [ ] Message completes using OpenAI model
   - [ ] Usage costs (if logged) show correct provider

### Expected Result:
✅ Provider override works with API keys

---

## Summary

| Test | Status | Notes |
|------|--------|-------|
| CORS Headers | ✅/❌ | `Access-Control-Allow-Origin` present |
| Provider Config | ✅/❌ | No validation errors on startup |
| Web Load | ✅/❌ | No console errors |
| Setup Dropdown | ✅/❌ | Dropdown appears and works |
| Chat Send | ✅/❌ | Message sends and receives response |
| Model Persistence | ✅/❌ | Selection persists and per-session |
| Provider API Keys | ✅/⊘ | Works with connected provider (optional) |

---

## Troubleshooting

### "CORS error in console"
- **Fix**: Ensure `CORS_ALLOW_DEV_ORIGINS=true` in `apps/secure-agent-api/.dev.vars`
- **Fix**: Restart secure-agent-api dev server
- **Check**: `curl -H "Origin: http://localhost:5173"` returns CORS headers

### "500 error on /chat"
- **Fix**: Check brain logs for provider validation error
- **Fix**: Ensure `LLM_PROVIDER` and `DEFAULT_MODEL` are set in `apps/brain/.dev.vars`
- **Fix**: Ensure API key (`GROQ_API_KEY` or `OPENAI_API_KEY`) is set
- **Check**: Run `pnpm --filter @shadowbox/brain test -- ProviderValidationService.test.ts`

### "Model dropdown not showing"
- **Fix**: Ensure ChatInputBar has `sessionId` prop
- **Fix**: Ensure ModelDropdown component exists
- **Check**: Browser console for JavaScript errors

### "Model selection not persisting"
- **Fix**: Ensure AgentSetup has `sessionId` prop from App.tsx
- **Fix**: Ensure real `activeSessionId` is passed (not random)
- **Check**: localStorage contains `shadowbox_model:${sessionId}` entries

### "Message doesn't send"
- **Fix**: Ensure model dropdown shows valid selection
- **Fix**: Check browser network tab for `/chat` request
- **Fix**: Check brain logs for errors
- **Fix**: Try default model (LLM_PROVIDER + DEFAULT_MODEL)

---

## Success Criteria

**M1.3d is ready for merge when**:

- [x] All 7 smoke tests pass
- [x] No CORS errors in browser console
- [x] No 500 errors on `/chat`
- [x] Chat messages send and receive responses
- [x] Model selection works and persists per-session
- [x] Gate script passes: `./scripts/gate-m1.3d.sh`

---

**Smoke Test Date**: ________  
**Tester**: ________  
**Result**: ✅ PASS / ❌ FAIL

