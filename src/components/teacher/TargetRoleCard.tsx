import { useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

/** Common roles a skilling-pathway course prepares students for. */
export const TARGET_ROLE_PRESETS = [
  "AI Engineer",
  "Machine Learning Engineer",
  "Data Scientist",
  "Data Analyst",
  "Backend Engineer",
  "Full-Stack Engineer",
  "Frontend Engineer",
  "Data Engineer",
  "DevOps Engineer",
  "Product Analyst",
];

const OTHER = "__other__";

interface Props {
  courseId: string | null;
  /** Notified after a successful save so parents can refresh their copy. */
  onSaved?: (role: string) => void;
}

/**
 * Course Dashboard card where the professor picks the single target role
 * students see across their home page, learning path and career readiness.
 */
const TargetRoleCard = ({ courseId, onSaved }: Props) => {
  const [savedRole, setSavedRole] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!courseId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("courses")
        .select("target_role")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      const role = ((data as any)?.target_role ?? null) as string | null;
      setSavedRole(role);
      if (role && TARGET_ROLE_PRESETS.includes(role)) {
        setChoice(role);
        setCustom("");
      } else if (role) {
        setChoice(OTHER);
        setCustom(role);
      } else {
        setChoice("");
        setCustom("");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  const pending = choice === OTHER ? custom.trim() : choice;
  const dirty = !!pending && pending !== (savedRole ?? "");

  const persist = async () => {
    if (!courseId || !pending) return;
    setSaving(true);
    const { error } = await supabase
      .from("courses")
      .update({ target_role: pending } as any)
      .eq("id", courseId);
    setSaving(false);
    setConfirmOpen(false);
    if (error) {
      toast({ title: "Could not save the role", description: error.message, variant: "destructive" });
      return;
    }
    setSavedRole(pending);
    onSaved?.(pending);
    toast({ title: "Target role saved", description: `Students now see ${pending}.` });
  };

  const handleSave = () => {
    if (!dirty) return;
    if (savedRole) setConfirmOpen(true);
    else void persist();
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-5 w-5 text-primary" /> Target role
        </CardTitle>
        <CardDescription>
          Pick the one role this course prepares students for. It's shown to students on their home
          page, learning path and career readiness.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {!savedRole && (
              <p className="text-sm text-muted-foreground">
                No role picked yet — students see a general "Employment track" label until you choose one.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={choice} onValueChange={setChoice}>
                <SelectTrigger className="w-[260px]" aria-label="Target role">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_ROLE_PRESETS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Other role…</SelectItem>
                </SelectContent>
              </Select>
              {choice === OTHER && (
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="e.g. Applied Research Engineer"
                  aria-label="Custom role name"
                  className="w-[260px]"
                />
              )}
              <Button onClick={handleSave} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save role"}
              </Button>
            </div>
            {savedRole && (
              <p className="text-xs text-muted-foreground">
                Students currently see <span className="font-medium text-foreground">{savedRole}</span>.
              </p>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the target role?</AlertDialogTitle>
            <AlertDialogDescription>
              Career readiness content (interview rounds, questions, mock types) was drafted for{" "}
              <span className="font-medium">{savedRole}</span>. Changing the role won't rewrite it —
              you'll need to redraft those sections from the Soft Skills step.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void persist(); }}>
              Change role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default TargetRoleCard;
