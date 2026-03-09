import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { ChatMessage, ChatSession } from "@/types";
import { mockLearningChatMessages, mockExamChatMessages } from "@/data/mockData";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Send, Plus, History, BookOpen, MessageSquare, Clock, ChevronLeft, Terminal, CheckCircle, ClipboardList, AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const AIChat = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialMode = searchParams.get("mode") === "exam" ? "exam" : "learning";
  const {
    learningChats, setLearningChats,
    examChats, setExamChats,
    activeLearningChatId, setActiveLearningChatId,
    activeExamChatId, setActiveExamChatId,
  } = useApp();

  const [mode, setMode] = useState<"learning" | "exam">(initialMode);
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showCodeTerminal, setShowCodeTerminal] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeResult, setCodeResult] = useState<string | null>(null);
  const [examStarted, setExamStarted] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chats = mode === "learning" ? learningChats : examChats;
  const setChats = mode === "learning" ? setLearningChats : setExamChats;
  const activeChatId = mode === "learning" ? activeLearningChatId : activeExamChatId;
  const setActiveChatId = mode === "learning" ? setActiveLearningChatId : setActiveExamChatId;

  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const isAssessmentActive = examStarted || quizStarted;
  const isChatDisabled = mode === "exam" && isAssessmentActive;

  // Intercept tab switching during assessment
  useEffect(() => {
    if (!isAssessmentActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isAssessmentActive]);

  // Watch for navigation attempts via clicking sidebar links
  useEffect(() => {
    if (!isAssessmentActive) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href && href !== location.pathname && !href.startsWith("http")) {
          e.preventDefault();
          e.stopPropagation();
          setPendingNavigation(href);
          setShowLeaveWarning(true);
        }
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isAssessmentActive, location.pathname]);

  const handleConfirmLeave = () => {
    // End the assessment
    if (activeChat) {
      const endMsg: ChatMessage = {
        id: `auto-end-${Date.now()}`, role: "assistant", timestamp: Date.now(),
        content: examStarted
          ? "⚠️ **Exam ended** — you navigated away from the exam page. Your progress has been **discarded** and will not be submitted."
          : "⚠️ **Daily Quiz ended** — you navigated away from the quiz page. Your progress has been **discarded** and will not be submitted.",
      };
      const updatedChat = { ...activeChat, messages: [...activeChat.messages, endMsg], updatedAt: Date.now() };
      setChats(chats.map((c) => (c.id === activeChat.id ? updatedChat : c)));
    }
    setExamStarted(false);
    setQuizStarted(false);
    setShowLeaveWarning(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  const handleCancelLeave = () => {
    setShowLeaveWarning(false);
    setPendingNavigation(null);
  };

  useEffect(() => {
    const shouldNewChat = searchParams.get("newchat") === "true";
    if (shouldNewChat) {
      const targetMode = searchParams.get("mode") === "exam" ? "exam" : "learning";
      setMode(targetMode);
      setExamStarted(false);
      setQuizStarted(false);
      const newChat: ChatSession = {
        id: `chat-${Date.now()}`,
        title: targetMode === "learning" ? "New Study Session" : "New Exam Prep",
        mode: targetMode,
        messages: [{
          id: `welcome-${Date.now()}`, role: "assistant", timestamp: Date.now(),
          content: targetMode === "learning"
            ? "Hi! I'm your AI Teaching Assistant for **Intro to Python**. I'm here to help you understand concepts, work through problems, and build your knowledge. What would you like to explore?"
            : "**Exam Prep Mode Active**\n\nWelcome to exam preparation. I'll present you with questions based on your professor's exam format.\n\nWhen you're ready, click **Start Exam** or **Start Daily Quiz** below. Once started, the chatbot will be disabled — you'll answer questions directly.\n\nGood luck!",
        }],
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      if (targetMode === "learning") {
        setLearningChats([...learningChats, newChat]);
        setActiveLearningChatId(newChat.id);
      } else {
        setExamChats([...examChats, newChat]);
        setActiveExamChatId(newChat.id);
      }
      return;
    }
  }, []);

  useEffect(() => {
    if (mode === "learning" && learningChats.length === 0) {
      const initialChat: ChatSession = {
        id: "initial-learning", title: "Python Study Session", mode: "learning",
        messages: mockLearningChatMessages, createdAt: Date.now() - 300000, updatedAt: Date.now(),
      };
      setLearningChats([initialChat]);
      setActiveLearningChatId(initialChat.id);
    }
    if (mode === "exam" && examChats.length === 0) {
      const initialChat: ChatSession = {
        id: "initial-exam", title: "Exam Prep", mode: "exam",
        messages: mockExamChatMessages, createdAt: Date.now() - 100000, updatedAt: Date.now(),
      };
      setExamChats([initialChat]);
      setActiveExamChatId(initialChat.id);
    }
    if (mode === "learning") { setExamStarted(false); setQuizStarted(false); }
  }, [mode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length]);

  const createNewChat = () => {
    setExamStarted(false);
    setQuizStarted(false);
    const newChat: ChatSession = {
      id: `chat-${Date.now()}`,
      title: mode === "learning" ? "New Study Session" : "New Exam Prep",
      mode,
      messages: [{
        id: `welcome-${Date.now()}`, role: "assistant", timestamp: Date.now(),
        content: mode === "learning"
          ? "Hi! I'm your AI Teaching Assistant for **Intro to Python**. I'm here to help you understand concepts, work through problems, and build your knowledge. What would you like to explore?"
          : "**Exam Prep Mode Active**\n\nWelcome to exam preparation. I'll present you with questions based on your professor's exam format.\n\nWhen you're ready, click **Start Exam** or **Start Daily Quiz** below. Once started, the chatbot will be disabled — you'll answer questions directly.\n\nGood luck!",
      }],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    setChats([...chats, newChat]);
    setActiveChatId(newChat.id);
    setShowHistory(false);
  };

  const handleStartExam = () => {
    if (!activeChat) return;
    setExamStarted(true);
    setQuizStarted(false);
    const examMsg: ChatMessage = {
      id: `exam-start-${Date.now()}`, role: "assistant", timestamp: Date.now(),
      content: "🎯 **Exam has started!**\n\nThe chatbot is now disabled. Answer the questions below.\n\n**Question 1 of 15:**\nWhat is the output of `print(type(3.14))`?\n\nA) `<class 'int'>`\nB) `<class 'float'>`\nC) `<class 'str'>`\nD) `<class 'number'>`\n\nSelect your answer below.",
    };
    const updatedChat = { ...activeChat, messages: [...activeChat.messages, examMsg], updatedAt: Date.now() };
    setChats(chats.map((c) => (c.id === activeChat.id ? updatedChat : c)));
  };

  const handleStartQuiz = () => {
    if (!activeChat) return;
    setQuizStarted(true);
    setExamStarted(false);
    const quizMsg: ChatMessage = {
      id: `quiz-start-${Date.now()}`, role: "assistant", timestamp: Date.now(),
      content: "📝 **Daily Quiz has started!**\n\nThe chatbot is now disabled. Answer the questions below.\n\n**Question 1 of 5:**\nWhich keyword is used to define a function in Python?\n\nA) `function`\nB) `def`\nC) `func`\nD) `define`\n\nSelect your answer below.",
    };
    const updatedChat = { ...activeChat, messages: [...activeChat.messages, quizMsg], updatedAt: Date.now() };
    setChats(chats.map((c) => (c.id === activeChat.id ? updatedChat : c)));
  };

  const handleSubmit = () => {
    if (!activeChat) return;
    const submitMsg: ChatMessage = {
      id: `submit-${Date.now()}`, role: "assistant", timestamp: Date.now(),
      content: examStarted
        ? "✅ **Exam submitted!**\n\nYour answers have been recorded. You answered 15 questions.\n\nResults will be available shortly. Great effort!"
        : "✅ **Daily Quiz submitted!**\n\nYour answers have been recorded. You answered 5 questions.\n\nResults will be available shortly. Nice work!",
    };
    const updatedChat = { ...activeChat, messages: [...activeChat.messages, submitMsg], updatedAt: Date.now() };
    setChats(chats.map((c) => (c.id === activeChat.id ? updatedChat : c)));
    setExamStarted(false);
    setQuizStarted(false);
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activeChat || isStreaming) return;
    if (mode === "exam" && isAssessmentActive) return;

    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: "user", content: input, timestamp: Date.now() };
    const assistantMsgId = `msg-${Date.now() + 1}`;
    const chatWithUser = { ...activeChat, messages: [...activeChat.messages, userMsg], updatedAt: Date.now() };
    setChats(chats.map((c) => (c.id === activeChat.id ? chatWithUser : c)));
    setInput("");
    setIsStreaming(true);

    // Build message history for the AI (last 20 messages for context)
    const historyMessages = [...activeChat.messages, userMsg]
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: historyMessages, mode }),
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
              const aiMsg: ChatMessage = { id: assistantMsgId, role: "assistant", content: assistantContent, timestamp: Date.now() };
              setChats((prev) =>
                prev.map((c) => {
                  if (c.id !== activeChat.id) return c;
                  const msgs = c.messages.filter((m) => m.id !== assistantMsgId);
                  return { ...c, messages: [...msgs, aiMsg], updatedAt: Date.now() };
                })
              );
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
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
            if (content) {
              assistantContent += content;
              const aiMsg: ChatMessage = { id: assistantMsgId, role: "assistant", content: assistantContent, timestamp: Date.now() };
              setChats((prev) =>
                prev.map((c) => {
                  if (c.id !== activeChat.id) return c;
                  const msgs = c.messages.filter((m) => m.id !== assistantMsgId);
                  return { ...c, messages: [...msgs, aiMsg], updatedAt: Date.now() };
                })
              );
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("Chat error:", e);
      toast.error("Failed to connect to AI. Please try again.");
    } finally {
      setIsStreaming(false);
    }
  }, [input, activeChat, isStreaming, mode, isAssessmentActive, chats, setChats]);

  const handleCodeSubmit = () => {
    if (!codeInput.trim()) return;
    setCodeResult(
      codeInput.includes("def ") || codeInput.includes("print")
        ? "Correct! Your code runs successfully. Output: Hello, World!"
        : "Not quite. Check your syntax — remember Python uses `def` to define functions. Try again!"
    );
  };

  const handleModeSwitch = (newMode: string) => {
    if (isAssessmentActive && newMode !== mode) {
      setPendingNavigation(null);
      setShowLeaveWarning(true);
      return;
    }
    setMode(newMode as "learning" | "exam");
    setShowHistory(false);
    setExamStarted(false);
    setQuizStarted(false);
  };

  const renderMessage = (msg: ChatMessage) => (
    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
        msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
      }`}>
        <div className="whitespace-pre-wrap">{msg.content}</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-57px)] md:h-screen">
      {/* Chat History Sidebar */}
      {showHistory && (
        <div className="w-72 border-r bg-sidebar p-4 space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              {mode === "learning" ? "Study" : "Exam Prep"} History
            </h3>
            <button onClick={() => setShowHistory(false)}><ChevronLeft className="h-4 w-4" /></button>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={createNewChat}>
            <Plus className="mr-1 h-4 w-4" /> New Chat
          </Button>
          <div className="space-y-1 mt-3">
            {chats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No {mode === "learning" ? "study" : "exam prep"} chats yet</p>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => { setActiveChatId(chat.id); setShowHistory(false); setExamStarted(false); setQuizStarted(false); }}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    chat.id === activeChatId ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/50"
                  }`}
                >
                  <p className="truncate">{chat.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {chat.messages.length} messages · {new Date(chat.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowHistory(!showHistory)} className="rounded-lg p-2 hover:bg-muted transition-colors" title="Chat History">
              <History className="h-5 w-5" />
            </button>
            <Tabs value={mode} onValueChange={handleModeSwitch}>
              <TabsList className="h-10">
                <TabsTrigger value="learning" className="text-sm px-5 h-8 gap-2">
                  <BookOpen className="h-4 w-4" /> Study
                </TabsTrigger>
                <TabsTrigger value="exam" className="text-sm px-5 h-8 gap-2">
                  <Clock className="h-4 w-4" /> Exam Prep
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 text-sm" onClick={createNewChat}>
              <Plus className="mr-2 h-4 w-4" /> New Chat
            </Button>
          </div>
        </div>

        {/* Exam/Quiz start buttons */}
        {mode === "exam" && !isAssessmentActive && activeChat && (
          <div className="flex items-center justify-center gap-3 border-b bg-muted/20 px-5 py-3">
            <Button onClick={handleStartExam} className="gap-2">
              <Clock className="h-4 w-4" /> Start Exam
            </Button>
            <Button onClick={handleStartQuiz} variant="secondary" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Start Daily Quiz
            </Button>
          </div>
        )}

        {/* Assessment active banner + submit button */}
        {isChatDisabled && (
          <div className="flex items-center justify-between border-b bg-destructive/10 px-5 py-2">
            <p className="text-sm font-medium text-destructive">
              {examStarted ? "Exam" : "Daily Quiz"} in progress — chatbot is disabled
            </p>
            <Button onClick={handleSubmit} variant="destructive" size="sm" className="gap-2">
              <CheckCircle className="h-4 w-4" /> Submit {examStarted ? "Exam" : "Quiz"}
            </Button>
          </div>
        )}

        {/* Controls bar - only in study mode */}
        {mode === "learning" && (
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-2.5">
            <Button variant="ghost" size="sm" className="h-9 text-sm gap-2 ml-auto" onClick={() => setShowCodeTerminal(!showCodeTerminal)}>
              <Terminal className="h-4 w-4" /> Code Terminal
            </Button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {activeChat ? (
            <>
              {activeChat.messages.map(renderMessage)}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">No active chat. Start a new conversation!</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={createNewChat}>
                  <Plus className="mr-1 h-4 w-4" /> New Chat
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Code Terminal - only in study mode */}
        {mode === "learning" && showCodeTerminal && (
          <div className="border-t bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Interactive Code Terminal</span>
              <button onClick={() => setShowCodeTerminal(false)} className="ml-auto text-sm text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <textarea
              className="w-full rounded-md border bg-background p-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              rows={4}
              placeholder="Write your Python code here..."
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={handleCodeSubmit}>Run & Check</Button>
              {codeResult && <p className={`text-sm ${codeResult.startsWith("Correct") ? "text-success" : "text-accent"}`}>{codeResult}</p>}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              placeholder={isChatDisabled ? "Chatbot disabled during assessment..." : mode === "learning" ? "Ask your Teaching Assistant anything..." : "Ask about exam topics or start a simulation..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1"
              disabled={isChatDisabled}
            />
            <Button onClick={sendMessage} size="icon" disabled={!input.trim() || isChatDisabled}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-primary" />
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Private & anonymized</span> — your professor never sees your individual chats, answers, or performance.
            </p>
          </div>
        </div>
      </div>

      {/* Leave Warning Dialog */}
      <Dialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              End {examStarted ? "Exam" : "Daily Quiz"}?
            </DialogTitle>
            <DialogDescription>
              If you leave this page, your {examStarted ? "exam" : "daily quiz"} will automatically end and your progress will be **discarded** (not submitted). Are you sure you want to leave?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleCancelLeave}>Stay & Continue</Button>
            <Button variant="destructive" onClick={handleConfirmLeave}>Leave & End {examStarted ? "Exam" : "Quiz"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIChat;
