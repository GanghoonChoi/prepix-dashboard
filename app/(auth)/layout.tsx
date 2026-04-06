import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      {/* Left panel - branding */}
      <div className="hidden w-[480px] shrink-0 flex-col justify-between border-r border-border bg-surface p-10 lg:flex">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/prepix-symbol.svg" alt="Prepix" width={24} height={24} />
            <Image src="/prepix-wordmark.svg" alt="Prepix" width={80} height={20} />
          </Link>
        </div>

        <div className="space-y-6">
          <blockquote className="text-lg font-medium leading-relaxed text-foreground">
            &quot;Prepix transformed our post-production workflow. What used to take hours now takes minutes.&quot;
          </blockquote>
          <div>
            <p className="text-sm font-medium text-foreground">Video Production Team</p>
            <p className="text-xs text-muted">Professional Video Editors</p>
          </div>
        </div>

        <p className="text-xs text-muted">
          &copy; {new Date().getFullYear()} Prepix Inc. All rights reserved.
        </p>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 flex-col">
        {/* Mobile logo */}
        <div className="flex h-14 items-center px-6 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/prepix-symbol.svg" alt="Prepix" width={20} height={20} />
            <Image src="/prepix-wordmark.svg" alt="Prepix" width={68} height={17} />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
