import ComingSoon from "@/components/ComingSoon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MessageSquare, FileText, Users, BookOpen } from "lucide-react";

const InterviewPrep = () => (
  <ComingSoon
    title="Interview Prep"
    description="Practice behavioral and technical interviews with AI-powered simulations. Voice and text modes available."
    badgeText="Coming Soon"
    previewContent={
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Behavioral Practice</span>
              </div>
              <p className="text-xs text-muted-foreground">STAR method, leadership, conflict resolution</p>
              <div className="mt-2 flex gap-1">
                <Badge variant="outline" className="text-[10px]">Voice</Badge>
                <Badge variant="outline" className="text-[10px]">Text</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">Technical Practice</span>
              </div>
              <p className="text-xs text-muted-foreground">DSA, SQL, system design, OOP concepts</p>
              <div className="mt-2 flex gap-1">
                <Badge variant="outline" className="text-[10px]">Voice</Badge>
                <Badge variant="outline" className="text-[10px]">Text</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-3 text-center">
              <FileText className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-xs font-medium">Resume Guide</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Users className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-xs font-medium">Behavioral 101</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <BookOpen className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-xs font-medium">Custom Guides</p>
            </CardContent>
          </Card>
        </div>
      </div>
    }
  />
);

export default InterviewPrep;