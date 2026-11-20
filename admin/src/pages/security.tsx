import { useState } from "react";
import { OtpInput } from "../components/otp-input";
import { Alert, Button, Card, Field, Input, PasswordInput, Modal, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fullDate } from "../lib/api";
import { ManualKey, QrCode } from "./login";

/** Move the portal sign-in to a new phone. The old authenticator keeps working until the new one is confirmed. */
export function SecurityPage() {
  const { me, reload } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    setOpen(false);
    setStep(null);
    setPassword("");
    setCode("");
    setError(null);
  };

  async function confirm(c: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/authenticator/confirm", { body: { code: c } });
      close();
      setDone(true);
      await reload();
    } catch (e) {
      setError((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="My Authenticator" description="Every portal sign-in needs your password and a 6-digit code from this app." />
      {done && <Alert kind="success">New authenticator confirmed. Your other portal sessions were signed out.</Alert>}
      <Card title="Authenticator app" description={me?.authenticatorSince ? `Set up ${fullDate(me.authenticatorSince)}` : undefined}>
        <p className="max-w-2xl text-sm text-muted">
          Got a new phone, or want to use a different app? Replace it here. Your current authenticator keeps working until the new one is confirmed, so you can&apos;t lock yourself out half-way.
        </p>
        <Button className="mt-5" variant="primary" onClick={() => setOpen(true)}>
          Replace authenticator
        </Button>
        <div className="mt-6 rounded-xl border border-line bg-bg p-4 text-[13px] text-muted">
          <p className="font-medium text-text">Lost your phone?</p>
          <p className="mt-1">
            Another admin can't see your secret. On the server, run <code className="tc text-text">uv run python -m app.portal_cli reset-2fa you@yourcompany.com</code> from the backend folder; the next sign-in shows a new QR code.
          </p>
        </div>
      </Card>

      <Modal open={open} onClose={close} title={step ? "Scan with your new app" : "Confirm it's you"} locked={busy}>
        {error && <Alert kind="error">{error}</Alert>}
        {!step ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                setStep(await api<{ secret: string; otpauthUrl: string }>("/auth/authenticator/start", { body: { password } }));
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Your password">
              <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={busy}>
                Continue
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <QrCode text={step.otpauthUrl} />
            <ManualKey secret={step.secret} />
            <p className="text-[13px] text-muted">Type the code your new app shows:</p>
            <OtpInput value={code} onChange={setCode} onComplete={(c) => void confirm(c)} autoFocus />
            <Button variant="primary" className="w-full" loading={busy} disabled={code.length !== 6} onClick={() => void confirm(code)}>
              Confirm new authenticator
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
