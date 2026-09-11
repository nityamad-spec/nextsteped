import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

interface TrackGeometry {
  top: number;
  left: number;
  width: number;
  fill: number;
}

const UnitPathRail = ({ days, labels, doneDays, currentDay, selectedDay, onSelect }: UnitPathRailProps) => {
  const [expanded, setExpanded] = useState<RailPillId[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [showFade, setShowFade] = useState(false);
  const [track, setTrack] = useState<TrackGeometry | null>(null);

  const items = buildRail({ days, currentDay, expanded });
  const currentIndex = days.indexOf(currentDay);
  itemRefs.current.length = items.length;

  // Measure the track: it spans from the centre of the first item to the
  // centre of the last one, with the green fill stopping at the current unit.
  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      const nodes = itemRefs.current.filter(Boolean) as HTMLElement[];
      if (!row || nodes.length === 0) return;
      const rowBox = row.getBoundingClientRect();
      const centreOf = (el: HTMLElement) => {
        const b = el.getBoundingClientRect();
        return { x: b.left - rowBox.left + b.width / 2, y: b.top - rowBox.top + b.height / 2 };
      };
      const first = centreOf(nodes[0]);
      const last = centreOf(nodes[nodes.length - 1]);
      const currentEl = currentRef.current?.querySelector("button") as HTMLElement | null;
      const fillEnd = currentEl ? centreOf(currentEl).x : first.x;
      setTrack({
        top: first.y,
        left: first.x,
        width: Math.max(0, last.x - first.x),
        fill: Math.max(0, fillEnd - first.x),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (rowRef.current) ro.observe(rowRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [items.length, currentDay, days.length]);

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
        <p className="font-heading text-xl font-semibold">Your path</p>
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
          <div ref={rowRef} className="relative flex min-w-max items-start gap-6 px-1 pt-6 sm:gap-8">
            {/* One continuous track behind the nodes. */}
            {track && (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute h-1.5 -translate-y-1/2 rounded-full bg-muted"
                  style={{ top: track.top, left: track.left, width: track.width }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute h-1.5 -translate-y-1/2 rounded-full bg-emerald-500"
                  style={{ top: track.top, left: track.left, width: track.fill }}
                />
              </>
            )}

            {items.map((item, i) => {
              if (item.kind === "pill") {
                const doneInRun = days
                  .filter((d) => d >= item.from && d <= item.to)
                  .filter((d) => doneDays.has(d)).length;
                const allDone = doneInRun >= item.count;
                return (
                  <div key={item.id} className="relative z-10 flex shrink-0 flex-col items-center">
                    <span className="mb-1 h-5" aria-hidden />
                    <button
                      ref={(el) => {
                        itemRefs.current[i] = el;
                      }}
                      type="button"
                      onClick={() => togglePill(item.id)}
                      className={`flex h-12 items-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors ${
                        allDone
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                          : "border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <MoreHorizontal className="h-4 w-4 opacity-70" />
                      {pillLabel(item, doneInRun)}
                      {item.side === "future" && <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="mt-2 max-w-[9rem] truncate text-center text-[11px] leading-tight text-muted-foreground">
                      Units {item.from}–{item.to}
                    </div>
                  </div>
                );
              }

              const isDone = doneDays.has(item.day);
              const isCurrent = item.day === currentDay;
              const isSelected = item.day === selectedDay;
              const far = item.index > currentIndex + 2;

              return (
                <div
                  key={item.day}
                  ref={isCurrent ? currentRef : undefined}
                  className={`relative z-10 flex w-20 shrink-0 flex-col items-center ${far ? "opacity-50" : ""}`}
                >
                  <span
                    className={`mb-1 h-5 text-[10px] font-semibold text-primary ${isCurrent ? "" : "invisible"}`}
                  >
                    <span className="rounded-full bg-primary/10 px-2 py-0.5">You're here</span>
                  </span>
                  <button
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    onClick={() => onSelect(item.day)}
                    aria-label={`Unit ${item.day}: ${labels[item.day] ?? ""}`}
                    aria-current={isSelected ? "step" : undefined}
                    className={`flex items-center justify-center rounded-full font-bold transition-transform hover:scale-105 ${
                      isCurrent ? "h-12 w-12 text-base" : "h-11 w-11 text-sm"
                    } ${
                      isCurrent
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : isDone
                          ? "bg-emerald-500 text-white"
                          : "border-2 border-muted-foreground/20 bg-background text-muted-foreground"
                    } ${isSelected && !isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                  >
                    {isDone && !isCurrent ? <Check className="h-5 w-5" strokeWidth={3} /> : item.day}
                  </button>
                  <div
                    className={`mt-2 w-full overflow-hidden text-center text-[11px] leading-tight ${
                      isCurrent ? "font-semibold text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span className="block truncate">Unit {item.day}</span>
                    <span className="block truncate">{labels[item.day] ?? ""}</span>
                  </div>
                </div>
              );
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
