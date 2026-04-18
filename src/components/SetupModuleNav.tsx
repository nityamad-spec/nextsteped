import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

interface SetupModuleNavProps {
  /** Optional next module path. When omitted, shows a "Save & Finish" button returning to /teacher/setup. */
  nextPath?: string;
  nextLabel?: string;
  onNext?: () => void | Promise<void>;
  nextDisabled?: boolean;
  finishMode?: boolean;
}

/**
 * Shared in-module navigation: "Back to Course Setup" + Next/Finish.
 * Replaces the old SetupProgressBar inside individual setup modules.
 */
const SetupModuleNav = ({
  nextPath,
  nextLabel,
  onNext,
  nextDisabled,
  finishMode,
}: SetupModuleNavProps) => {
  const navigate = useNavigate();

  const handleNext = async () => {
    if (onNext) await onNext();
    if (nextPath) navigate(nextPath);
    else navigate("/teacher/setup");
  };

  return (
    <div className="flex items-center justify-between pt-2">
      <Button variant="outline" onClick={() => navigate("/teacher/setup")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Course Setup
      </Button>
      <Button onClick={handleNext} disabled={nextDisabled} className="gap-2">
        {finishMode ? (
          <>
            <Check className="h-4 w-4" /> {nextLabel || "Save & Finish"}
          </>
        ) : (
          <>
            {nextLabel || "Next"} <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
};

export default SetupModuleNav;
