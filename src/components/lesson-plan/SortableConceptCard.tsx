import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowRight, GripVertical, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export type LessonConcept = {
  id: string;
  name: string;
  brief_description: string;
  ai_suggested: boolean;
};

type MoveTarget = { id: string; week: number; week_name: string; is_exam_week: boolean };

export function ConceptCardBody({
  concept,
  index,
  dragHandle,
  moveTargets,
  onMoveTo,
  onEdit,
  onDelete,
}: {
  concept: LessonConcept;
  index: number;
  dragHandle?: ReactNode;
  moveTargets: MoveTarget[];
  onMoveTo: (toWeekId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      {dragHandle}
      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-primary">{index + 1}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{concept.name}</p>
          {concept.ai_suggested && (
            <Badge variant="outline" className="text-[9px] gap-0.5 bg-primary/10 text-primary border-primary/30 px-1.5 py-0">
              <Sparkles className="h-2.5 w-2.5" /> AI Suggested
            </Badge>
          )}
        </div>
        {concept.brief_description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{concept.brief_description}</p>
        )}
      </div>
      <div className="flex gap-0.5 shrink-0">
        {moveTargets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-1.5" title="Move to another week">
                <ArrowRight className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              {moveTargets.map((other) => (
                <DropdownMenuItem
                  key={other.id}
                  disabled={other.is_exam_week}
                  onClick={() => onMoveTo(other.id)}
                  className="text-xs"
                >
                  Move to Week {other.week}
                  {other.is_exam_week ? " (exam week)" : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-6 w-6 p-0">
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="h-6 w-6 p-0 text-destructive hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function SortableConceptCard(props: {
  concept: LessonConcept;
  index: number;
  isEditing: boolean;
  editName: string;
  editDesc: string;
  onEditNameChange: (v: string) => void;
  onEditDescChange: (v: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  moveTargets: MoveTarget[];
  onMoveTo: (toWeekId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.concept.id,
    data: { type: "concept" },
    disabled: props.isEditing,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (props.isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="rounded-lg border bg-muted/10 p-3">
        <div className="space-y-2">
          <Input
            value={props.editName}
            onChange={(e) => props.onEditNameChange(e.target.value)}
            placeholder="Concept name"
            className="h-8 text-sm font-semibold"
          />
          <Textarea
            value={props.editDesc}
            onChange={(e) => props.onEditDescChange(e.target.value)}
            placeholder="One short sentence describing this concept"
            rows={2}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={props.onSave} className="h-7 text-xs">Save</Button>
            <Button size="sm" variant="ghost" onClick={props.onCancelEdit} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-muted/10 p-3">
      <ConceptCardBody
        concept={props.concept}
        index={props.index}
        moveTargets={props.moveTargets}
        onMoveTo={props.onMoveTo}
        onEdit={props.onStartEdit}
        onDelete={props.onDelete}
        dragHandle={
          <span
            {...attributes}
            {...listeners}
            aria-label={`Drag ${props.concept.name} to another week`}
            style={{ touchAction: "none" }}
            className="flex items-center justify-center p-0.5 mt-0.5 cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/60 hover:text-muted-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        }
      />
    </div>
  );
}

export function ConceptDropZone({
  id,
  disabled,
  children,
  className,
  activeClassName = "ring-2 ring-primary/50 rounded-lg",
  blockedClassName = "ring-2 ring-destructive/50 rounded-lg cursor-not-allowed",
  dragging,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
  blockedClassName?: string;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "week-zone" } });
  const highlight = dragging && isOver ? (disabled ? blockedClassName : activeClassName) : "";
  return (
    <div ref={setNodeRef} className={`${className ?? ""} ${highlight}`}>
      {children}
    </div>
  );
}
