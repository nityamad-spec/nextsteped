// Phase 6 — Reasoning follow-up analytics view.
// Course-scoped. Aggregates come from the SECURITY DEFINER SQL function
// public.reasoning_followup_analytics(_course_id) which is gated by
// is_course_member(). No per-student data is surfaced.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCcw, AlertTriangle, TrendingUp, TrendingDown, ShieldCheck } from "lucide-react";

interface PerItem {
  reasoning_question_id: string;
  parent_question_id: string | null;
  parent_stem: string | null;
  concept_code: string | null;
  bloom: number | null;
  attempts: number;
  correct: number;
  pct: number | null;
  flagged: boolean;
}
interface Coverage {
  bloom3_correct_primary_answers: number;
  followup_answered: number;
  no_followup_exists: number;
  followup_null: number;
}
interface Impact {
  boost_count: number;
  penalty_count: number;
  neutral_count: number;
  expected_mastery_delta: number;
}
interface Thresholds {
  min_correct_pct: number;
  min_attempts: number;
}
interface Payload {
  per_item: PerItem[];
  coverage: Coverage;
  impact: Impact;
  thresholds: Thresholds;
}

interface Props {
  courseId: string | null;
}

const pctFmt = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

const ReasoningFollowupAnalytics = ({ courseId }: Props) => {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    const { data: rpc, error: err } = await supabase.rpc(
      // @ts-expect-error - types regenerate after migration
      "reasoning_followup_analytics",
      { _course_id: courseId },
    );
    if (err) {
      setError(err.message);
    } else {
      setData(rpc as unknown as Payload);
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!courseId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Select a course to see reasoning follow-up analytics.
        </CardContent>
      </Card>
    );
  }

  const coverageDenom = data?.coverage.bloom3_correct_primary_answers ?? 0;
  const coveragePct =
    coverageDenom > 0 ? Math.round(((data?.coverage.followup_answered ?? 0) / coverageDenom) * 100) : null;

  const impactTotal =
    (data?.impact.boost_count ?? 0) + (data?.impact.penalty_count ?? 0) + (data?.impact.neutral_count ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reasoning follow-ups</h2>
          <p className="text-xs text-muted-foreground">
            Fairness, coverage, and mastery impact of Bloom-3+ reasoning questions.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">Error: {error}</CardContent>
        </Card>
      )}

      {/* Coverage + Impact tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Follow-up coverage</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">{coveragePct === null ? "—" : `${coveragePct}%`}</div>
            <p className="text-xs text-muted-foreground">
              {data?.coverage.followup_answered ?? 0} / {coverageDenom} correct Bloom-3+ primaries had a follow-up
              answered
            </p>
            {(data?.coverage.no_followup_exists ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                Missing follow-up (drop/demote): {data?.coverage.no_followup_exists}
              </p>
            )}
            {(data?.coverage.followup_null ?? 0) > 0 && (
              <p className="text-xs text-amber-600">
                Load/render gaps (null): {data?.coverage.followup_null}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Boost vs penalty</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-emerald-600">{data?.impact.boost_count ?? 0}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-2xl font-bold text-amber-600">{data?.impact.penalty_count ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Boost fires (both correct) vs penalty fires (correct primary + wrong reasoning). Neutral:{" "}
              {data?.impact.neutral_count ?? 0}. Total answers: {impactTotal}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expected mastery Δ</CardTitle>
            {(data?.impact.expected_mastery_delta ?? 0) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">
              {(data?.impact.expected_mastery_delta ?? 0) > 0 ? "+" : ""}
              {(data?.impact.expected_mastery_delta ?? 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              boost × 0.5 − penalty × 0.25, aggregate over course. Informational only — students never see this.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-item table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-item reasoning correctness</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sorted worst-first. Flagged rows are below {Math.round((data?.thresholds.min_correct_pct ?? 0.2) * 100)}%
            correct with at least {data?.thresholds.min_attempts ?? 5} responses — likely bad questions penalising
            students; review or replace them.
          </p>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data?.per_item.length ? (
            <p className="text-sm text-muted-foreground">No reasoning follow-ups have been generated yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Flag</TableHead>
                  <TableHead className="w-24">Concept</TableHead>
                  <TableHead className="w-16">Bloom</TableHead>
                  <TableHead>Parent stem</TableHead>
                  <TableHead className="w-20 text-right">Attempts</TableHead>
                  <TableHead className="w-20 text-right">Correct</TableHead>
                  <TableHead className="w-16 text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.per_item.map((row) => (
                  <TableRow key={row.reasoning_question_id}>
                    <TableCell>
                      {row.flagged ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Review
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">OK</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{row.concept_code ?? "—"}</code>
                    </TableCell>
                    <TableCell className="text-xs">{row.bloom ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate" title={row.parent_stem ?? ""}>
                      {row.parent_stem ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">{row.attempts}</TableCell>
                    <TableCell className="text-right text-xs">{row.correct}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{pctFmt(row.pct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReasoningFollowupAnalytics;
export type { Payload as ReasoningFollowupPayload };
