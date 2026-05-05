import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { availableDepartments } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import { UniversityCombobox } from "@/components/UniversityCombobox";
import { toast } from "sonner";

/**
 * Step 2 of the new-professor flow.
 *
 * Collects ONLY profile + institutional details — NO course information,
 * NO password (account is created on admin approval via invite email).
 *
 * Submits to teacher_applications and routes to /intro/teacher/pending.
 *
 * If the user already submitted an application with this email, we
 * surface a friendly message and route them to the pending screen.
 */
const TeacherApplicationForm = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [institution, setInstitution] = useState("");
  const [universityId, setUniversityId] = useState<string | null>(null);
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");

  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [checkingSignups, setCheckingSignups] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "teacher_signups_enabled")
      .maybeSingle()
      .then(({ data }) => {
        setSignupsEnabled(data?.value !== "false");
        setCheckingSignups(false);
      });
  }, []);

  const isValid =
    name.trim() &&
    email.trim() &&
    institution.trim() &&
    universityId &&
    department &&
    designation.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();

      // Save context for the pending screen so we can show the right email
      // and avoid a refetch on the next page.
      sessionStorage.setItem(
        "pendingApplication",
        JSON.stringify({ email: trimmedEmail, name: name.trim() })
      );

      const { error } = await supabase.from("teacher_applications").insert({
        name: name.trim(),
        email: trimmedEmail,
        institution: institution.trim(),
        department,
        designation: designation.trim(),
      } as any);

      if (error) {
        toast.error(`Failed to submit application: ${error.message}`);
        setSubmitting(false);
        return;
      }

      toast.success("Application submitted!");
      navigate("/intro/teacher/pending", { replace: true });
    } catch (err: any) {
      toast.error(`Something went wrong: ${err?.message ?? "Unknown error"}`);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <button
          onClick={() => navigate("/intro/teacher")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-8 text-center">
          <p className="mb-2 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            Step 2 of 3 — Profile setup
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Tell us about yourself
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is reviewed by an admin before you get access. You'll set up your courses after approval.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Your Profile</CardTitle>
                  <CardDescription>One-time, you won't see this page again</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!checkingSignups && !signupsEnabled ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
                  <p className="text-sm font-medium text-destructive">
                    Professor registrations are currently closed
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Please contact the administrator for access.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      placeholder="Dr. Jane Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Institutional Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="jane.smith@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll email you here once your account is approved.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="institution">Institution Name</Label>
                    <Input
                      id="institution"
                      placeholder="e.g. Indian Institute of Technology, Delhi"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <Select value={department} onValueChange={setDepartment}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDepartments.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="designation">Designation</Label>
                      <Input
                        id="designation"
                        placeholder="e.g. Associate Professor"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 pt-2">
                    <Button
                      type="submit"
                      disabled={!isValid || submitting}
                      size="lg"
                      className="gap-2"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                        </>
                      ) : (
                        <>
                          Submit for Review <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                    {!isValid && !submitting && (
                      <p className="text-xs text-muted-foreground">
                        Fill in all fields to continue.
                      </p>
                    )}
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default TeacherApplicationForm;
