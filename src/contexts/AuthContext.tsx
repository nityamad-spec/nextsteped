import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, role: string, enrollment_code?: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string, role?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const parseFunctionResponse = async (response: Response) => {
    const rawBody = await response.text();

    if (!rawBody) {
      return {};
    }

    try {
      return JSON.parse(rawBody);
    } catch {
      return { error: rawBody };
    }
  };

  const applySessionFromFunctionResponse = async (payload: any) => {
    const sessionPayload = payload?.session ?? payload;
    const access_token = sessionPayload?.access_token;
    const refresh_token = sessionPayload?.refresh_token;

    if (!access_token || !refresh_token) {
      return null;
    }

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return error.message;
    }

    setSession(data.session);
    setUser(data.user);
    return null;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string, role: string, enrollment_code?: string) => {
    // Student signups go through edge function to bypass per-IP rate limits
    if (role === "student") {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/student-signup`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ email, password, name, enrollment_code }),
          }
        );
        const data = await parseFunctionResponse(response);
        if (!response.ok) {
          return { error: data?.error || data?.message || data?.msg || "Signup failed" };
        }

        const sessionError = await applySessionFromFunctionResponse(data);
        if (sessionError) {
          return { error: sessionError };
        }

        return { error: null };
      } catch (err: any) {
        return { error: err.message || "Signup failed" };
      }
    }

    // Non-student roles use standard auth signup
    const metadata: Record<string, string> = { name, role };
    if (enrollment_code) metadata.enrollment_code = enrollment_code;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: metadata,
      },
    });
    if (error) {
      if (error.message?.toLowerCase().includes("signups not allowed") || error.message?.toLowerCase().includes("signup_disabled")) {
        return { error: "SIGNUPS_DISABLED" };
      }
      return { error: error.message };
    }
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { error: "An account with this email already exists. Please sign in instead." };
    }
    return { error: null };
  };

  const signIn = async (email: string, password: string, role?: string) => {
    // Student sign-ins go through edge function to bypass per-IP rate limits
    if (role === "student") {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/student-signin`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ email, password }),
          }
        );
        const data = await parseFunctionResponse(response);
        if (!response.ok) {
          return { error: data?.error || data?.message || data?.msg || "Sign in failed" };
        }

        const sessionError = await applySessionFromFunctionResponse(data);
        if (sessionError) {
          return { error: sessionError };
        }

        return { error: null };
      } catch (err: any) {
        return { error: err.message || "Sign in failed" };
      }
    }

    // Non-student roles use standard auth
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
