import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Users, UserPlus, Trash2, Crown } from "lucide-react";

interface Collaborator {
  id: string;
  teacher_id: string;
  role: string;
  created_at: string;
  name: string;
  email: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AddResults = {
  added: string[];
  invalid: string[];
  notTeacher: string[];
  duplicate: string[];
};

export default function CourseCollaborators() {
  const { user } = useAuth();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [emailsText, setEmailsText] = useState("");
  const [adding, setAdding] = useState(false);
  const [lastResults, setLastResults] = useState<AddResults | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Collaborator | null>(null);
  const [removing, setRemoving] = useState(false);

  const courseId = useTeacherCourseId();

  const fetchCollaborators = async () => {
    if (!courseId || !user) return;
    setLoading(true);

    const { data: course } = await supabase
      .from("courses")
      .select("teacher_id")
      .eq("id", courseId)
      .single();

    const ownerId = course?.teacher_id;
    const ownerIsMe = ownerId === user.id;
    setIsOwner(ownerIsMe);

    let ownerRow: Collaborator | null = null;
    if (ownerId) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("id, name, email, created_at")
        .eq("id", ownerId)
        .single();

      if (ownerProfile) {
        ownerRow = {
          id: `owner-${ownerProfile.id}`,
          teacher_id: ownerProfile.id,
          role: "owner",
          created_at: ownerProfile.created_at,
          name: ownerProfile.name || "Unknown",
          email: ownerProfile.email ?? null,
        };
      }
    }

    const { data, error } = await supabase
      .from("course_teachers")
      .select("id, teacher_id, role, created_at, profiles(name, email)")
      .eq("course_id", courseId);

    if (error) {
      console.error("Failed to fetch collaborators", error);
      setLoading(false);
      return;
    }

    const mapped: Collaborator[] = (data || [])
      .filter((row: any) => row.teacher_id !== ownerId)
      .map((row: any) => ({
        id: row.id,
        teacher_id: row.teacher_id,
        role: row.role || "collaborator",
        created_at: row.created_at,
        name: row.profiles?.name || "Unknown",
        email: row.profiles?.email ?? null,
      }));

    setCollaborators(ownerRow ? [ownerRow, ...mapped] : mapped);
    setLoading(false);
  };

  useEffect(() => {
    fetchCollaborators();
  }, [courseId, user]);

  const handleAdd = async () => {
    if (!courseId || !emailsText.trim()) return;
    setAdding(true);
    setLastResults(null);

    // 1. Parse + normalize
    const rawTokens = emailsText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const t of rawTokens) {
      const lower = t.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        tokens.push(lower);
      }
    }

    const invalid: string[] = [];
    const validEmails: string[] = [];
    for (const t of tokens) {
      if (EMAIL_RE.test(t)) validEmails.push(t);
      else invalid.push(t);
    }

    // 2. Skip already-collaborator
    const existingEmails = new Set(
      collaborators.map((c) => (c.email || "").toLowerCase()).filter(Boolean),
    );
    const duplicate: string[] = [];
    const toLookup: string[] = [];
    for (const e of validEmails) {
      if (existingEmails.has(e)) duplicate.push(e);
      else toLookup.push(e);
    }

    // 3. Batch lookup
    const notTeacher: string[] = [];
    const added: string[] = [];
    let toInsert: { course_id: string; teacher_id: string; role: string }[] = [];

    if (toLookup.length > 0) {
      const { data: profs, error: lookupErr } = await supabase
        .from("profiles")
        .select("id, email, role")
        .in("email", toLookup);

      if (lookupErr) {
        toast({ title: "Lookup failed", description: lookupErr.message, variant: "destructive" });
        setAdding(false);
        return;
      }

      const byEmail = new Map<string, { id: string; role: string }>();
      for (const p of profs || []) {
        if (p.email) byEmail.set(p.email.toLowerCase(), { id: p.id, role: p.role });
      }

      for (const e of toLookup) {
        const hit = byEmail.get(e);
        if (!hit || hit.role !== "teacher") {
          notTeacher.push(e);
        } else {
          toInsert.push({ course_id: courseId, teacher_id: hit.id, role: "collaborator" });
          added.push(e);
        }
      }
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase.from("course_teachers").insert(toInsert);
      if (insertErr) {
        toast({ title: "Failed to add collaborators", description: insertErr.message, variant: "destructive" });
        setAdding(false);
        await fetchCollaborators();
        return;
      }
    }

    setLastResults({ added, invalid, notTeacher, duplicate });

    const summary: string[] = [];
    if (added.length) summary.push(`${added.length} added`);
    if (duplicate.length) summary.push(`${duplicate.length} already`);
    if (notTeacher.length) summary.push(`${notTeacher.length} not a teacher`);
    if (invalid.length) summary.push(`${invalid.length} invalid`);

    if (added.length > 0) {
      toast({ title: "Collaborators updated", description: summary.join(" · ") });
      // Remove successfully added from textarea, keep failures for correction
      const remaining = [...invalid, ...notTeacher];
      setEmailsText(remaining.join("\n"));
      await fetchCollaborators();
    } else {
      toast({
        title: "No collaborators added",
        description: summary.join(" · ") || "No valid emails to add.",
        variant: "destructive",
      });
    }

    setAdding(false);
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);

    const { error } = await supabase
      .from("course_teachers")
      .delete()
      .eq("id", removeTarget.id);

    if (error) {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Collaborator removed", description: `${removeTarget.name} has been removed.` });
      fetchCollaborators();
    }
    setRemoving(false);
    setRemoveTarget(null);
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  if (!courseId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Collaborators
        </CardTitle>
        <CardDescription>Teachers who have access to this course</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {collaborators.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {getInitials(c.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.role === "owner" ? "default" : "secondary"} className="gap-1">
                      {c.role === "owner" && <Crown className="h-3 w-3" />}
                      {c.role === "owner" ? "Owner" : "Collaborator"}
                    </Badge>
                    {isOwner && c.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setRemoveTarget(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isOwner && (
              <div className="space-y-2 pt-2">
                <Textarea
                  placeholder={"one email per line, e.g.\nalice@school.edu\nbob@school.edu"}
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  rows={5}
                  className="font-mono text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Enter one teacher email per line. Only registered teachers can be added.
                  </p>
                  <Button
                    onClick={handleAdd}
                    disabled={adding || !emailsText.trim()}
                    className="shrink-0 gap-1.5"
                  >
                    <UserPlus className="h-4 w-4" />
                    {adding ? "Adding..." : "Add collaborators"}
                  </Button>
                </div>

                {lastResults && (
                  <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
                    {lastResults.added.length > 0 && (
                      <p className="text-emerald-600 dark:text-emerald-400">
                        Added ({lastResults.added.length}): {lastResults.added.join(", ")}
                      </p>
                    )}
                    {lastResults.duplicate.length > 0 && (
                      <p className="text-muted-foreground">
                        Already a collaborator ({lastResults.duplicate.length}):{" "}
                        {lastResults.duplicate.join(", ")}
                      </p>
                    )}
                    {lastResults.notTeacher.length > 0 && (
                      <p className="text-destructive">
                        Not a registered teacher ({lastResults.notTeacher.length}):{" "}
                        {lastResults.notTeacher.join(", ")}
                      </p>
                    )}
                    {lastResults.invalid.length > 0 && (
                      <p className="text-destructive">
                        Invalid email ({lastResults.invalid.length}):{" "}
                        {lastResults.invalid.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Collaborator</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove <strong>{removeTarget?.name}</strong> from this course? They will lose access immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleRemove} disabled={removing}>
                {removing ? "Removing..." : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
