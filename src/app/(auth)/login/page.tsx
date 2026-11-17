import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 mb-8 text-[15px] text-muted">Sign in to your clips.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
