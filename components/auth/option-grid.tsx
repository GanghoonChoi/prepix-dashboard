"use client";

import { Button } from "@heroui/react";
import { capitalizeWords } from "@/lib/utils";

export function OptionGrid({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <Button
            key={opt}
            variant={value === opt ? "primary" : "outline"}
            size="sm"
            className="justify-start"
            onPress={() => onChange(opt)}
          >
            {capitalizeWords(opt)}
          </Button>
        ))}
      </div>
    </div>
  );
}
