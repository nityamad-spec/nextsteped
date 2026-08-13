import { useState } from "react";
import { motion } from "framer-motion";
import { Newspaper, ExternalLink, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/extractFunctionError";

interface NewsItem {
  headline: string;
  summary: string;
  concept: string;
  url: string;
  source?: string;
  published_at?: string | null;
}

interface WhatsNewCardProps {
  courseId: string | null;
  courseName?: string | null;
}

const todayLabel = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WhatsNewCard({ courseId, courseName }: WhatsNewCardProps) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!courseId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("course-news", {
        body: { course_id: courseId },
      });
      if (fnError) {
        setError(await extractFunctionError(fnError, "Could not load today's news."));
        return;
      }
      const list = (data as { items?: NewsItem[] } | null)?.items ?? [];
      if (list.length === 0) {
        setError("No relevant news found for your course today.");
        return;
      }
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load today's news.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="mb-6"
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-3 text-base">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Newspaper className="h-4 w-4" />
                </span>
                What's new
              </CardTitle>
              <CardDescription className="mt-1">
                {todayLabel}
                {courseName ? ` · ${courseName}` : ""}
              </CardDescription>
            </div>
            {items && (
              <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg border p-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
              <Button variant="outline" size="sm" onClick={generate} disabled={!courseId}>
                Try again
              </Button>
            </div>
          )}

          {!loading && !error && !items && (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
              <p className="text-sm text-muted-foreground">
                Get today's news and updates from the world related to the concepts in your course.
              </p>
              <Button size="sm" onClick={generate} disabled={!courseId}>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate today's news
              </Button>
            </div>
          )}

          {!loading && !error && items && (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const date = formatDate(item.published_at);
                return (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-snug">{item.headline}</h3>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {item.concept}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {[item.source, date].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default WhatsNewCard;
