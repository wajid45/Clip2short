import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert, Badge, Card, Empty, Input, PageHeader, Pager, Segmented, Spinner, Table } from "../../components/ui";
import { num, useLive, when } from "../../lib/api";
import { Select } from "@shortlark/shared/components/select";

interface Row {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  plan: string;
  subscriptionStatus: string;
  credits: number;
  videos: number;
  posts: number;
  lastActive: string | null;
  suspended: boolean;
  admin: boolean;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paying" },
  { value: "free", label: "Free" },
  { value: "suspended", label: "Suspended" },
  { value: "admins", label: "Admins" },
] as const;

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "active", label: "Last active" },
  { value: "credits", label: "Most credits" },
  { value: "videos", label: "Most videos" },
  { value: "oldest", label: "Oldest" },
] as const;

const PLAN_NAMES: Record<string, string> = { creator: "Creator", pro: "Pro", studio: "Studio" };

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filter = (params.get("filter") ?? "all") as (typeof FILTERS)[number]["value"];
  const sort = (params.get("sort") ?? "newest") as (typeof SORTS)[number]["value"];
  const page = Number(params.get("page") ?? 1) || 1;
  const q = params.get("q") ?? "";
  const [typed, setTyped] = useState(q);

  // Debounced search box → URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (typed !== q) update({ q: typed || null, page: null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  }

  const qs = new URLSearchParams({ filter, sort, page: String(page), ...(q ? { q } : {}) }).toString();
  const live = useLive<{ users: Row[]; total: number; page: number; perPage: number }>(`/users?${qs}`, 60_000);
  const d = live.data;

  return (
    <>
      <PageHeader title="Users" updatedAt={live.updatedAt} loading={live.loading} onRefresh={() => void live.refresh()} />
      {live.error && <Alert kind="error">{live.error}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <Input type="search" placeholder="Search name or email" aria-label="Search users" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <div className="max-w-full overflow-x-auto">
          <Segmented label="Filter users" options={[...FILTERS]} value={filter} onChange={(v) => update({ filter: v === "all" ? null : v, page: null })} />
        </div>
        <div className="ml-auto flex items-center gap-2 text-[13px] text-muted">
          <span aria-hidden="true">Sort</span>
          <Select
            ariaLabel="Sort users"
            size="sm"
            className="w-40"
            menuClassName="right-0 left-auto"
            value={sort}
            onChange={(v) => update({ sort: v === "newest" ? null : v, page: null })}
            options={SORTS}
          />
        </div>
      </div>

      <Card pad={false}>
        {!d ? (
          <Spinner />
        ) : d.users.length === 0 ? (
          <Empty title="No users match" body={q ? `Nothing for “${q}”. Try part of the email.` : "Try another filter."} />
        ) : (
          <>
            <Table head={["User", "Plan", "Credits", "Videos", "Posts", "Last active", "Joined"]} minWidth={820}>
              {d.users.map((u) => (
                <tr
                  key={u.id}
                  tabIndex={0}
                  onClick={() => navigate(`/users/${u.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/users/${u.id}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  <td className="px-4 py-3">
                    <Link to={`/users/${u.id}`} className="block min-w-0" onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-text">{u.name || "No name"}</span>
                        {u.admin && <Badge tone="brand">Admin</Badge>}
                        {u.suspended && <Badge tone="danger">Suspended</Badge>}
                      </span>
                      <span className="block truncate text-xs text-faint">{u.email}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">{u.plan !== "none" ? <Badge tone="brand">{PLAN_NAMES[u.plan] ?? u.plan}</Badge> : <Badge>Free</Badge>}</td>
                  <td className="num px-4 py-3 text-text">{num(u.credits)}</td>
                  <td className="num px-4 py-3 text-muted">{num(u.videos)}</td>
                  <td className="num px-4 py-3 text-muted">{num(u.posts)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{when(u.lastActive)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{when(u.createdAt)}</td>
                </tr>
              ))}
            </Table>
            <Pager page={d.page} perPage={d.perPage} total={d.total} onChange={(p) => update({ page: p === 1 ? null : String(p) })} />
          </>
        )}
      </Card>
    </>
  );
}
