import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ChatMessage, ChatSession } from "@/types";
import { toast } from "sonner";

export function useChatSessions(mode: "learning" | "exam") {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // Load sessions + messages from DB
  const loadSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: sessionsData, error: sessErr } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("mode", mode)
        .order("updated_at", { ascending: false });

      if (sessErr) throw sessErr;
      if (!sessionsData || sessionsData.length === 0) {
        setSessions([]);
        setActiveSessionId(null);
        setLoading(false);
        return;
      }

      const sessionIds = sessionsData.map((s) => s.id);
      const { data: messagesData, error: msgErr } = await supabase
        .from("chat_messages")
        .select("*")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: true });

      if (msgErr) throw msgErr;

      const mapped: ChatSession[] = sessionsData.map((s) => ({
        id: s.id,
        title: s.title,
        mode: s.mode as "learning" | "exam",
        createdAt: new Date(s.created_at).getTime(),
        updatedAt: new Date(s.updated_at).getTime(),
        messages: (messagesData ?? [])
          .filter((m) => m.session_id === s.id)
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            hasCode: m.has_code ?? false,
            codeContent: m.code_content ?? undefined,
            codeLanguage: m.code_language ?? undefined,
          })),
      }));

      setSessions(mapped);
      if (!activeSessionId || !mapped.find((s) => s.id === activeSessionId)) {
        setActiveSessionId(mapped[0]?.id ?? null);
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    } finally {
      setLoading(false);
    }
  }, [user, mode, activeSessionId]);

  useEffect(() => {
    loadSessions();
  }, [user, mode]);

  // Create a new session in DB
  const createSession = useCallback(
    async (title: string, welcomeContent: string): Promise<string | null> => {
      if (!user) return null;
      try {
        const { data: session, error: sessErr } = await supabase
          .from("chat_sessions")
          .insert({ user_id: user.id, mode, title })
          .select()
          .single();

        if (sessErr || !session) throw sessErr;

        const { data: msg, error: msgErr } = await supabase
          .from("chat_messages")
          .insert({
            session_id: session.id,
            user_id: user.id,
            role: "assistant",
            content: welcomeContent,
          })
          .select()
          .single();

        if (msgErr) throw msgErr;

        const newSession: ChatSession = {
          id: session.id,
          title: session.title,
          mode: session.mode as "learning" | "exam",
          createdAt: new Date(session.created_at).getTime(),
          updatedAt: new Date(session.updated_at).getTime(),
          messages: msg
            ? [{ id: msg.id, role: "assistant" as const, content: msg.content, timestamp: new Date(msg.created_at).getTime() }]
            : [],
        };

        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(session.id);
        return session.id;
      } catch (e) {
        console.error("Failed to create session:", e);
        toast.error("Failed to create chat session");
        return null;
      }
    },
    [user, mode]
  );

  // Add a message to the active session in DB
  const addMessage = useCallback(
    async (sessionId: string, role: "user" | "assistant", content: string): Promise<string | null> => {
      if (!user) return null;
      try {
        const { data: msg, error } = await supabase
          .from("chat_messages")
          .insert({ session_id: sessionId, user_id: user.id, role, content })
          .select()
          .single();

        if (error || !msg) throw error;

        // Update session's updated_at
        await supabase
          .from("chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId);

        const chatMsg: ChatMessage = {
          id: msg.id,
          role: role,
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime(),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, messages: [...s.messages, chatMsg], updatedAt: Date.now() }
              : s
          )
        );

        return msg.id;
      } catch (e) {
        console.error("Failed to save message:", e);
        return null;
      }
    },
    [user]
  );

  // Update title based on first user message
  const updateSessionTitle = useCallback(
    async (sessionId: string, title: string) => {
      try {
        await supabase.from("chat_sessions").update({ title }).eq("id", sessionId);
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
        );
      } catch (e) {
        console.error("Failed to update session title:", e);
      }
    },
    []
  );

  // Optimistically add a message to local state (for streaming)
  const addMessageLocally = useCallback(
    (sessionId: string, msg: ChatMessage) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, msg], updatedAt: Date.now() }
            : s
        )
      );
    },
    []
  );

  // Update the last message content (for streaming updates)
  const updateLastMessage = useCallback(
    (sessionId: string, msgId: string, content: string) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const msgs = [...s.messages];
          const idx = msgs.findIndex((m) => m.id === msgId);
          if (idx >= 0) {
            msgs[idx] = { ...msgs[idx], content };
          } else {
            msgs.push({ id: msgId, role: "assistant", content, timestamp: Date.now() });
          }
          return { ...s, messages: msgs, updatedAt: Date.now() };
        })
      );
    },
    []
  );

  return {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    loading,
    createSession,
    addMessage,
    addMessageLocally,
    updateLastMessage,
    updateSessionTitle,
    reload: loadSessions,
  };
}
