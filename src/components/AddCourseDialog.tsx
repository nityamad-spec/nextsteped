import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/extractFunctionError";

type CodeStatus = "idle" | "checking" | "valid" | "invalid";

interface AddCourseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const AddCourseDialog = ({ open, onOpenChange }: AddCourseDialogProps) => {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CodeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCode(""); setStatus("idle"); setError(null); setCourseName(null);
    }
  }, [open]);

  // Live validation
  useEffect(() => {
    const c = code.trim();
    if (!c) { setStatus("idle"); setError(null); setCourseName(null); return; }
    setStatus("checking");
    const t = setTimeout(async () => {
      try {
        const { data, error: err } = await supabase.functions.invoke("validate-enrollment-code", {
          body: { enrollment_code: c },
        });
        if (err) throw err;
        if (data?.valid) {
          setStatus("valid"); setError(null); setCourseName(data.course?.name || null);
        } else {
          setStatus("invalid"); setError(data?.error || "Invalid enrollment code"); setCourseName(null);
        }
      } catch (err: any) {
        setStatus("invalid");
        setError(await extractFunctionError(err, "Couldn't validate code"));
        setCourseName(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [code]);

  const submit = async () => {
    if (status !== "valid") return;
    setSubmitting(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("enroll-additional-course", {
        body: { enrollment_code: code.trim() },
      });
      if (err) throw err;
      const payload = data as any;
      if (payload?.error) throw new Error(payload.error);

      const courseId = payload.course_id;
      localStorage.setItem("enrolledCourseId", courseId);

      // Always go through the diagnostic for a freshly added course.
      // (If they were already enrolled and the diagnostic exists, the
      // diagnostic page will detect that and bounce to /student/home.)
      onOpenChange(false);
      toast.success(`Enrolled in ${payload.course_name}`);
      window.location.assign(`/student/diagnostic?course=${courseId}`);
    } catch (err: any) {
      let msg = err?.message || "Couldn't enroll. Please try again.";
      try {
        const body = await err?.context?.json?.();
        if (body?.error) msg = body.error;
      } catch { /* ignore */ }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Course</DialogTitle>
          <DialogDescription>
            Enter the enrollment code your professor gave you. You'll take a quick diagnostic
            for the new course before accessing its dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Enrollment Code</Label>
          <div className="relative">
            <Input
              autoFocus
              placeholder="e.g. a1b2c3d4"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={
                status === "invalid" ? "border-destructive focus-visible:ring-destructive"
                  : status === "valid" ? "border-primary"
                    : ""
              }
            />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {status === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {status === "valid" && <Check className="h-4 w-4 text-primary" />}
              {status === "invalid" && <AlertCircle className="h-4 w-4 text-destructive" />}
            </div>
          </div>
          {status === "valid" && courseName && (
            <p className="text-xs text-primary">✓ {courseName}</p>
          )}
          {status === "invalid" && error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={status !== "valid" || submitting}>
            {submitting ? "Enrolling…" : "Enroll & Take Diagnostic"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddCourseDialog;
