"use client";

import { Check, X } from "lucide-react";

const RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
];

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="space-y-1.5">
      {RULES.map((rule) => {
        const pass = rule.test(password);
        return (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            {pass ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <X className="h-3.5 w-3.5 text-muted" />
            )}
            <span className={pass ? "text-success" : "text-muted"}>
              {rule.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
