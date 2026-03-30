

## Plan: Richer Chat Message UI for Study Mode

### Current State
Messages are plain rounded boxes — blue for user, gray (`bg-muted`) for assistant. No avatars, timestamps, or visual hierarchy beyond color.

### Changes — `src/pages/student/AIChat.tsx`

**1. Add avatars to messages**
- User messages: colored circle with user initial (from auth context)
- Assistant messages: bot icon (Sparkles or Bot from lucide-react) in a branded circle

**2. Improved color scheme**
- User bubble: keep `bg-primary text-primary-foreground` but add subtle shadow
- Assistant bubble: white/card background with a left accent border in primary color (`border-l-4 border-primary/30 bg-card shadow-sm`)
- This gives visual distinction without the flat gray look

**3. Add timestamps**
- Small muted timestamp below each bubble showing relative time (e.g. "2 min ago" or HH:MM)

**4. Typing indicator upgrade**
- Animated bouncing dots instead of just a spinner with "Thinking..."

**5. Message layout structure**
```text
┌─────────────────────────────────────────┐
│  [Bot Avatar]  ┌─────────────────────┐  │
│                │ border-l-4 primary  │  │
│                │ Markdown content    │  │
│                │ 2:34 PM             │  │
│                └─────────────────────┘  │
│                                         │
│                ┌─────────────────────┐  │
│                │  bg-primary bubble  │  │  [User Avatar]
│                │  User text          │  │
│                │  2:35 PM            │  │
│                └─────────────────────┘  │
└─────────────────────────────────────────┘
```

### Implementation Details

Update `renderMessage` function to:
- Wrap in a flex row with avatar + bubble
- Assistant: `<div className="flex items-start gap-3">` with avatar on left
- User: `<div className="flex items-start gap-3 flex-row-reverse">` with avatar on right
- Add timestamp `<span>` below the bubble content
- Apply richer styling: `bg-card shadow-sm border border-border/50 border-l-4 border-l-primary/40` for assistant, `bg-primary shadow-sm` for user

Also update the streaming/loading indicator to match the new layout with avatar.

### Files Modified
- `src/pages/student/AIChat.tsx` — enhanced `renderMessage`, updated loading indicator

