import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, MoreHorizontal } from "lucide-react";
import { buildRail, pillLabel, type RailPillId } from "@/lib/unitRail";

export interface UnitPathRailProps {
  /** Unit numbers in order. */
  days: number[];
  /** Short label per unit number (its topic). */
  labels: Record<number, string>;
  /** Units at or above the readiness goal. */
  doneDays: ReadonlySet<number>;
  /** The unit the course clock says the student is on. */
  currentDay: number;
  /** The unit whose detail panel is open. */
  selectedDay: number;
  onSelect: (day: number) => void;
}

const UnitPathRail = ({ days, labels, doneDays, currentDay, selectedDay, onSelect }: UnitPathRailProps) => {
  const [expanded, setExpanded] = useState<RailPillId[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  const items = buildRail({ days, currentDay, expanded });
  const currentIndex = days.indexOf(currentDay);

  // Keep the current unit in view whenever the line grows or shrinks.
  useEffect(() => {
    const node = currentRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [expanded.length, currentDay]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setShowFade(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
    update();
    el.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items.length]);

  const togglePill = (id: RailPillId) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  if (days.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Your path</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" /> You're here
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Upcoming
          </span>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        All {days.length} units on one line · tap a group to expand it in place, then scroll →
      </p>

      <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto pb-2 [scrollbar-width:thin]">
          <div className="flex min-w-max items-start gap-0 px-1 pt-6">
            {items.map((item, i) => {
              const isLast = i === items.length - 1;
              // The connector after this item is filled while we're still at or
              // before the current unit.
              const passed =
                item.kind === "unit" ? item.index < currentIndex : item.side === "past";
              const connector = (
                <div
                  key={`c-${i}`}
                  aria-hidden
                  className={`mt-6 h-1 w-10 shrink-0 rounded-full sm:w-14 ${
                    passed ? "bg-emerald-500" : "bg-muted"
                  }`}
                />
              );

              if (item.kind === "pill") {
                const doneInRun = days
                  .filter((d) => d >= item.from && d <= item.to)
                  .filter((d) => doneDays.has(d)).length;
                const allDone = doneInRun >= item.count;
                return [
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => togglePill(item.id)}
                    className={`mt-1 flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition-colors ${
                      allDone
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                        : "border-dashed bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    {pillLabel(item, doneInRun)}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>,
                  isLast ? null : connector,
                ];
              }

              const isDone = doneDays.has(item.day);
              const isCurrent = item.day === currentDay;
              const isSelected = item.day === selectedDay;
              const far = item.index > currentIndex + 2;

              return [
                <div
                  key={item.day}
                  ref={isCurrent ? currentRef : undefined}
                  className={`flex w-20 shrink-0 flex-col items-center ${far ? "opacity-50" : ""}`}
                >
                  <span
                    className={`mb-1 h-5 text-[10px] font-semibold text-primary ${isCurrent ? "" : "invisible"}`}
                  >
                    <span className="rounded-full bg-primary/10 px-2 py-0.5">You're here</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelect(item.day)}
                    aria-label={`Unit ${item.day}: ${labels[item.day] ?? ""}`}
                    aria-current={isSelected ? "step" : undefined}
                    className={`flex items-center justify-center rounded-full border-2 font-bold transition-transform hover:scale-105 ${
                      isCurrent ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"
                    } ${
                      isCurrent
                        ? "border-primary bg-primary text-primary-foreground"
                        : isDone
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-muted-foreground/25 bg-background text-muted-foreground"
                    } ${isSelected && !isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                  >
                    {isDone && !isCurrent ? <Check className="h-5 w-5" strokeWidth={3} /> : item.day}
                  </button>
                  <div
                    className={`mt-2 w-full overflow-hidden text-center text-[11px] leading-tight ${
                      isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="block truncate">Unit {item.day}</span>
                    <span className="block truncate">{labels[item.day] ?? ""}</span>
                  </div>
                </div>,
                isLast ? null : connector,
              ];
            })}
          </div>
        </div>
        {showFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-card to-transparent"
          />
        )}
      </div>
    </div>
  );
};

export default UnitPathRail;
