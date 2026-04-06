"use client";

import { Button } from "@heroui/react";
import { Menu } from "lucide-react";

export function DashboardHeader({
  onMobileMenuToggle,
}: {
  onMobileMenuToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/80 px-6 backdrop-blur-md lg:hidden">
      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        onPress={onMobileMenuToggle}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
    </header>
  );
}
