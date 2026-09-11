import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";

/** Visual-only placeholder for the daily problem feature. */
const DailyDsaCard = () => (
  <Card className="h-full">
    <CardContent className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Daily DSA · Day 42
        </p>
        <Badge variant="secondary" className="gap-1">
          <Flame className="h-3 w-3" /> 12
        </Badge>
      </div>

      <p className="mt-2 text-lg font-heading font-semibold">Merge k Sorted Lists</p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant="outline" className="text-[10px]">Hard</Badge>
        <Badge variant="outline" className="text-[10px]">Heap</Badge>
        <Badge variant="outline" className="text-[10px]">Linked List</Badge>
      </div>

      <Button className="mt-4 w-full" disabled>
        Start today's problem · 30 min
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Example problem — daily practice is coming soon.
      </p>
    </CardContent>
  </Card>
);

export default DailyDsaCard;
