import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { Bot, ChevronDown, Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";

export interface TerminalCodeContext {
  language: string;
  code: string;
  output: string;
  concepts: string[];
}

interface PanelMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface TerminalAssistantPanelProps {
  courseId: string;
  /** Snapshot getter — called right before each send so context is current. */
  getCodeContext: () => TerminalCodeContext;
  /** Existing terminal-help session to resume; null/undefined starts fresh. */
  resumeSessionId?: string | null;
  /** Unit label used when titling a new session (e.g. "Unit 4"). */
  unitLabel?: string | null;
}

/**
 * Socratic coding assistant shown inside the freeform practice terminal.
 * Persists the conversation to chat_sessions/chat_messages (mode='terminal')
 * so it appears under "Terminal help" in the chat history sidebar.
 */
export default function TerminalAssistantPanel({
  courseId,
  getCodeContext,
  resumeSessionId,
  unitLabel,
}: TerminalAssistantPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(resumeSessionId ?? null);
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(!!resumeSessionId);
  const [sessions, setSessions] = useState<{ id: string; title: string; updated_at: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Tracks which session's transcript is already loaded so a session we just
  // created on first send isn't re-fetched (which could drop a pending reply).
  const loadedSessionRef = useRef<string | null>(null);

  // Load the transcript whenever the active session changes — on resume from
  // the sidebar or when switching conversations from the header dropdown.
  useEffect(() => {
    if (!sessionId) {
      setLoadingHistory(false);
      return;
    }
    if (loadedSessionRef.current === sessionId) return;
    const sid = sessionId;
    let cancelled = false;
    setLoadingHistory(true);
    (async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("session_id", sid)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("[TerminalAssistant] history load failed", error);
        toast.error("Couldn't load the saved conversation");
      } else {
        setMessages(
          (data ?? [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })),
        );
        loadedSessionRef.current = sid;
      }
      setLoadingHistory(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Saved terminal-help conversations for the header switcher. Re-runs when
  // sessionId changes so a newly created conversation appears in the list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: authData } = await supabase.auth.getSession();
      const uid = authData.session?.user?.id;
      if (!uid || cancelled) return;
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id, title, updated_at")
        .eq("user_id", uid)
        .eq("course_id", courseId)
        .eq("mode", "terminal")
        .order("updated_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      if (error) console.error("[TerminalAssistant] sessions load failed", error);
      else setSessions(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, sessionId]);

  const startNewConversation = () => {
    loadedSessionRef.current = null;
    setSessionId(null);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  };

  const switchConversation = (id: string) => {
    if (id === sessionId) return;
    setMessages([]);
    setSessionId(id);
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  const persistMessage = useCallback(
    async (sid: string, userId: string, role: "user" | "assistant", content: string) => {
      const { error } = await supabase
        .from("chat_messages")
        .insert({ session_id: sid, user_id: userId, role, content });
      if (error) console.error("[TerminalAssistant] message persist failed", error);
      await supabase
        .from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sid);
    },
    [],
  );

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const userId = sessionData.session?.user?.id;
    if (!token || !userId) {
      toast.error("Please sign in again to use the assistant");
      return;
    }

    // Lazily create the terminal-help session on first send.
    let sid = sessionId;
    if (!sid) {
      const title = `Terminal help${unitLabel ? ` — ${unitLabel}` : ""} — ${new Date().toLocaleDateString()}`;
      const { data: created, error } = await supabase
        .from("chat_sessions")
        .insert({ user_id: userId, mode: "terminal", title, course_id: courseId })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[TerminalAssistant] session create failed", error);
        toast.error("Couldn't start the assistant session");
        return;
      }
      sid = created.id;
      loadedSessionRef.current = sid;
      setSessionId(sid);
    }

    const userMsg: PanelMessage = { id: `u-${Date.now()}`, role: "user", content };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    void persistMessage(sid, userId, "user", content);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/terminal-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            courseId,
            codeContext: getCodeContext(),
          }),
        },
      );

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.reply) {
        toast.error(data?.error || "The assistant is unavailable right now");
        return;
      }

      const assistantMsg: PanelMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      void persistMessage(sid, userId, "assistant", data.reply);
    } catch (e) {
      console.error("[TerminalAssistant] send failed", e);
      toast.error("Network error — please try again");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, sessionId, messages, courseId, unitLabel, getCodeContext, persistMessage]);

  const activeTitle = sessionId
    ? sessions.find((s) => s.id === sessionId)?.title ?? "Saved conversation"
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-2 py-1.5 text-xs border-b bg-muted/40 flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 min-w-0 flex-1 rounded-md px-1.5 py-1 text-left hover:bg-muted/70 transition-colors"
              aria-label="Switch conversation"
            >
              <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-medium truncate uppercase tracking-wide">
                {activeTitle ?? "Coding assistant"}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onClick={startNewConversation} className="gap-2 text-sm">
              <Plus className="h-3.5 w-3.5" /> New conversation
            </DropdownMenuItem>
            {sessions.length > 0 && <DropdownMenuSeparator />}
            {sessions.length > 0 && (
              <DropdownMenuLabel className="text-xs">Saved conversations</DropdownMenuLabel>
            )}
            {sessions.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => switchConversation(s.id)}
                className="flex flex-col items-start gap-0.5"
              >
                <span className={`truncate w-full text-sm ${s.id === sessionId ? "font-semibold" : ""}`}>
                  {s.title}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(s.updated_at).toLocaleDateString()}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="tracking-normal text-[11px] text-muted-foreground/80 shrink-0">
          Hints only
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-3">
        {loadingHistory ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-2 py-4">
            <p className="font-medium text-foreground">Stuck? Ask for a hint.</p>
            <p>
              I can see your current code and output, and I'll help you reason through
              problems — but I won't write the solution for you.
            </p>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2">
                <Bot className="h-4 w-4 mt-1 shrink-0 text-primary" />
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ),
          )
        )}
        {sending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking of a hint…
          </div>
        )}
      </div>

      <div className="border-t p-2 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={2}
          placeholder="Ask for a hint about your code…"
          className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          aria-label="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
