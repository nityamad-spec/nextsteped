import { useApp } from "@/contexts/AppContext";
import { mockTopics } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Target, Flame, BookOpen, Briefcase, Construction, BarChart3, Check } from "lucide-react";

const StudentProgress = () => {
  const { studentProfile } = useApp();
  const avgMastery = Math.round(mockTopics.reduce((sum, t) => sum + (t.mastery || 0), 0) / mockTopics.length);

  const strengths = mockTopics.filter((t) => (t.mastery || 0) >= 70).slice(0, 3);
  const weaknesses = [...mockTopics].sort((a, b) => (a.mastery || 0) - (b.mastery || 0)).slice(0, 3);

  const learningJourney = [
    { month: "Aug 2025", level: "Beginner", active: true },
    { month: "Sep 2025", level: "Progressing", active: false },
    { month: "Oct 2025", level: "Proficient", active: false },
    { month: "Nov 2025", level: "Expert", active: false },
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Your Progress</h1>
        <p className="text-muted-foreground">Track your learning journey and growth over time</p>
      </div>

      <Tabs defaultValue="learning">
        <TabsList className="mb-6">
          <TabsTrigger value="learning"><BookOpen className="mr-1 h-4 w-4" /> Learning Journey</TabsTrigger>
          <TabsTrigger value="employability">
            <Briefcase className="mr-1 h-4 w-4" /> Employability Readiness
            <Badge variant="secondary" className="ml-2 text-[10px]">WIP</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="learning" className="space-y-6">
          {/* Stats Row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xl font-bold">{avgMastery}%</p>
                  <p className="text-[11px] text-muted-foreground">Overall Mastery</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Your average understanding across all topics</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Target className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xl font-bold">62%</p>
                  <p className="text-[11px] text-muted-foreground">Exam Readiness</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">How prepared you are for your next exam</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Flame className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xl font-bold">4 days</p>
                  <p className="text-[11px] text-muted-foreground">Learning Streak</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Consecutive days you've used the platform</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Topic Strengths & Weaknesses */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Check className="h-4 w-4 text-primary" /> Topic Strengths
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {strengths.length > 0 ? strengths.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border p-2.5">
                    <span className="text-sm">{t.name}</span>
                    <Badge variant="secondary" className="text-xs">{t.mastery}%</Badge>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">Complete more sessions to identify strengths</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-accent" /> Areas to Improve
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {weaknesses.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border p-2.5">
                    <span className="text-sm">{t.name}</span>
                    <Badge variant="outline" className="text-xs">{t.mastery}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              These will keep updating as you learn and use the AI chatbot.
            </p>
          </div>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Learning Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {learningJourney.map((item, i) => (
                  <div key={item.month} className="flex items-center">
                    <div className={`flex flex-col items-center ${item.active ? "" : "opacity-40"}`}>
                      <Badge variant={item.active ? "default" : "outline"} className="text-xs">{item.level}</Badge>
                      <div className={`mt-2 h-3 w-3 rounded-full ${item.active ? "bg-primary" : "bg-muted"}`} />
                      <p className="mt-1 text-[10px] text-muted-foreground">{item.month}</p>
                      {item.active && <p className="text-[10px] text-primary font-medium">You are here</p>}
                    </div>
                    {i < learningJourney.length - 1 && (
                      <div className="mx-2 h-0.5 w-12 bg-muted sm:w-20" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employability" className="space-y-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Construction className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-heading text-xl font-semibold mb-2">Work in Progress</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Employability Readiness tracking is currently under development. Soon you'll be able to track your journey from Beginner to Industry-Prepared with personalized skill assessments.
              </p>
              <Badge variant="secondary" className="mt-4">Coming Soon</Badge>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentProgress;
