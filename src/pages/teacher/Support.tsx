import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, Building2, Headphones, Send, Check, ShieldAlert } from "lucide-react";


const Support = () => {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");
  const restrictedFromCreating = reason === "course-create-restricted";

  const [adminSubject, setAdminSubject] = useState(
    restrictedFromCreating ? "Requesting permission to create courses" : ""
  );
  const [adminMessage, setAdminMessage] = useState(
    restrictedFromCreating
      ? "Hi, I don't currently have permission to create new courses. Could you please grant me access?"
      : ""
  );
  const [adminSent, setAdminSent] = useState(false);


  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSent, setSupportSent] = useState(false);

  const handleAdminSend = () => {
    if (!adminSubject.trim() || !adminMessage.trim()) return;
    setAdminSent(true);
    setTimeout(() => {
      setAdminSent(false);
      setAdminSubject("");
      setAdminMessage("");
    }, 3000);
  };

  const handleSupportSend = () => {
    if (!supportSubject.trim() || !supportMessage.trim()) return;
    setSupportSent(true);
    setTimeout(() => {
      setSupportSent(false);
      setSupportSubject("");
      setSupportMessage("");
    }, 3000);
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Support</h1>
        <p className="text-muted-foreground">Contact your institution's administrator or the NextStep team</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Contact School Administrator</CardTitle>
            <CardDescription>Send a message to your institution's IT or academic administrator</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">admin@university.edu</p>
                <p className="text-xs text-muted-foreground">University IT Department</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input placeholder="e.g., Access issue, account request..." value={adminSubject} onChange={(e) => setAdminSubject(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Describe your issue or request..."
                value={adminMessage}
                onChange={(e) => setAdminMessage(e.target.value)}
              />
            </div>
            <Button onClick={handleAdminSend} disabled={!adminSubject.trim() || !adminMessage.trim()}>
              {adminSent ? <><Check className="mr-2 h-4 w-4" /> Sent!</> : <><Send className="mr-2 h-4 w-4" /> Send to Admin</>}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Headphones className="h-5 w-5" /> NextStep Customer Service</CardTitle>
            <CardDescription>Get help from the NextStep team for platform-related questions or issues</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">support@nextstep.ai</p>
                <p className="text-xs text-muted-foreground">NextStep Support Team</p>
              </div>
              
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input placeholder="e.g., Feature request, bug report..." value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Describe your issue or request..."
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
              />
            </div>
            <Button onClick={handleSupportSend} disabled={!supportSubject.trim() || !supportMessage.trim()}>
              {supportSent ? <><Check className="mr-2 h-4 w-4" /> Sent!</> : <><Send className="mr-2 h-4 w-4" /> Send to NextStep</>}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Support;
