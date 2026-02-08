import { useApp } from "@/contexts/AppContext";
import { mockTopics } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Target, Flame, BookOpen, Briefcase, ArrowRight } from "lucide-react";

const StudentProgress = () => {
  const { studentProfile } = useApp();

  const learningJourney = [
    { month: "Aug 2025", level: "Beginner", active: true },
    { month: "Sep 2025", level: "Intermediate", active: false },
    { month: "Oct 2025", level: "Advanced", active: false },
    { month: "Nov 2025", level: "Expert", active: false },
  ];

  const employabilityJourney = [
    { stage: "Beginner", progress: 100, description: "Foundational concepts" },
    { stage: "Developing", progress: 45, description: "Applied skills & projects" },
    { stage: "Prepared", progress: 0, description: "Industry-ready" },
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
          <TabsTrigger value="employability"><Briefcase className="mr-1 h-4 w-4" /> Employability Readiness</TabsTrigger>
        </TabsList>

        <TabsContent value="learning" className="space-y-6">
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

          {/* Topic Mastery */}
          <Card>
            <CardHeader>
              <CardTitle>Topic Mastery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockTopics.map((topic) => (
                <div key={topic.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{topic.name}</span>
                    <span className="text-muted-foreground">{topic.mastery}%</span>
                  </div>
                  <Progress value={topic.mastery} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Stats Row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Flame className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-xl font-bold">4 days</p>
                  <p className="text-xs text-muted-foreground">Learning Streak 🔥</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Target className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xl font-bold">62%</p>
                  <p className="text-xs text-muted-foreground">Exam Readiness</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-1">What to do next</p>
                <p className="text-xs text-muted-foreground">Practice Virtual Memory concepts — your weakest area</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="employability" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Employability Journey</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {employabilityJourney.map((stage, i) => (
                <div key={stage.stage}>
                  <div className="mb-1 flex justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{stage.stage}</span>
                      {stage.progress === 100 && <Badge variant="default" className="text-[10px]">Complete</Badge>}
                      {stage.progress > 0 && stage.progress < 100 && <Badge variant="secondary" className="text-[10px]">In Progress</Badge>}
                    </div>
                    <span className="text-muted-foreground">{stage.progress}%</span>
                  </div>
                  <Progress value={stage.progress} className="h-2" />
                  <p className="mt-1 text-xs text-muted-foreground">{stage.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentProgress;