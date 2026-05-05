import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type University = { id: string; name: string };

interface UniversityComboboxProps {
  valueId: string | null;
  valueName: string;
  onChange: (value: { id: string; name: string }) => void;
  placeholder?: string;
}

export function UniversityCombobox({
  valueId,
  valueName,
  onChange,
  placeholder = "Search or add your institution",
}: UniversityComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("universities")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("Failed to load universities: " + error.message);
        } else {
          setUniversities(data ?? []);
          setLoaded(true);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  const trimmed = query.trim();
  const exactMatch = universities.find(
    (u) => u.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreate = trimmed.length > 0 && !exactMatch;

  const handleCreate = async () => {
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      // Re-check for an existing match (case-insensitive) to avoid duplicates.
      const { data: existing } = await supabase
        .from("universities")
        .select("id, name")
        .ilike("name", trimmed)
        .maybeSingle();

      let row = existing;
      if (!row) {
        const { data: inserted, error } = await supabase
          .from("universities")
          .insert({ name: trimmed })
          .select("id, name")
          .single();
        if (error || !inserted) {
          toast.error("Couldn't add university: " + (error?.message ?? "Unknown"));
          return;
        }
        row = inserted;
        setUniversities((prev) =>
          [...prev, inserted].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      onChange({ id: row.id, name: row.name });
      setQuery("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !valueName && "text-muted-foreground")}>
            {valueName || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Search institution…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {!loading && (
              <>
                <CommandEmpty>
                  {showCreate ? "No match. Add it below." : "No universities found."}
                </CommandEmpty>
                <CommandGroup>
                  {universities.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={u.name}
                      onSelect={() => {
                        onChange({ id: u.id, name: u.name });
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          valueId === u.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {u.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {showCreate && (
                  <CommandGroup heading="Add new">
                    <CommandItem
                      value={`__create__${trimmed}`}
                      onSelect={handleCreate}
                      disabled={creating}
                    >
                      {creating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      Add "{trimmed}"
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
