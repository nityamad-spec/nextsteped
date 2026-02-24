import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mockContentItems } from "@/data/mockData";
import { ContentItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ArrowRight, ArrowLeft, Plus, Info, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ContentReview = () => {
  const navigate = useNavigate();

  const [items, setItems] = useState<ContentItem[]>(mockContentItems);
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customType, setCustomType] = useState<"practice" | "exam">("practice");
  const [customTitle, setCustomTitle] = useState("");
  const [customContent, setCustomContent] = useState("");
  const [customDifficulty, setCustomDifficulty] = useState("Medium");
  const [customTopic, setCustomTopic] = useState("");

  const practiceItems = items.filter((i) => i.type === "practice");
  const examItems = items.filter((i) => i.type === "exam");
  const allPracticeApproved = practiceItems.length > 0 && practiceItems.every((i) => i.approved);
  const allExamApproved = examItems.length > 0 && examItems.every((i) => i.approved);

  const toggleApprove = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, approved: !i.approved } : i)));
  };

  const handleAddCustom = () => {
    if (!customTitle.trim()) return;
    const newItem: ContentItem = {
      id: `custom-${Date.now()}`,
      type: customType,
      title: customTitle,
      content: customContent,
      difficulty: customDifficulty as "Easy" | "Medium" | "Hard",
      topic: customTopic || "General",
      approved: true,
      flagged: false,
    };
    setItems((prev) => [...prev, newItem]);
    setCustomTitle("");
    setCustomContent("");
    setCustomDifficulty("Medium");
    setCustomTopic("");
    setAddCustomOpen(false);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const renderItem = (item: ContentItem) => (
    <div key={item.id} className={`rounded-lg border p-4 ${item.approved ? "border-primary/20" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={item.difficulty === "Easy" ? "secondary" : item.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">
            {item.difficulty}
          </Badge>
          <span className="text-xs text-muted-foreground">{item.topic}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => toggleApprove(item.id)} className={`rounded p-1.5 transition-colors ${item.approved ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} title="Approve">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => removeItem(item.id)} className="rounded p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive" title="Remove">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <h4 className="text-sm font-medium">{item.title}</h4>
      <p className="mt-1 text-xs text-muted-foreground">{item.content}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">Review Generated Content</h1>
          <p className="text-muted-foreground">Approve, edit, or flag AI-generated course content</p>
        </div>

        {/* Personalization note */}
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">This is a starting set of content</p>
            <p className="text-xs text-muted-foreground">
              This is not an exhaustive list of problems, questions, or explanations. Content will be dynamically adjusted and personalized based on individual student responses and performance throughout the course.
            </p>
          </div>
        </div>

        <Tabs defaultValue="practice">
          <TabsList className="mb-4">
            <TabsTrigger value="practice">
              Practice Problems
              {allPracticeApproved && <Check className="ml-1.5 h-3.5 w-3.5 text-success" />}
            </TabsTrigger>
            <TabsTrigger value="exam">
              Exam Simulation
              {allExamApproved && <Check className="ml-1.5 h-3.5 w-3.5 text-success" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="practice" className="space-y-3">
            <div className="flex justify-end gap-2 mb-1">
              <Button variant="outline" size="sm" onClick={() => { setCustomType("practice"); setAddCustomOpen(true); }}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Custom
              </Button>
              <Button variant="outline" size="sm" onClick={() => setItems(prev => prev.map(i => i.type === "practice" ? { ...i, approved: true } : i))}>
                <Check className="mr-1 h-3.5 w-3.5" /> Approve All
              </Button>
            </div>
            {practiceItems.map(renderItem)}
          </TabsContent>
          <TabsContent value="exam" className="space-y-3">
            <div className="flex justify-end gap-2 mb-1">
              <Button variant="outline" size="sm" onClick={() => { setCustomType("exam"); setAddCustomOpen(true); }}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Custom
              </Button>
              <Button variant="outline" size="sm" onClick={() => setItems(prev => prev.map(i => i.type === "exam" ? { ...i, approved: true } : i))}>
                <Check className="mr-1 h-3.5 w-3.5" /> Approve All
              </Button>
            </div>
            {examItems.map(renderItem)}
          </TabsContent>
        </Tabs>

        {/* Approval status message */}
        {!(allPracticeApproved && allExamApproved) && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-center">
            <p className="text-sm text-warning">
              {!allPracticeApproved && !allExamApproved
                ? "Approve all practice problems and exam simulations to proceed."
                : !allPracticeApproved
                  ? "Approve all practice problems to proceed."
                  : "Approve all exam simulations to proceed."}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pb-8">
          <Button variant="ghost" onClick={() => navigate("/teacher/setup/settings")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={() => navigate("/teacher/setup/publish")} disabled={!(allPracticeApproved && allExamApproved)}>
            Next <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Add Custom Dialog */}
      <Dialog open={addCustomOpen} onOpenChange={setAddCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom {customType === "practice" ? "Practice Problem" : "Exam Simulation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="Enter title..." value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Enter description..." value={customContent} onChange={(e) => setCustomContent(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Topic</Label>
                <Input placeholder="e.g. Memory Management" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={customDifficulty} onValueChange={setCustomDifficulty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddCustomOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCustom} disabled={!customTitle.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContentReview;
