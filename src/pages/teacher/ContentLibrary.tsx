import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Globe, Download, ExternalLink, Upload, BookOpen, Presentation, FileSpreadsheet } from "lucide-react";

const uploadedFiles = [
  { id: "u1", name: "CS301_Syllabus_Fall2025.pdf", type: "Syllabus", size: "2.4 MB", uploadedAt: "Aug 10, 2025", icon: FileText },
  { id: "u2", name: "Module1_Process_Management_Slides.pptx", type: "Slides", size: "8.1 MB", uploadedAt: "Aug 10, 2025", icon: Presentation },
  { id: "u3", name: "Module2_Memory_Management_Slides.pptx", type: "Slides", size: "6.7 MB", uploadedAt: "Aug 10, 2025", icon: Presentation },
  { id: "u4", name: "Past_Midterm_Exam_2024.pdf", type: "Past Exam", size: "1.2 MB", uploadedAt: "Aug 10, 2025", icon: FileText },
  { id: "u5", name: "Problem_Set_1_Scheduling.pdf", type: "Problem Set", size: "540 KB", uploadedAt: "Aug 10, 2025", icon: FileSpreadsheet },
  { id: "u6", name: "Textbook_Readings_Ch1-4.pdf", type: "Reading", size: "15.3 MB", uploadedAt: "Aug 10, 2025", icon: BookOpen },
];

const webResources = [
  { id: "w1", title: "Operating Systems: Three Easy Pieces", source: "ostep.org", category: "Textbook", description: "Free online textbook covering virtualization, concurrency, and persistence. Excellent supplement for Modules 1-4.", url: "#", relevance: "High" },
  { id: "w2", title: "MIT 6.828: Operating System Engineering", source: "MIT OpenCourseWare", category: "Course Material", description: "Lab-based OS course with xv6. Great reference for hands-on exercises on process management and file systems.", url: "#", relevance: "High" },
  { id: "w3", title: "CPU Scheduling Algorithms Visualizer", source: "github.com", category: "Interactive Tool", description: "Interactive web tool for visualizing FCFS, SJF, Round Robin, and Priority scheduling. Helps students understand time quantum effects.", url: "#", relevance: "High" },
  { id: "w4", title: "Page Replacement Algorithm Simulator", source: "educative.io", category: "Interactive Tool", description: "Step-by-step visualization of FIFO, LRU, and Optimal page replacement with custom reference strings.", url: "#", relevance: "Medium" },
  { id: "w5", title: "Modern Operating Systems by Tanenbaum — Lecture Notes", source: "university-resources.org", category: "Lecture Notes", description: "Comprehensive lecture notes aligned with Tanenbaum's textbook. Covers deadlocks and synchronization in depth.", url: "#", relevance: "Medium" },
  { id: "w6", title: "Linux Kernel Development Guide", source: "kernel.org", category: "Professional Development", description: "Understanding real-world OS implementation. Useful for upskilling on modern kernel design patterns.", url: "#", relevance: "Medium" },
  { id: "w7", title: "Concurrency Patterns in Modern Systems", source: "acm.org", category: "Research Paper", description: "Recent survey on concurrency models — helps update syllabus with current industry approaches to synchronization.", url: "#", relevance: "Low" },
];

const ContentLibrary = () => {
  const [tab, setTab] = useState("uploaded");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-bold">Content Library</h1>
        <p className="text-muted-foreground">Your uploaded materials and curated web resources for course improvement</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="uploaded"><Upload className="mr-1 h-4 w-4" /> Uploaded Materials</TabsTrigger>
          <TabsTrigger value="web"><Globe className="mr-1 h-4 w-4" /> Web-Sourced Resources</TabsTrigger>
        </TabsList>

        <TabsContent value="uploaded" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Uploaded Files</CardTitle>
              <CardDescription>Syllabus, slides, problem sets, and other teaching materials you've uploaded</CardDescription>
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
        </TabsContent>

        <TabsContent value="web" className="space-y-3">
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Globe className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">AI-Curated Resources</p>
              <p className="text-xs text-muted-foreground">
                These web resources were selected based on your course syllabus and objectives. Use them to improve your course materials, create better student resources, or upskill on modern topics.
              </p>
            </div>
          </div>

          {webResources.map((resource) => (
            <Card key={resource.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium">{resource.title}</h3>
                      <Badge variant={resource.relevance === "High" ? "default" : resource.relevance === "Medium" ? "secondary" : "outline"} className="text-[10px]">
                        {resource.relevance} Relevance
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{resource.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{resource.category}</Badge>
                      <span className="text-[10px] text-muted-foreground">{resource.source}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-xs shrink-0">
                    <ExternalLink className="mr-1 h-3 w-3" /> View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContentLibrary;
