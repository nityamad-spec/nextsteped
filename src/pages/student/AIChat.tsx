import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { ChatMessage, ChatSession } from "@/types";
import { mockLearningChatMessages, mockExamChatMessages } from "@/data/mockData";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Plus, History, BookOpen, MessageSquare, Clock, ChevronLeft, Terminal, CheckCircle, ClipboardList } from "lucide-react";

const AIChat = () => {
  const [searchParams] = useSearchParams();
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chats = mode === "learning" ? learningChats : examChats;
  const setChats = mode === "learning" ? setLearningChats : setExamChats;
  const activeChatId = mode === "learning" ? activeLearningChatId : activeExamChatId;
  const setActiveChatId = mode === "learning" ? setActiveLearningChatId : setActiveExamChatId;

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

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
            ? "Hi! I'm your AI Teaching Assistant for **Operating Systems**. I'm here to help you understand concepts, work through problems, and build your knowledge. What would you like to explore?"
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
        id: "initial-learning", title: "Virtual Memory Discussion", mode: "learning",
        messages: mockLearningChatMessages, createdAt: Date.now() - 300000, updatedAt: Date.now(),
      };
      setLearningChats([initialChat]);
      setActiveLearningChatId(initialChat.id);
    }
    if (mode === "exam" && examChats.length === 0) {
      const initialChat: ChatSession = {
        id: "initial-exam", title: "Midterm Exam Prep", mode: "exam",
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
          ? "Hi! I'm your AI Teaching Assistant for **Operating Systems**. I'm here to help you understand concepts, work through problems, and build your knowledge. What would you like to explore?"
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
      content: "🎯 **Exam has started!**\n\nThe chatbot is now disabled. Answer the questions below.\n\n**Question 1 of 15:**\nWhat is the primary purpose of an operating system?\n\nA) To manage hardware resources and provide services to applications\nB) To compile source code into machine code\nC) To design user interfaces\nD) To store data permanently\n\nSelect your answer below.",
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
      content: "📝 **Daily Quiz has started!**\n\nThe chatbot is now disabled. Answer the questions below.\n\n**Question 1 of 5:**\nWhich scheduling algorithm gives the minimum average waiting time?\n\nA) First-Come, First-Served (FCFS)\nB) Shortest Job First (SJF)\nC) Round Robin\nD) Priority Scheduling\n\nSelect your answer below.",
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

  const sendMessage = () => {
    if (!input.trim() || !activeChat) return;
    if (mode === "exam" && (examStarted || quizStarted)) return;
    
    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: "user", content: input, timestamp: Date.now() };
    const updatedChat = { ...activeChat, messages: [...activeChat.messages, userMsg], updatedAt: Date.now() };
    setChats(chats.map((c) => (c.id === activeChat.id ? updatedChat : c)));
    setInput("");

    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`, role: "assistant", timestamp: Date.now(),
        content: "That's a great question! Let me break this down for you.\n\n### Key Concept\nThe answer involves understanding how the OS manages resources efficiently. Here's a step-by-step explanation:\n\n1. **First**, the system checks the current state\n2. **Then**, it applies the scheduling algorithm\n3. **Finally**, it updates the process table\n\n**Try this**: Can you think of a scenario where this approach might cause a problem?\n\n*Hint: Think about what happens when multiple processes compete for the same resource.*",
      };
      const updatedChats = chats.map((c) => (c.id === activeChat.id ? { ...c, messages: [...c.messages, userMsg, aiMsg], updatedAt: Date.now() } : c));
      setChats(updatedChats);
    }, 1200);
  };

  const handleCodeSubmit = () => {
    if (!codeInput.trim()) return;
    setCodeResult(
      codeInput.includes("FCFS") || codeInput.includes("fcfs")
        ? "Correct! Your FCFS implementation correctly calculates waiting times. Average waiting time: 8.5ms"
        : "Not quite. Check your scheduling logic — remember FCFS processes jobs in arrival order. Try again!"
    );
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

  const isChatDisabled = mode === "exam" && (examStarted || quizStarted);
  const isAssessmentActive = examStarted || quizStarted;

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
            <Tabs value={mode} onValueChange={(v) => { setMode(v as "learning" | "exam"); setShowHistory(false); setExamStarted(false); setQuizStarted(false); }}>
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

        {/* Exam/Quiz start buttons (only in exam mode, before any assessment starts) */}
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
              placeholder="Write your code here... (e.g., implement FCFS scheduler)"
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
          <p className="mt-2 text-[11px] text-muted-foreground text-center">
            Your conversations are private and anonymized. Professors cannot see your individual chat data or responses.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AIChat;
