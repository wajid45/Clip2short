import { forwardRef, useCallback, useMemo, type AnchorHTMLAttributes } from "react";
import { Link as RouterLink, useLocation, useNavigate, useSearchParams as useRouterSearchParams } from "react-router";

/**
 * Small navigation layer over React Router, so components can stay framework-neutral:
 * <Link href>, useRouter().push/replace/refresh/back, usePathname, useSearchParams.
 */

export const REFRESH_EVENT = "shortlark:refresh";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  replace?: boolean;
  /** Keep the scroll position (e.g. switching tabs). */
  scroll?: boolean;
  prefetch?: boolean;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, replace, scroll = true, prefetch, ...rest }, ref) {
  void prefetch;
  // API downloads, external links and new tabs are plain anchors.
  if (/^(https?:|mailto:|tel:)/.test(href) || href.startsWith("/api/") || rest.target === "_blank" || rest.download !== undefined)
    return <a ref={ref} href={href} {...rest} />;
  return <RouterLink ref={ref} to={href} replace={replace} preventScrollReset={!scroll} {...rest} />;
});

/** Re-fetches the data of every page currently on screen (the old `router.refresh()`). */
export function refreshPageData() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

export function useRouter() {
  const navigate = useNavigate();
  const push = useCallback((to: string) => void navigate(to), [navigate]);
  const replace = useCallback((to: string) => void navigate(to, { replace: true }), [navigate]);
  const back = useCallback(() => void navigate(-1), [navigate]);
  return useMemo(() => ({ push, replace, back, refresh: refreshPageData }), [push, replace, back]);
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0];
}
