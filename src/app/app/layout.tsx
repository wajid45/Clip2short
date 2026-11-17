import type { Metadata } from "next";
import { isAdmin, requireUser } from "@/lib/auth";
import { getPlan, hasActiveSubscription } from "@/lib/plans";
import { ensureTrial, getCredits } from "@/lib/credits";
import { AppShell } from "@/components/app-nav";
import { cookies } from "next/headers";
import { getThemeChoice } from "@/lib/theme";

export const metadata: Metadata = { title: { default: "Workspace", template: "%s · Shortlark" }, robots: { index: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const plan = hasActiveSubscription(user) ? getPlan(user.plan) : null;
  if (!user.trialStartedAt) await ensureTrial(user.id); // accounts created before credits existed
  const credits = await getCredits(user.id);
  const theme = await getThemeChoice();
  const collapsed = (await cookies()).get("sl_nav")?.value === "collapsed";
  return (
    <AppShell
      theme={theme}
      initialCollapsed={collapsed}
      user={{
        name: user.name ?? user.email.split("@")[0],
        email: user.email,
        planName: plan?.name ?? null,
        credits: credits.total,
        monthlyCredits: plan?.monthlyCredits ?? null,
        isAdmin: isAdmin(user),
      }}
    >
      {children}
    </AppShell>
  );
}
