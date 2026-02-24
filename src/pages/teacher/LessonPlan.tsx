import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, FileText } from "lucide-react";

const LessonPlan = () => {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Edit Lesson Plan</h1>
        <p className="text-muted-foreground">Update your lesson content, edit existing materials, or upload new resources</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload New Materials</CardTitle>
            <CardDescription>Drag and drop or click to upload slides, notes, or supplementary materials</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border-2 border-dashed bg-muted/30 p-8 text-center space-y-3">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drag files here or click to browse</p>
              <Button variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" /> Choose Files
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Current Materials</CardTitle>
            <CardDescription>Manage your uploaded lesson materials and resources</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {["Course Syllabus — Operating Systems", "Module 1: Process Management Slides", "Module 2: Memory Management Notes", "Module 3: File Systems & Storage", "Module 4: Concurrency & Synchronization"].map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{item}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Edit</Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive">Remove</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LessonPlan;
