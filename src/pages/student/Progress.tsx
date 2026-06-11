import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Construction } from "lucide-react";

const StudentProgress = () => {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Your Progress</h1>
        <p className="text-muted-foreground">Track your learning journey and growth over time</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-heading text-xl font-semibold mb-2">Coming Soon</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            A personalized progress view — built from your real chat activity, quiz attempts, and concept mastery — is on the way. In the meantime, your live concept mastery is shown on your Home page.
          </p>
          <Badge variant="secondary" className="mt-4">In Development</Badge>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentProgress;
