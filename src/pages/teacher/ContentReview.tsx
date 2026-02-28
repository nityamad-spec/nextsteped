import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ContentItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ArrowRight, ArrowLeft, Plus, Info, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ContentReview = () => {
  const navigate = useNavigate();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customContent, setCustomContent] = useState("");
  const [customDifficulty, setCustomDifficulty] = useState("Medium");
  const [customTopic, setCustomTopic] = useState("");

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAddCustom = () => {
    if (!customTitle.trim()) return;
    const newItem: ContentItem = {
      id: `custom-${Date.now()}`,
      type: "practice",
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

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">Custom Practice Problems</h1>
          <p className="text-muted-foreground">Add your own practice problems for students</p>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">AI-generated content adapts automatically</p>
            <p className="text-xs text-muted-foreground">
              Practice problems and exam simulations will be dynamically generated and personalized based on individual student responses and performance throughout the course. Use this page to add any specific custom problems you'd like to include.
            </p>
          </div>
        </div>

        {/* Custom problems list */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-medium text-muted-foreground">
              {items.length === 0 ? "No custom problems added yet" : `${items.length} custom problem${items.length > 1 ? "s" : ""}`}
            </h2>
            <Button variant="outline" size="sm" onClick={() => setAddCustomOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Custom Problem
            </Button>
          </div>

          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-4 border-primary/20">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={item.difficulty === "Easy" ? "secondary" : item.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">
                    {item.difficulty}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{item.topic}</span>
                </div>
                <button onClick={() => removeItem(item.id)} className="rounded p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive" title="Remove">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <h4 className="text-sm font-medium">{item.title}</h4>
              <p className="mt-1 text-xs text-muted-foreground">{item.content}</p>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pb-8">
          <Button variant="ghost" onClick={() => navigate("/teacher/setup/settings")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={() => navigate("/teacher/setup/publish")}>
            Next <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Add Custom Dialog */}
      <Dialog open={addCustomOpen} onOpenChange={setAddCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Practice Problem</DialogTitle>
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
