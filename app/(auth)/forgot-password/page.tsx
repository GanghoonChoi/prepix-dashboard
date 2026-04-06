"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";

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

  const inputClass =
    "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-foreground/30";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {isSubmitted ? "Check your email" : "Reset password"}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {isSubmitted
            ? `We sent a reset link to ${email}`
            : "Enter your email and we'll send you a reset link"}
        </p>
      </div>

      {isSubmitted ? (
        <div className="space-y-4">
          <div className="rounded-md border border-border px-4 py-3 text-sm text-muted">
            Didn&apos;t receive the email? Check your spam folder, or{" "}
            <button
              onClick={() => setIsSubmitted(false)}
              className="text-foreground underline underline-offset-2"
            >
              try again
            </button>
          </div>
          <Button
            variant="primary"
            className="w-full"
            onPress={() => window.location.href = "/login"}
          >
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
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
              className={inputClass}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isDisabled={isLoading}
          >
            {isLoading ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="text-sm text-muted">
        <Link href="/login" className="text-foreground underline underline-offset-4 hover:no-underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
