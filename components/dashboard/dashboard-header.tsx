"use client";

import { Button } from "@heroui/react";
import { Menu } from "lucide-react";
import { useT } from "@/lib/i18n/context";

export function DashboardHeader({
  onMobileMenuToggle,
}: {
  onMobileMenuToggle: () => void;
}) {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/80 px-6 backdrop-blur-md lg:hidden">
      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        onPress={onMobileMenuToggle}
        aria-label={t("nav.toggleMenu")}
      >
        <Menu className="h-5 w-5" />
      </Button>
    </header>
  );
}
