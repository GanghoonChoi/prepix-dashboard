"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
  Button,
} from "@heroui/react";
import { Alert, AlertDescription } from "@heroui/react";
import { Logo } from "@/components/logo";
import { LoadingScreen } from "@/components/loading-screen";
import { authService } from "@/lib/api/services/auth.service";
import { sleep } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const data = await authService.login({ email, password });

      if (data.accessToken && data.refreshToken) {
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
      }

      try {
        const userInfo = data.user || (await authService.getMe());
        if (userInfo) {
          localStorage.setItem("userInfo", JSON.stringify(userInfo));
        }
      } catch {
        // non-critical
      }

      setIsLoading(false);
      setIsSigningIn(true);
      await sleep(1000);
      router.push("/dashboard");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(
        axiosErr.response?.data?.message ||
          "Login failed. Please check your credentials.",
      );
      setIsLoading(false);
    }
  };

  if (isSigningIn) {
    return (
      <LoadingScreen
        title="Signing you in"
        subtitle="Please wait while we verify your credentials..."
      />
    );
  }

  return (
    <>
      <div className="mb-8 flex justify-center">
        <Logo size="lg" />
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle>Sign in to Prepix</CardTitle>
          <CardDescription>
            Enter your credentials to access your dashboard
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert status="danger" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm text-muted"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-field-background px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm text-muted">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-accent hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-field-background px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isDisabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>

      <p className="mt-6 text-center text-xs text-muted">
        By signing in, you agree to our{" "}
        <Link href="/terms" className="underline hover:text-foreground">
          Terms
        </Link>
        ,{" "}
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>
        , and{" "}
        <Link
          href="/refund-policy"
          className="underline hover:text-foreground"
        >
          Refund Policy
        </Link>
      </p>
    </>
  );
}
