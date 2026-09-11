/**
 * Example openings shown on the employment-pathway home page.
 * Placeholder content until real employer data is wired in.
 */
export type DemoOpening = {
  company: string;
  initial: string;
  tier: string;
  location: string;
  role: string;
  salary: string;
  match: number;
  status: "Ready" | "Stretch" | "Early";
};

export const DEMO_OPENINGS: DemoOpening[] = [
  {
    company: "Sarvam",
    initial: "S",
    tier: "Startup",
    location: "India",
    role: "AI Engineer",
    salary: "₹45–80 LPA",
    match: 82,
    status: "Ready",
  },
  {
    company: "Zomato",
    initial: "Z",
    tier: "Mid-tier",
    location: "India",
    role: "ML Engineer",
    salary: "₹25–45 LPA",
    match: 58,
    status: "Stretch",
  },
  {
    company: "Google",
    initial: "G",
    tier: "Tier-1",
    location: "India",
    role: "Applied Scientist",
    salary: "₹55–85 LPA",
    match: 34,
    status: "Early",
  },
];
