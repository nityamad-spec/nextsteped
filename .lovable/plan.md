

## Plan: Client-Side Rate Limiting & Retry with Backoff for AI Chat

### Problem
Students can spam messages rapidly, and 429 (rate limit) errors from the AI gateway are shown as errors with no automatic recovery.

### Changes

**1. `src/pages/student/AIChat.tsx` — Rate limiting**
- Track `lastSendTime` via `useRef<number>(0)`
- At the top of `sendMessage`, enforce a 3-second minimum gap between sends — if too soon, show a toast ("Please wait a moment") and return early
- This prevents rapid-fire requests from doubling up classify + chat calls

**2. `src/pages/student/AIChat.tsx` — Retry with exponential backoff on 429**
- Wrap the `fetch(CHAT_URL, ...)` call in a retry loop (max 3 attempts)
- On 429 response: wait 2s → 4s → 8s (exponential), then retry
- Show a subtle toast on retry ("Rate limited, retrying…") so the student knows what's happening
- On final failure after retries, show the existing error toast
- Apply the same retry logic to the `classify-question` fetch (simpler: just skip classification on 429 and proceed with the chat call)

**3. Disable input during cooldown**
- While the 3-second cooldown is active after a send, keep the send button disabled (reuse `isStreaming` or add a brief `isCooldown` state)

### Files Modified
- `src/pages/student/AIChat.tsx` — add rate limiting ref, retry wrapper, cooldown state

