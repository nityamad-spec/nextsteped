import { Check } from "lucide-react";

const steps = [
  { label: "Profile & Course", path: "/teacher/onboarding" },
  { label: "Syllabus Review", path: "/teacher/setup/quality-check" },
  { label: "Lesson Plan", path: "/teacher/setup/lesson-plan" },
  { label: "Concepts", path: "/teacher/setup/concepts" },
  { label: "Diagnostic Qs", path: "/teacher/setup/diagnostic" },
  { label: "Exam Mode", path: "/teacher/setup/exam-mode" },
  { label: "Publish", path: "/teacher/setup/publish" },
];

interface SetupProgressBarProps {
  currentStep: number; // 1-based
}

const SetupProgressBar = ({ currentStep }: SetupProgressBarProps) => {
  return (
    <div className="mb-8 w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <div key={step.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
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
                  className={`text-[10px] text-center leading-tight max-w-[80px] ${
                    isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 rounded ${
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
