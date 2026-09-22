import { useEffect, useState } from "react";
import { Building2, IndianRupee, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useResourceLibrary } from "@/hooks/useCourseResources";
import { TIER_LABELS, type ResourceKind } from "@/lib/courseResources";

/**
 * Per-course resource selection. Professors pick which global companies and
 * compensation entries their students see on /student/resources. Selection
 * only — content itself is admin-managed.
 */
const CourseResourcesPicker = ({ courseId }: { courseId: string }) => {
  const { companies, compensation, loading } = useResourceLibrary();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [picksLoading, setPicksLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const key = (kind: ResourceKind, id: string) => `${kind}:${id}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPicksLoading(true);
      const { data } = await supabase
        .from("course_resource_picks")
        .select("resource_type, resource_id")
        .eq("course_id", courseId);
      if (cancelled) return;
      setPicked(new Set((data ?? []).map((p: any) => key(p.resource_type, p.resource_id))));
      setPicksLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const toggle = async (kind: ResourceKind, id: string) => {
    const k = key(kind, id);
    if (busy === k) return;
    setBusy(k);
    const isPicked = picked.has(k);
    const { error } = isPicked
      ? await supabase
          .from("course_resource_picks")
          .delete()
          .eq("course_id", courseId)
          .eq("resource_type", kind)
          .eq("resource_id", id)
      : await supabase
          .from("course_resource_picks")
          .insert({ course_id: courseId, resource_type: kind, resource_id: id } as any);
    setBusy(null);
    if (error) {
      toast({ title: "Could not update selection", description: error.message, variant: "destructive" });
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (isPicked) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const companyCount = companies.filter((c) => picked.has(key("company", c.id))).length;
  const compensationCount = compensation.filter((r) =>
    picked.has(key("compensation", r.id)),
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          Resources
          <Badge variant="outline" className="ml-2 text-[10px]">
            {companyCount + compensationCount} selected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Pick which companies and compensation entries your students see in their Resources tab.
          Content comes from the global library managed by the admin.
        </p>

        {loading || picksLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading library…
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Companies</p>
                <Badge variant="secondary" className="text-[10px]">
                  {companyCount} of {companies.length}
                </Badge>
              </div>
              {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground">The library is empty.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {companies.map((c) => {
                    const k = key("company", c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-accent/40"
                      >
                        <Checkbox
                          checked={picked.has(k)}
                          onCheckedChange={() => void toggle("company", c.id)}
                          disabled={busy === k}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {TIER_LABELS[c.tier]}
                            {c.pay_range ? ` · ${c.pay_range}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <IndianRupee className="h-3.5 w-3.5" /> Compensation
                </p>
                <Badge variant="secondary" className="text-[10px]">
                  {compensationCount} of {compensation.length}
                </Badge>
              </div>
              {compensation.length === 0 ? (
                <p className="text-sm text-muted-foreground">The library is empty.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {compensation.map((r) => {
                    const k = key("compensation", r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-accent/40"
                      >
                        <Checkbox
                          checked={picked.has(k)}
                          onCheckedChange={() => void toggle("compensation", r.id)}
                          disabled={busy === k}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.role_title}</span>
                          {r.total_range && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.total_range}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CourseResourcesPicker;
