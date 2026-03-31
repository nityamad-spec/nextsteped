import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, role: string, enrollment_code?: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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
      const { data, error: fnError } = await supabase.functions.invoke("student-signup", {
        body: { email, password, name, enrollment_code },
      });
      if (fnError) {
        return { error: fnError.message || "Signup failed" };
      }
      if (data?.error) {
        return { error: data.error };
      }
      return { error: null };
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
      const { data, error: fnError } = await supabase.functions.invoke("student-signin", {
        body: { email, password },
      });
      if (fnError) {
        return { error: fnError.message || "Sign in failed" };
      }
      if (data?.error) {
        return { error: data.error };
      }
      if (data?.access_token && data?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) {
          return { error: sessionError.message };
        }
      }
      return { error: null };
    }

    // Non-student roles use standard auth
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
