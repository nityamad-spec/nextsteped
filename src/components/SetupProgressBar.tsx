import { Check } from "lucide-react";

const steps = [
  { label: "Profile & Course", path: "/teacher/onboarding" },
  { label: "Syllabus Review", path: "/teacher/setup/quality-check" },
  { label: "Concepts", path: "/teacher/setup/concepts" },
  { label: "Lesson Plan", path: "/teacher/setup/materials" },
  { label: "Diagnostic Qs", path: "/teacher/setup/diagnostic" },
  { label: "AI Assistant", path: "/teacher/setup/ai-settings" },
  { label: "Exam Mode", path: "/teacher/setup/exam-mode" },
  { label: "Enrollment", path: "/teacher/setup/publish" },
];

interface SetupProgressBarProps {
  currentStep: number; // 1-based
}

const SetupProgressBar = ({ currentStep }: SetupProgressBarProps) => {
  return (
    <div className="mb-8 w-full">
      <div className="flex items-center w-full">
        {steps.map((step, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isLast = i === steps.length - 1;

          return (
            <div key={step.label} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
              <div className="flex flex-col items-center gap-1.5 min-w-[40px]">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors shrink-0 ${
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                </div>
                <span
                  className={`text-[10px] text-center leading-tight w-[72px] ${
                    isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`h-0.5 flex-1 rounded mx-1 min-w-[12px] ${
                    isCompleted ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SetupProgressBar;
