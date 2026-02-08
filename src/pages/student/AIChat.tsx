import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { ChatMessage, ChatSession } from "@/types";
import { mockLearningChatMessages, mockExamChatMessages } from "@/data/mockData";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Send, Plus, History, Lightbulb, BookOpen, MessageSquare, Clock, ChevronLeft, Terminal } from "lucide-react";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chats = mode === "learning" ? learningChats : examChats;
  const setChats = mode === "learning" ? setLearningChats : setExamChats;
  const activeChatId = mode === "learning" ? activeLearningChatId : activeExamChatId;
  const setActiveChatId = mode === "learning" ? setActiveLearningChatId : setActiveExamChatId;

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  useEffect(() => {
    // Seed initial chat if none exists for learning mode
    if (mode === "learning" && learningChats.length === 0) {
      const initialChat: ChatSession = {
        id: "initial-learning",
        title: "Virtual Memory Discussion",
        mode: "learning",
        messages: mockLearningChatMessages,
        createdAt: Date.now() - 300000,
        updatedAt: Date.now(),
      };
      setLearningChats([initialChat]);
      setActiveLearningChatId(initialChat.id);
    }
    if (mode === "exam" && examChats.length === 0) {
      const initialChat: ChatSession = {
        id: "initial-exam",
        title: "Midterm Exam Prep",
        mode: "exam",
        messages: mockExamChatMessages,
        createdAt: Date.now() - 100000,
        updatedAt: Date.now(),
      };
      setExamChats([initialChat]);
      setActiveExamChatId(initialChat.id);
    }
  }, [mode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length]);

  const createNewChat = () => {
    const newChat: ChatSession = {
      id: `chat-${Date.now()}`,
      title: mode === "learning" ? "New Learning Session" : "New Exam Prep",
      mode,
      messages: [{
        id: `welcome-${Date.now()}`,
        role: "assistant",
        timestamp: Date.now(),
        content: mode === "learning"
          ? "👋 Hi! I'm your AI Teaching Assistant for **Operating Systems**. I'm here to help you understand concepts, work through problems, and build your knowledge. What would you like to explore?"
          : "🎯 **Exam Prep Mode Active**\n\nWelcome to exam preparation. I'll help you practice with timed questions, review your weak areas, and build exam confidence.\n\nReady to set up a simulation or practice specific topics?",
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setChats([...chats, newChat]);
    setActiveChatId(newChat.id);
    setShowHistory(false);
  };

  const sendMessage = () => {
    if (!input.trim() || !activeChat) return;
    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: "user", content: input, timestamp: Date.now() };
    const updatedChat = { ...activeChat, messages: [...activeChat.messages, userMsg], updatedAt: Date.now() };
    setChats(chats.map((c) => (c.id === activeChat.id ? updatedChat : c)));
    setInput("");

    // Mock AI response
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`, role: "assistant", timestamp: Date.now(),
        content: mode === "learning"
          ? "That's a great question! Let me break this down for you.\n\n### Key Concept\nThe answer involves understanding how the OS manages resources efficiently. Here's a step-by-step explanation:\n\n1. **First**, the system checks the current state\n2. **Then**, it applies the scheduling algorithm\n3. **Finally**, it updates the process table\n\n**Try this**: Can you think of a scenario where this approach might cause a problem?\n\n💡 *Hint: Think about what happens when multiple processes compete for the same resource.*"
          : "Let's work through this problem.\n\n**Question**: Given a reference string `7, 0, 1, 2, 0, 3, 0, 4, 2, 3` and 3 page frames, how many page faults occur using FIFO?\n\nTake your time — use the scratchpad if needed. When you're ready, share your answer and reasoning.",
      };
      const updatedChats = chats.map((c) => (c.id === activeChat.id ? { ...c, messages: [...c.messages, userMsg, aiMsg], updatedAt: Date.now() } : c));
      setChats(updatedChats);
    }, 1200);
  };

  const handleCodeSubmit = () => {
    if (!codeInput.trim()) return;
    setCodeResult(
      codeInput.includes("FCFS") || codeInput.includes("fcfs")
        ? "✅ Correct! Your FCFS implementation correctly calculates waiting times. Average waiting time: 8.5ms"
        : "⚠️ Not quite. Check your scheduling logic — remember FCFS processes jobs in arrival order. Try again!"
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

  return (
    <div className="flex h-[calc(100vh-57px)] md:h-screen">
      {/* Chat History Sidebar */}
      {showHistory && (
        <div className="w-64 border-r bg-sidebar p-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Chat History</h3>
            <button onClick={() => setShowHistory(false)}><ChevronLeft className="h-4 w-4" /></button>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={createNewChat}>
            <Plus className="mr-1 h-3 w-3" /> New Chat
          </Button>
          <div className="space-y-1 mt-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => { setActiveChatId(chat.id); setShowHistory(false); }}
                className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  chat.id === activeChatId ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/50"
                }`}
              >
                <p className="truncate">{chat.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(chat.updatedAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHistory(!showHistory)} className="rounded p-1.5 hover:bg-muted">
              <History className="h-4 w-4" />
            </button>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "learning" | "exam")}>
              <TabsList className="h-8">
                <TabsTrigger value="learning" className="text-xs px-3 h-6">
                  <BookOpen className="mr-1 h-3 w-3" /> Learning
                </TabsTrigger>
                <TabsTrigger value="exam" className="text-xs px-3 h-6">
                  <Clock className="mr-1 h-3 w-3" /> Exam Prep
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={createNewChat}>
              <Plus className="mr-1 h-3 w-3" /> New Chat
            </Button>
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-xs">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
            <Lightbulb className="h-3 w-3" /> Ask for Hint
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 ml-auto" onClick={() => setShowCodeTerminal(!showCodeTerminal)}>
            <Terminal className="h-3 w-3" /> Code Terminal
          </Button>
        </div>

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
                  <Plus className="mr-1 h-3 w-3" /> New Chat
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Code Terminal */}
        {showCodeTerminal && (
          <div className="border-t bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Interactive Code Terminal</span>
              <button onClick={() => setShowCodeTerminal(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <textarea
              className="w-full rounded-md border bg-background p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              rows={4}
              placeholder="Write your code here... (e.g., implement FCFS scheduler)"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={handleCodeSubmit} className="text-xs">Run & Check</Button>
              {codeResult && <p className={`text-xs ${codeResult.startsWith("✅") ? "text-success" : "text-accent"}`}>{codeResult}</p>}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              placeholder={mode === "learning" ? "Ask your AI TA anything..." : "Ask about exam topics or start a simulation..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1"
            />
            <Button onClick={sendMessage} size="icon" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIChat;