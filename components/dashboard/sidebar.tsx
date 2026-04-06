"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { name: "Overview", href: "/dashboard" },
  { name: "Usage", href: "/dashboard/usage" },
  { name: "Plan", href: "/dashboard/plan" },
  { name: "Settings", href: "/dashboard/settings" },
];

export function Sidebar({
  profile,
  onLogout,
  onClose,
}: {
  profile: Record<string, string> | null;
  onLogout: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const displayName = profile?.username || profile?.email || "User";

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <Image src="/prepix-symbol.svg" alt="Prepix" width={20} height={20} />
        <Image src="/prepix-wordmark.svg" alt="Prepix" width={68} height={17} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3">
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`block rounded-md px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? "font-medium text-foreground bg-foreground/[0.06]"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-3">
        <div className="rounded-md px-3 py-2">
          <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
          {profile?.email && profile.email !== displayName && (
            <p className="truncate text-[11px] text-muted">{profile.email}</p>
          )}
        </div>
        <button
          onClick={onLogout}
          className="mt-1 block w-full rounded-md px-3 py-2 text-left text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
