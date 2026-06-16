import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useChatSessions } from "@/hooks/useChatSessions";
import { ChatMessage } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Plus, History, MessageSquare, ChevronLeft, Loader2, Sparkles, User, ListChecks, BookOpen, Search, ClipboardList, Lightbulb, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const WELCOME = "Hi Professor! I'm your **Course Assistant**. I can help you refine your lesson plan, brainstorm exercises and case studies, review AI suggestions, or answer any course design questions. What would you like to work on?";

const SUGGESTED_PROMPTS: { icon: React.ComponentType<{ className?: string }>; label: string; prompt: string }[] = [
  {
    icon: ListChecks,
    label: "Suggest in-class exercises",
    prompt: "Suggest 3 in-class exercises for this week's concepts that work for a 50-minute session.",
  },
  {
    icon: BookOpen,
    label: "Brainstorm a case study",
    prompt: "Brainstorm a real-world case study I can use to teach this week's key concept. Include discussion questions.",
  },
  {
    icon: Search,
    label: "Research an article",
    prompt: "Find and summarize a recent article I can assign as pre-reading for this week's topic.",
  },
  {
    icon: ClipboardList,
    label: "Draft assessment questions",
    prompt: "Draft 5 multiple-choice questions and 2 short-answer questions covering this week's concepts.",
  },
  {
    icon: Lightbulb,
    label: "Explain a tough concept",
    prompt: "Give me 3 different ways to explain this week's hardest concept to a struggling student.",
  },
  {
    icon: MessageCircle,
    label: "Plan a class discussion",
    prompt: "Outline a 20-minute discussion prompt with follow-up questions for this week's topic.",
  },
];

const TeacherChat = () => {
  const { user } = useAuth();
  const courseId = useTeacherCourseId();

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSendTime = useRef<number>(0);

  const [courseContext, setCourseContext] = useState<{ courseName: string; objectives: string[]; concepts: string[] } | null>(null);

  const {
    sessions: chats,
    activeSession: activeChat,
    activeSessionId,
    setActiveSessionId,
    loading: sessionsLoading,
    createSession,
    addMessage,
    addMessageLocally,
    updateLastMessage,
    updateSessionTitle,
  } = useChatSessions("teacher", courseId);

  // Fetch course context
  useEffect(() => {
    if (!courseId) return;
    const fetchCtx = async () => {
      const { data: course } = await supabase.from("courses").select("name, objectives").eq("id", courseId).maybeSingle();
      const { data: concepts } = await supabase.from("concepts").select("concept_code").eq("course_id", courseId);
      if (course) {
        setCourseContext({
          courseName: course.name,
          objectives: (course.objectives as string[]) || [],
          concepts: (concepts || []).map(c => c.concept_code),
        });
      }
    };
    fetchCtx();
  }, [courseId]);

  // Auto-create first session
  useEffect(() => {
    if (!sessionsLoading && chats.length === 0 && user) {
      createSession("New conversation", WELCOME);
    }
  }, [sessionsLoading, chats.length, user]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, streamingMessage]);

  const handleNewChat = async () => {
    await createSession("New conversation", WELCOME);
    setShowHistory(false);
  };

  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const resp = await fetch(url, options);
      if (resp.status === 429 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        toast.info("Rate limited, retrying…", { duration: delay });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return resp;
    }
    return fetch(url, options);
  };

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const contentToSend = (overrideContent ?? input).trim();
    if (!contentToSend || !activeChat || isStreaming || isCooldown) return;

    const now = Date.now();
    if (now - lastSendTime.current < 3000) {
      toast.warning("Please wait a moment before sending another message");
      return;
    }
    lastSendTime.current = now;

    const userContent = contentToSend;
    setInput("");
    setIsStreaming(true);
    setIsCooldown(true);
    setTimeout(() => setIsCooldown(false), 3000);

    await addMessage(activeChat.id, "user", userContent);

    const userMsgCount = activeChat.messages.filter(m => m.role === "user").length;
    if (userMsgCount === 0) {
      const shortTitle = userContent.slice(0, 50) + (userContent.length > 50 ? "..." : "");
      updateSessionTitle(activeChat.id, shortTitle);
    }

    const historyMessages = [...activeChat.messages, { id: "temp", role: "user" as const, content: userContent, timestamp: Date.now() }]
      .slice(-20)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    const assistantMsgId = `streaming-${Date.now()}`;

    try {
      const resp = await fetchWithRetry(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: historyMessages,
          mode: "teacher",
          courseId: courseId || undefined,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: "AI service error" }));
        toast.error(errorData.error || "Failed to get AI response");
        setIsStreaming(false);
        return;
      }

      if (!resp.body) {
        toast.error("No response from AI");
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setStreamingMessage({ id: assistantMsgId, role: "assistant", content: assistantContent, timestamp: Date.now() });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) assistantContent += content;
          } catch {}
        }
      }

      setStreamingMessage(null);
      if (assistantContent) {
        await addMessage(activeChat.id, "assistant", assistantContent);
      }
    } catch (e) {
      console.error("Chat error:", e);
      toast.error("Failed to send message");
      setStreamingMessage(null);
    } finally {
      setIsStreaming(false);
    }
  }, [input, activeChat, isStreaming, isCooldown, addMessage, updateSessionTitle, courseId, user]);

  const renderMessage = (msg: ChatMessage) => (
    <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      {msg.role === "assistant" && (
        <Avatar className="h-8 w-8 shrink-0 mt-1">
          <AvatarFallback className="bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></AvatarFallback>
        </Avatar>
      )}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
        msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
      }`}>
        {msg.role === "assistant" ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        ) : msg.content}
      </div>
      {msg.role === "user" && (
        <Avatar className="h-8 w-8 shrink-0 mt-1">
          <AvatarFallback className="bg-secondary"><User className="h-4 w-4" /></AvatarFallback>
        </Avatar>
      )}
    </div>
  );

  const displayMessages = activeChat?.messages || [];
  const allMessages = streamingMessage
    ? [...displayMessages, streamingMessage]
    : displayMessages;

  return (
    <div className="flex h-[calc(100vh-0px)]">
      {/* History sidebar */}
      {showHistory && (
        <div className="w-72 border-r bg-card flex flex-col">
          <div className="flex items-center justify-between border-b p-3">
            <h3 className="font-medium text-sm">Chat History</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-2">
            <Button variant="outline" size="sm" className="w-full" onClick={handleNewChat}>
              <Plus className="h-4 w-4 mr-2" /> New Chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {chats.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setActiveSessionId(c.id); setShowHistory(false); }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent ${
                    c.id === activeSessionId ? "bg-accent font-medium" : ""
                  }`}
                >
                  <div className="truncate">{c.title}</div>
                  <div className="text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main chat */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            {!showHistory && (
              <Button variant="ghost" size="icon" onClick={() => setShowHistory(true)}>
                <History className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Course Assistant</h2>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleNewChat}>
            <Plus className="h-4 w-4 mr-1" /> New Chat
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {allMessages.map(renderMessage)}
            {displayMessages.length <= 1 && !isStreaming && (
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Try one of these to get started</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTED_PROMPTS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <Button
                        key={s.label}
                        variant="outline"
                        className="h-auto justify-start gap-3 rounded-2xl border-border/60 bg-card px-3 py-3 text-left hover:bg-accent"
                        onClick={() => sendMessage(s.prompt)}
                        disabled={isStreaming || isCooldown}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm font-medium leading-tight">{s.label}</span>
                          <span className="text-xs text-muted-foreground leading-snug whitespace-normal line-clamp-2">{s.prompt}</span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            {isStreaming && !streamingMessage && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask about lesson plans, concepts, exercises, assessments…"
              disabled={isStreaming}
              className="flex-1"
            />
            <Button onClick={() => sendMessage()} disabled={!input.trim() || isStreaming}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherChat;
