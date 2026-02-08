import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mockContentItems } from "@/data/mockData";
import { ContentItem } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Flag, RefreshCw, ArrowRight, Plus, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ContentReview = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ContentItem[]>(mockContentItems);
  const [publishSection, setPublishSection] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showPublish, setShowPublish] = useState(false);

  const toggleApprove = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, approved: !i.approved } : i)));
  };
  const toggleFlag = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, flagged: !i.flagged } : i)));
  };

  const renderItem = (item: ContentItem) => (
    <div key={item.id} className={`rounded-lg border p-4 ${item.flagged ? "border-destructive/30 bg-destructive/5" : item.approved ? "border-primary/20" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={item.difficulty === "Easy" ? "secondary" : item.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">
            {item.difficulty}
          </Badge>
          <span className="text-xs text-muted-foreground">{item.topic}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => toggleApprove(item.id)} className={`rounded p-1.5 transition-colors ${item.approved ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => toggleFlag(item.id)} className={`rounded p-1.5 transition-colors ${item.flagged ? "bg-destructive text-destructive-foreground" : "hover:bg-muted"}`}>
            <Flag className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-1.5 hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <h4 className="text-sm font-medium">{item.title}</h4>
      <p className="mt-1 text-xs text-muted-foreground">{item.content}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Review Generated Content</h1>
          <p className="text-muted-foreground">Approve, edit, or flag AI-generated course content</p>
        </div>
        <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add Custom</Button>
      </div>

      <Tabs defaultValue="concepts">
        <TabsList className="mb-6">
          <TabsTrigger value="concepts">Concepts & Explanations</TabsTrigger>
          <TabsTrigger value="practice">Practice Problems</TabsTrigger>
          <TabsTrigger value="exam">Exam Simulation Bank</TabsTrigger>
        </TabsList>

        <TabsContent value="concepts" className="space-y-3">
          {items.filter((i) => i.type === "concept").map(renderItem)}
        </TabsContent>
        <TabsContent value="practice" className="space-y-3">
          {items.filter((i) => i.type === "practice").map(renderItem)}
        </TabsContent>
        <TabsContent value="exam" className="space-y-3">
          {items.filter((i) => i.type === "exam").map(renderItem)}
        </TabsContent>
      </Tabs>

      <div className="mt-8">
        {!showPublish ? (
          <Button onClick={() => setShowPublish(true)}>
            Publish Course <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Publish Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Sections</Label>
                  <Select value={publishSection} onValueChange={setPublishSection}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sections</SelectItem>
                      <SelectItem value="a">Section A</SelectItem>
                      <SelectItem value="b">Section B</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">Enrollment Code</p>
                <p className="font-mono text-lg font-bold text-primary">NEXTOS301</p>
              </div>
              <Button onClick={() => navigate("/teacher/courses/enrollment")}>
                Publish & Set Up Enrollment <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ContentReview;