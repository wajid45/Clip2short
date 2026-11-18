import { useRouter } from "@/lib/nav";
import { useEffect } from "react";

/** Refreshes the page while posts are publishing, and once a minute otherwise so due posts update. */
export function QueueRefresher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), active ? 3000 : 60000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
