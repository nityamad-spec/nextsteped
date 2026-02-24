import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, BookOpen, Presentation, FileSpreadsheet, Upload } from "lucide-react";

const uploadedFiles = [
  { id: "u1", name: "CS301_Syllabus_Fall2025.pdf", type: "Syllabus", size: "2.4 MB", uploadedAt: "Aug 10, 2025", icon: FileText },
  { id: "u2", name: "Module1_Process_Management_Slides.pptx", type: "Slides", size: "8.1 MB", uploadedAt: "Aug 10, 2025", icon: Presentation },
  { id: "u3", name: "Module2_Memory_Management_Slides.pptx", type: "Slides", size: "6.7 MB", uploadedAt: "Aug 10, 2025", icon: Presentation },
  { id: "u4", name: "Past_Midterm_Exam_2024.pdf", type: "Past Exam", size: "1.2 MB", uploadedAt: "Aug 10, 2025", icon: FileText },
  { id: "u5", name: "Problem_Set_1_Scheduling.pdf", type: "Problem Set", size: "540 KB", uploadedAt: "Aug 10, 2025", icon: FileSpreadsheet },
  { id: "u6", name: "Textbook_Readings_Ch1-4.pdf", type: "Reading", size: "15.3 MB", uploadedAt: "Aug 10, 2025", icon: BookOpen },
];

const ContentLibrary = () => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-bold">Content Library</h1>
        <p className="text-muted-foreground">Your uploaded materials for the course</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Your Uploaded Files</CardTitle>
              <CardDescription>Syllabus, slides, problem sets, and other teaching materials you've uploaded</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Upload className="mr-2 h-4 w-4" /> Upload New
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {uploadedFiles.map((file) => (
            <div key={file.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <file.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{file.type} • {file.size} • Uploaded {file.uploadedAt}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default ContentLibrary;
