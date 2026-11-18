import { Link, useRouter, useSearchParams } from "@/lib/nav";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button, Input, Label, Notice } from "./ui";

/** Where to go after signing in: back to a workspace page, on to a plan/pack picked on the landing page, or home. */
export function afterAuthPath(params: URLSearchParams, mode: "login" | "signup"): string {
  const plan = params.get("plan");
  const packs = params.get("packs");
  const next = params.get("next");
  const safeNext = next && next.startsWith("/app") ? next : null;
  const intent = plan ? `/app/billing?plan=${encodeURIComponent(plan)}` : packs ? `/app/billing?packs=${encodeURIComponent(packs)}` : null;
  return safeNext ?? intent ?? (mode === "signup" ? "/app?welcome=1" : "/app");
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const presetEmail = params.get("email") ?? "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await apiFetch(`/api/auth/${mode}`, { method: "POST", json: Object.fromEntries(form) });
      router.push(afterAuthPath(params, mode));
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" && (
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={80} />
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={presetEmail} />
      </div>
      <div>
        <Label htmlFor="password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 8 : 1}
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        {mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href={`/login${params.toString() ? `?${params.toString()}` : ""}`} className="text-text underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Shortlark?{" "}
            <Link href={`/signup${params.toString() ? `?${params.toString()}` : ""}`} className="text-text underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
