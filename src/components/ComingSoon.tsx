import { Lock } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  badgeText?: string;
  previewContent?: React.ReactNode;
}

const ComingSoon = ({ title, description, badgeText = "Coming Soon", previewContent }: ComingSoonProps) => (
  <div className="flex flex-1 flex-col items-center justify-center p-8">
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <span className="mb-3 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        {badgeText}
      </span>
      <h2 className="mb-2 font-heading text-2xl font-bold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    {previewContent && (
      <div className="mt-8 w-full max-w-2xl opacity-40 pointer-events-none">
        {previewContent}
      </div>
    )}
  </div>
);

export default ComingSoon;