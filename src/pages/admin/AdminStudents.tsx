import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Check, ChevronDown, Download, Filter, GraduationCap, Loader2, MoreHorizontal, Search, ShieldOff, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import StudentProfileDialog from "@/components/admin/StudentProfileDialog";
import { exportStudentsToExcel } from "@/lib/exportStudentsToExcel";

const MASTERY_ORDER = ["beginner", "developing", "proficient", "expert"];
const sortMastery = (a: string, b: string) => {
  const ai = MASTERY_ORDER.indexOf(a.toLowerCase());
  const bi = MASTERY_ORDER.indexOf(b.toLowerCase());
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b);
};

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  width?: string;
}

const MultiSelectFilter = ({ label, options, selected, onChange, width = "w-56" }: MultiSelectProps) => {
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Filter className="h-3.5 w-3.5" />
          <span>{label}</span>
          {selected.size > 0 && <Badge variant="secondary" className="h-5 px-1.5">{selected.size}</Badge>}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", width)} align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>None found.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => {
                const checked = selected.has(opt);
                return (
                  <CommandItem key={opt} onSelect={() => toggle(opt)} className="cursor-pointer">
                    <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded border", checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40")}>
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <span className="capitalize">{opt}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

interface CourseEnrollment {
  courseId: string;
  name: string;
  mastery: string | null;
  enrolledAt: string;
}

interface StudentGroup {
  key: string;
  profileIds: string[];
  primaryProfileId: string;
  name: string;
  email: string | null;
  roll_number: string | null;
  created_at: string;
  suspended_at: string | null;
  courses: CourseEnrollment[];
}

const relativeDate = (iso: string) => {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const day = 86_400_000;
  if (diff < day) return "today";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
};

const AdminStudents = () => {
  const [students, setStudents] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<StudentGroup | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<StudentGroup | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [search, setSearch] = useState("");
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [courseFilter, setCourseFilter] = useState<Set<string>>(new Set());
  const [masteryFilter, setMasteryFilter] = useState<Set<string>>(new Set());
  const [profileTarget, setProfileTarget] = useState<StudentGroup | null>(null);
  const [exporting, setExporting] = useState(false);
  
  
  const { toast } = useToast();

  const toggleRow = (key: string) => {
    setOpenRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const fetch = async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email, roll_number, created_at, suspended_at")
        .eq("role", "student")
        .order("created_at", { ascending: false });

      if (!profiles) { setLoading(false); return; }

      const studentIdSet = new Set(profiles.map(p => p.id));

      // PostgREST caps each response at 1000 rows. Enrollments/mastery tables
      // now exceed that, so paginate with .range() until we've drained them.
      const fetchAll = async <T,>(
        table: "enrollments" | "student_course_mastery",
        columns: string,
        orderCol: string,
      ): Promise<T[]> => {
        const pageSize = 1000;
        let from = 0;
        const out: T[] = [];
        // Safety cap in case of a runaway loop.
        for (let i = 0; i < 100; i++) {
          const { data, error } = await supabase
            .from(table)
            .select(columns)
            .order(orderCol, { ascending: true })
            .range(from, from + pageSize - 1);
          if (error || !data) break;
          out.push(...(data as unknown as T[]));
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return out;
      };

      const [allEnrollments, allMastery] = await Promise.all([
        fetchAll<{ student_id: string; course_id: string; enrolled_at: string }>(
          "enrollments", "student_id, course_id, enrolled_at", "student_id",
        ),
        fetchAll<{ student_id: string; course_id: string; learner_level: string }>(
          "student_course_mastery", "student_id, course_id, learner_level", "student_id",
        ),
      ]);

      const enrollments = allEnrollments.filter(e => studentIdSet.has(e.student_id));
      const masteryRows = allMastery.filter(m => studentIdSet.has(m.student_id));

      const courseIds = [...new Set((enrollments || []).map(e => e.course_id))];
      const { data: courses } = courseIds.length
        ? await supabase.from("courses").select("id, name").in("id", courseIds)
        : { data: [] };

      const courseMap = Object.fromEntries((courses || []).map(c => [c.id, c.name]));
      const masteryMap = new Map<string, string>();
      (masteryRows || []).forEach(m => {
        masteryMap.set(`${m.student_id}:${m.course_id}`, m.learner_level);
      });

      const enrollmentsByStudent = new Map<string, CourseEnrollment[]>();
      (enrollments || []).forEach(e => {
        const arr = enrollmentsByStudent.get(e.student_id) || [];
        arr.push({
          courseId: e.course_id,
          name: courseMap[e.course_id] || "Unknown",
          mastery: masteryMap.get(`${e.student_id}:${e.course_id}`) || null,
          enrolledAt: e.enrolled_at,
        });
        enrollmentsByStudent.set(e.student_id, arr);
      });

      const groups = new Map<string, StudentGroup>();
      for (const p of profiles) {
        const key = p.email ? `email:${p.email.trim().toLowerCase()}` : `id:${p.id}`;
        const existing = groups.get(key);
        const profileCourses = enrollmentsByStudent.get(p.id) || [];
        if (!existing) {
          groups.set(key, {
            key,
            profileIds: [p.id],
            primaryProfileId: p.id,
            name: p.name,
            email: p.email,
            roll_number: p.roll_number,
            created_at: p.created_at,
            suspended_at: (p as any).suspended_at ?? null,
            courses: [...profileCourses],
          });
        } else {
          existing.profileIds.push(p.id);
          existing.courses.push(...profileCourses);
          if (new Date(p.created_at) < new Date(existing.created_at)) {
            existing.created_at = p.created_at;
          }
          if (!existing.roll_number && p.roll_number) existing.roll_number = p.roll_number;
          if (!existing.suspended_at && (p as any).suspended_at) existing.suspended_at = (p as any).suspended_at;
        }
      }

      const final = Array.from(groups.values()).map(g => {
        const seen = new Set<string>();
        const deduped: CourseEnrollment[] = [];
        for (const c of g.courses.sort((a, b) => new Date(b.enrolledAt).getTime() - new Date(a.enrolledAt).getTime())) {
          if (seen.has(c.courseId)) continue;
          seen.add(c.courseId);
          deduped.push(c);
        }
        g.courses = deduped;
        return g;
      });

      final.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setStudents(final);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleDelete = async () => {
    if (!target) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: target.primaryProfileId, role: "student" },
    });
    setDeleting(false);
    if (error || (data as any)?.error) {
      toast({ title: "Delete failed", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Student deleted", description: `${target.name} has been removed.` });
    setStudents(prev => prev.filter(s => s.key !== target.key));
    setTarget(null);
    setConfirmText("");
  };

  const handleSuspendToggle = async () => {
    if (!suspendTarget) return;
    const willSuspend = !suspendTarget.suspended_at;
    setSuspending(true);
    const { data, error } = await supabase.functions.invoke("admin-set-student-suspension", {
      body: { user_id: suspendTarget.primaryProfileId, suspended: willSuspend },
    });
    setSuspending(false);
    if (error || (data as any)?.error) {
      toast({
        title: willSuspend ? "Suspend failed" : "Reactivate failed",
        description: (data as any)?.error || error?.message,
        variant: "destructive",
      });
      return;
    }
    const newVal = (data as any)?.suspended_at ?? null;
    setStudents(prev => prev.map(s => s.key === suspendTarget.key ? { ...s, suspended_at: newVal } : s));
    toast({
      title: willSuspend ? "Student suspended" : "Student reactivated",
      description: willSuspend
        ? `${suspendTarget.name} can no longer sign in. Data is preserved.`
        : `${suspendTarget.name} can sign in again.`,
    });
    setSuspendTarget(null);
  };

  const courseOptions = useMemo(() => {
    const s = new Set<string>();
    students.forEach(st => st.courses.forEach(c => s.add(c.name)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [students]);

  const masteryOptions = useMemo(() => {
    const s = new Set<string>();
    students.forEach(st => st.courses.forEach(c => c.mastery && s.add(c.mastery)));
    return [...s].sort(sortMastery);
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter(s => {
      if (q) {
        const hit = s.name?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.roll_number?.toLowerCase().includes(q) ||
          s.courses.some(c => c.name.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (courseFilter.size > 0) {
        const names = new Set(s.courses.map(c => c.name));
        for (const c of courseFilter) if (!names.has(c)) return false;
      }
      if (masteryFilter.size > 0) {
        const pool = courseFilter.size > 0
          ? s.courses.filter(c => courseFilter.has(c.name))
          : s.courses;
        if (!pool.some(c => c.mastery && masteryFilter.has(c.mastery))) return false;
      }
      if (statusFilter === "active" && s.suspended_at) return false;
      if (statusFilter === "suspended" && !s.suspended_at) return false;
      return true;
    });
  }, [students, search, courseFilter, masteryFilter, statusFilter]);

  const hasMultiAccount = useMemo(() => students.some(s => s.profileIds.length > 1), [students]);
  const suspendedCount = useMemo(() => students.filter(s => s.suspended_at).length, [students]);
  const filtersActive = search.length > 0 || courseFilter.size > 0 || masteryFilter.size > 0 || statusFilter !== "all";
  const clearAll = () => {
    setSearch("");
    setCourseFilter(new Set());
    setMasteryFilter(new Set());
    setStatusFilter("all");
  };

  const handleExport = async () => {
    if (exporting || filtered.length === 0) return;
    setExporting(true);
    try {
      const n = await exportStudentsToExcel(filtered);
      toast({ title: "Export ready", description: `Exported ${n} student${n === 1 ? "" : "s"} to Excel.` });
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;

  const expectedConfirm = (target?.email || target?.name || "").trim();
  const confirmOk = confirmText.trim().toLowerCase() === expectedConfirm.toLowerCase() && expectedConfirm.length > 0;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">All Students</h2>
        <p className="text-muted-foreground">Grouped by email — each student appears once with all their enrollments.</p>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Students
              <Badge variant="secondary" className="ml-1">{students.length}</Badge>
              {hasMultiAccount && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  some emails share multiple accounts
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2"
                onClick={handleExport}
                disabled={exporting || filtered.length === 0}
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? "Exporting…" : "Export to Excel"}
              </Button>
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, roll, course…"
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <MultiSelectFilter
              label="Courses"
              options={courseOptions}
              selected={courseFilter}
              onChange={setCourseFilter}
              width="w-64"
            />
            <MultiSelectFilter
              label="Mastery"
              options={masteryOptions}
              selected={masteryFilter}
              onChange={setMasteryFilter}
            />
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {(["all", "active", "suspended"] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusFilter(k)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-sm capitalize transition-colors",
                    statusFilter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {k}{k === "suspended" && suspendedCount > 0 ? ` (${suspendedCount})` : ""}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Courses use AND (must be in all selected). Mastery uses OR (any selected level matches).
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground tabular-nums">
                Showing {filtered.length} of {students.length}
              </span>
              {filtersActive && (
                <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={clearAll}>
                  <X className="h-3.5 w-3.5" /> Clear filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <GraduationCap className="h-8 w-8 mb-2 opacity-60" />
              <p className="text-sm">{students.length === 0 ? "No students registered yet" : "No students match your filters"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roll Number</TableHead>
                    <TableHead>Courses</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s, idx) => {
                    const multiAccount = s.profileIds.length > 1;
                    const isOpen = openRows.has(s.key);
                    return (
                      <TableRow
                        key={s.key}
                        onClick={() => setProfileTarget(s)}
                        className={cn(idx % 2 === 1 && "bg-muted/20", "hover:bg-muted/40 transition-colors cursor-pointer")}
                      >
                        <TableCell className={cn("font-medium align-top", s.suspended_at && "opacity-60")}>
                          <div className="flex items-center gap-2">
                            <span>{s.name}</span>
                            {s.suspended_at && (
                              <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 gap-1">
                                <ShieldOff className="h-3 w-3" /> Suspended
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]" title={s.email || ""}>
                              {s.email || "—"}
                            </span>
                            {multiAccount && (
                              <Badge variant="outline" className="text-[10px]">{s.profileIds.length}×</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm">{s.roll_number || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="align-top">
                          {s.courses.length === 0 ? (
                            <Badge variant="outline" className="text-muted-foreground font-normal">Not enrolled</Badge>
                          ) : (
                            <Collapsible open={isOpen} onOpenChange={() => toggleRow(s.key)}>
                              <CollapsibleTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <BookOpen className="h-3.5 w-3.5" />
                                  <span className="text-xs">{s.courses.length} course{s.courses.length === 1 ? "" : "s"}</span>
                                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2">
                                <div className="rounded-md border bg-muted/30 divide-y">
                                  {s.courses.map(c => (
                                    <div key={c.courseId} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                                      <span className="font-medium text-foreground">{c.name}</span>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {c.mastery ? (
                                          <Badge variant="secondary" className="text-[10px]">{c.mastery}</Badge>
                                        ) : (
                                          <span className="text-[10px] text-muted-foreground italic">no mastery yet</span>
                                        )}
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                              {relativeDate(c.enrolledAt)}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>joined {new Date(c.enrolledAt).toLocaleString()}</TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground tabular-nums">{relativeDate(s.created_at)}</span>
                            </TooltipTrigger>
                            <TooltipContent>{new Date(s.created_at).toLocaleString()}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {s.suspended_at ? (
                                <DropdownMenuItem onClick={() => setSuspendTarget(s)}>
                                  <ShieldCheck className="h-4 w-4 mr-2" /> Reactivate access
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setSuspendTarget(s)}>
                                  <ShieldOff className="h-4 w-4 mr-2" /> Suspend access
                                </DropdownMenuItem>
                              )}
                              {multiAccount ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <DropdownMenuItem disabled className="text-muted-foreground">
                                        <Trash2 className="h-4 w-4 mr-2" /> Delete user
                                      </DropdownMenuItem>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Multiple accounts share this email — resolve in DB</TooltipContent>
                                </Tooltip>
                              ) : (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => { setTarget(s); setConfirmText(""); }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete user
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete student</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will permanently delete <strong>{target?.name}</strong>{target?.email ? ` (${target.email})` : ""},
                  including their enrollments, assessment results, diagnostic results, feedback, and chat history.
                  This cannot be undone.
                </p>
                <div className="pt-2">
                  <Label htmlFor="confirm" className="text-xs">
                    Type <code className="text-foreground">{expectedConfirm}</code> to confirm
                  </Label>
                  <Input
                    id="confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    className="mt-1"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmOk || deleting}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!suspendTarget} onOpenChange={(o) => { if (!o) setSuspendTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendTarget?.suspended_at ? "Reactivate student access?" : "Suspend student access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendTarget?.suspended_at ? (
                <>
                  <span className="font-medium text-foreground">{suspendTarget?.name}</span> will be able to sign in again immediately.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{suspendTarget?.name}</span> will be signed out and blocked from signing in.
                  All of their data (enrollments, results, chats) is preserved and can be restored at any time by reactivating.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={suspending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleSuspendToggle(); }} disabled={suspending}>
              {suspending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {suspendTarget?.suspended_at ? "Reactivate" : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StudentProfileDialog
        student={profileTarget}
        open={!!profileTarget}
        onOpenChange={(o) => { if (!o) setProfileTarget(null); }}
      />
    </div>
    </TooltipProvider>
  );
};

export default AdminStudents;
