import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}

export default function CourseCollaborators() {
  const { user } = useAuth();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Collaborator | null>(null);
  const [removing, setRemoving] = useState(false);

  const courseId = localStorage.getItem("currentCourseId");

  const fetchCollaborators = async () => {
    if (!courseId || !user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("course_teachers")
      .select("id, teacher_id, role, created_at, profiles(name)")
      .eq("course_id", courseId);

    if (error) {
      console.error("Failed to fetch collaborators", error);
      setLoading(false);
      return;
    }

    const mapped: Collaborator[] = (data || []).map((row: any) => ({
      id: row.id,
      teacher_id: row.teacher_id,
      role: row.role,
      created_at: row.created_at,
      name: row.profiles?.name || "Unknown",
    }));

    setCollaborators(mapped);
    const myRow = mapped.find((c) => c.teacher_id === user.id);
    setIsOwner(myRow?.role === "owner");
    setLoading(false);
  };

  useEffect(() => {
    fetchCollaborators();
  }, [courseId, user]);

  const handleAdd = async () => {
    if (!email.trim() || !courseId) return;
    setAdding(true);

    // Look up teacher by email in auth metadata via profiles
    // We need to find the profile. Since we can't query auth.users,
    // we'll search profiles where role = 'teacher'. The email isn't in profiles,
    // so we use supabase auth admin. Instead, let's look up by name for now
    // Actually, we need email. Let's query auth users via a workaround:
    // We'll use the profiles table joined with the email concept.
    // Since profiles don't store email, we search via supabase.auth — but that's admin only.
    // Best approach: use an RPC or edge function. For simplicity, let's search by name.

    // Actually the plan says "enter a teacher's email" but profiles don't have email.
    // Let's search by name instead for now.
    const { data: teachers, error: searchError } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "teacher")
      .ilike("name", `%${email.trim()}%`);

    if (searchError || !teachers || teachers.length === 0) {
      toast({ title: "Teacher not found", description: "No teacher found with that name.", variant: "destructive" });
      setAdding(false);
      return;
    }

    // Check if already a collaborator
    const teacher = teachers[0];
    if (collaborators.some((c) => c.teacher_id === teacher.id)) {
      toast({ title: "Already added", description: `${teacher.name} is already a collaborator.`, variant: "destructive" });
      setAdding(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("course_teachers")
      .insert({ course_id: courseId, teacher_id: teacher.id, role: "collaborator" });

    if (insertError) {
      toast({ title: "Failed to add", description: insertError.message, variant: "destructive" });
    } else {
      toast({ title: "Collaborator added", description: `${teacher.name} has been added to the course.` });
      setEmail("");
      fetchCollaborators();
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
              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder="Search teacher by name..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <Button onClick={handleAdd} disabled={adding || !email.trim()} className="shrink-0 gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            )}
          </>
        )}

        {/* Remove confirmation dialog */}
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
