import ComingSoon from "@/components/ComingSoon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Target, User, MessageSquare } from "lucide-react";

const Employers = () => (
  <ComingSoon
    title="Employers"
    description="Discover employers hiring for your target role, see required skills, and connect with current employees."
    badgeText="Coming Later"
    previewContent={
      <div className="space-y-3">
        {[
          { name: "Google", role: "SDE II", skills: ["System Design", "DSA", "OS"], match: 68 },
          { name: "Microsoft", role: "SDE", skills: ["Distributed Systems", "C++", "OS"], match: 55 },
          { name: "Amazon", role: "SDE I", skills: ["DSA", "Leadership Principles", "System Design"], match: 72 },
        ].map((emp) => (
          <Card key={emp.name}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{emp.name} — {emp.role}</p>
                  <div className="mt-1 flex gap-1">
                    {emp.skills.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-primary">{emp.match}%</p>
                <p className="text-[10px] text-muted-foreground">Skill Match</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    }
  />
);

export default Employers;