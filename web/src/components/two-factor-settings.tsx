import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ApiError, apiFetch } from "@/lib/client";
import { refreshPageData } from "@/lib/nav";
import { LocalDateTime } from "./local-time";
import { Button, Input, Label, Notice, PasswordInput } from "./ui";

type Status = { enabled: boolean; enabledAt: string | null; backupCodesLeft: number };
type Step =
  | { kind: "idle" }
  | { kind: "password" }
  | { kind: "scan"; secret: string; otpauthUrl: string }
  | { kind: "codes"; codes: string[]; fresh: boolean }
  | { kind: "verify"; action: "disable" | "backup-codes" };

/** Settings card body: turn two-factor sign-in on (scan, confirm, save backup codes), get new backup codes, or turn it off. */
export function TwoFactorSettings({ status }: { status: Status }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function go(next: Step) {
    setStep(next);
    setPassword("");
    setCode("");
    setError(null);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await fn();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "codes")
    return (
      <BackupCodes
        codes={step.codes}
        fresh={step.fresh}
        onSaved={() => {
          go({ kind: "idle" });
          setDone(step.fresh ? "Two-factor sign-in is on. Other devices were signed out." : "New backup codes saved. The old ones no longer work.");
          refreshPageData();
        }}
      />
    );

  return (
    <div className="grid max-w-lg gap-4">
      {status.enabled ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-ready/10 px-2.5 py-1 font-medium text-ready">
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            On
          </span>
          <span className="text-muted">
            {status.enabledAt && (
              <>
                Since <LocalDateTime iso={status.enabledAt} />
                {" · "}
              </>
            )}
            {status.backupCodesLeft} of 10 backup codes left
          </span>
        </div>
      ) : (
        step.kind === "idle" && (
          <p className="text-sm leading-relaxed text-muted">
            Off. When it's on, signing in also asks for a 6-digit code from an authenticator app on your phone, such as Google Authenticator,
            Microsoft Authenticator, Authy or 1Password. Someone who learns your password still can't get in.
          </p>
        )
      )}
      {status.enabled && status.backupCodesLeft <= 3 && step.kind === "idle" && (
        <Notice tone="warn">You're running low on backup codes. Make new ones so you can still get in if you lose your phone.</Notice>
      )}

      {step.kind === "password" && (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const res = await apiFetch<{ secret: string; otpauthUrl: string }>("/api/account/2fa/start", { method: "POST", json: { password } });
              go({ kind: "scan", ...res });
            });
          }}
        >
          <div>
            <Label htmlFor="tfa-password">Confirm your password</Label>
            <PasswordInput id="tfa-password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={busy}>
              Continue
            </Button>
            <Button type="button" variant="ghost" onClick={() => go({ kind: "idle" })}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step.kind === "scan" && (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const res = await apiFetch<{ backupCodes: string[] }>("/api/account/2fa/confirm", { method: "POST", json: { code } });
              go({ kind: "codes", codes: res.backupCodes, fresh: true });
            });
          }}
        >
          <ol className="space-y-1 text-sm text-muted">
            <li>1. Open your authenticator app and add an account.</li>
            <li>2. Scan this QR code, or enter the key below.</li>
            <li>3. Type the 6-digit code it shows for Clip2Short.</li>
          </ol>
          <QrCode text={step.otpauthUrl} />
          <ManualKey secret={step.secret} />
          <div>
            <Label htmlFor="tfa-code">Code from the app</Label>
            <CodeInput id="tfa-code" value={code} onChange={setCode} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6}>
              Turn on
            </Button>
            <Button type="button" variant="ghost" onClick={() => go({ kind: "idle" })}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step.kind === "verify" && (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (step.action === "disable") {
                await apiFetch("/api/account/2fa/disable", { method: "POST", json: { password, code } });
                go({ kind: "idle" });
                setDone("Two-factor sign-in is off.");
                refreshPageData();
              } else {
                const res = await apiFetch<{ backupCodes: string[] }>("/api/account/2fa/backup-codes", { method: "POST", json: { password, code } });
                go({ kind: "codes", codes: res.backupCodes, fresh: false });
              }
            });
          }}
        >
          <p className="text-sm text-muted">
            {step.action === "disable" ? "To turn it off, confirm it's you." : "New codes replace the old ones. Confirm it's you."}
          </p>
          <div>
            <Label htmlFor="tfa-verify-password">Password</Label>
            <PasswordInput id="tfa-verify-password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="tfa-verify-code" hint="Or a backup code">
              Code from your authenticator app
            </Label>
            <Input
              id="tfa-verify-code"
              className="tc"
              required
              autoComplete="one-time-code"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={20}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button type="submit" variant={step.action === "disable" ? "danger" : "primary"} loading={busy}>
              {step.action === "disable" ? "Turn off" : "Make new codes"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => go({ kind: "idle" })}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {done && step.kind === "idle" && <Notice tone="success">{done}</Notice>}

      {step.kind === "idle" && (
        <div className="flex flex-wrap gap-2">
          {status.enabled ? (
            <>
              <Button onClick={() => go({ kind: "verify", action: "backup-codes" })}>New backup codes</Button>
              <Button variant="danger" onClick={() => go({ kind: "verify", action: "disable" })}>
                Turn off
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => go({ kind: "password" })}>
              Turn on
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CodeInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Input
      id={id}
      className="tc max-w-[200px] text-center text-lg tracking-[0.4em]"
      inputMode="numeric"
      autoComplete="one-time-code"
      required
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="000000"
    />
  );
}

function QrCode({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 200, errorCorrectionLevel: "M", color: { dark: "#111318", light: "#ffffff" } }).then(setSrc, () => setSrc(null));
  }, [text]);
  return (
    <div className="flex size-[216px] items-center justify-center rounded-xl border border-line bg-white p-2">
      {src ? <img src={src} alt="QR code for your authenticator app" width={200} height={200} /> : <span className="text-xs text-faint">Making the code…</span>}
    </div>
  );
}

function ManualKey({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <p className="text-xs text-faint">Can&apos;t scan? Enter this key in the app as a time-based key:</p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <code className="tc text-[13px] break-all text-text">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
        <Button
          size="sm"
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(secret).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/** Shown once: the backup codes, with copy and download, until the person confirms they saved them. */
function BackupCodes({ codes, fresh, onSaved }: { codes: string[]; fresh: boolean; onSaved: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Clip2Short backup codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;
  return (
    <div className="grid max-w-lg gap-4">
      <Notice tone="success">{fresh ? "Two-factor sign-in is on." : "Here are your new backup codes."}</Notice>
      <p className="text-sm leading-relaxed text-muted">
        Save these backup codes somewhere safe, like a password manager. If you lose your phone, each one gets you in once. This is the only time
        they&apos;re shown.
      </p>
      <ul className="tc grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface-2 p-4 text-[14px] text-text">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const a = Object.assign(document.createElement("a"), { href: url, download: "clip2short-backup-codes.txt" });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download
        </Button>
        <Button type="button" variant="primary" onClick={onSaved}>
          I&apos;ve saved them
        </Button>
      </div>
    </div>
  );
}
