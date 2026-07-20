import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      {/* Google Identity Services — powers "Sign in with Google" on auth pages. */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      {/* Left panel - branding */}
      <AuthBrandPanel />

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
