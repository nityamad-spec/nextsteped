import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MailX, CheckCircle2, AlertTriangle } from "lucide-react";

type State = "loading" | "valid" | "used" | "invalid" | "submitting" | "done" | "error";

const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setState("invalid");
        return;
      }
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState("invalid");
          setMessage(data?.error || "This unsubscribe link is no longer valid.");
          return;
        }
        if (data?.alreadyUnsubscribed || data?.used) {
          setState("used");
          return;
        }
        setState("valid");
      } catch {
        setState("invalid");
        setMessage("We couldn't verify this link. Please try again later.");
      }
    };
    validate();
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    const { error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    if (error) {
      setState("error");
      setMessage("Something went wrong. Please try again.");
      return;
    }
    setState("done");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            {state === "done" || state === "used" ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : state === "invalid" || state === "error" ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <MailX className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <CardTitle className="font-heading">
            {state === "done" || state === "used" ? "You're unsubscribed" : "Unsubscribe from emails"}
          </CardTitle>
          <CardDescription>
            {state === "loading" && "Checking your link…"}
            {state === "valid" && "Confirm to stop receiving emails from NextStep at this address."}
            {state === "submitting" && "Updating your preferences…"}
            {state === "done" && "You will no longer receive emails from NextStep at this address."}
            {state === "used" && "This address is already unsubscribed."}
            {(state === "invalid" || state === "error") && (message || "This unsubscribe link is not valid.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {state === "loading" || state === "submitting" ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : state === "valid" ? (
            <Button onClick={confirm}>Confirm unsubscribe</Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default Unsubscribe;
