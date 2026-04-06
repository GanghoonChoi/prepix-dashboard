"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
  Button,
} from "@heroui/react";
import { Alert, AlertTitle, AlertDescription } from "@heroui/react";
import { Check } from "lucide-react";
import { Logo } from "@/components/logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsLoading(false);
    setIsSubmitted(true);
  };

  return (
    <>
      <div className="mb-8 flex justify-center">
        <Logo size="lg" />
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle>
            {isSubmitted ? "Check Your Email" : "Reset Your Password"}
          </CardTitle>
          <CardDescription>
            {isSubmitted
              ? "We sent you a reset link"
              : "Enter your email to receive a reset link"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isSubmitted ? (
            <div className="space-y-4">
              <Alert status="success">
                <Check className="h-4 w-4" />
                <AlertTitle>Reset link sent</AlertTitle>
                <AlertDescription>
                  We&apos;ve sent a password reset link to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  Check your inbox and spam folder. The link expires in 1 hour.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Button
                  variant="primary"
                  className="w-full"
                  onPress={() => window.location.href = "/login"}
                >
                  Back to Login
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onPress={() => setIsSubmitted(false)}
                >
                  Resend reset link
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                isDisabled={isLoading}
              >
                {isLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center flex-col gap-2">
          <Link
            href="/login"
            className="text-sm text-muted hover:text-foreground"
          >
            Back to Login
          </Link>
          <p className="text-sm text-muted">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>

      <p className="mt-6 text-center text-xs text-muted">
        By continuing, you agree to our{" "}
        <Link href="/terms" className="underline hover:text-foreground">
          Terms
        </Link>
        ,{" "}
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>
      </p>
    </>
  );
}
