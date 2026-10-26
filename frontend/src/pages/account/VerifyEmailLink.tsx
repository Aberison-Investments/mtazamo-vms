import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, tokenStore } from "../../api";
import { portal } from "../../portalTheme";
import { useAuth } from "../../auth";
import { AuthLayout } from "../../components/portal/ui";

function LinkButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: 36,
        boxSizing: "border-box",
        borderRadius: 8,
        background: portal.brand,
        color: portal.inverse,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

type State = "verifying" | "ok" | "error";

export function VerifyEmailLink() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { user, refresh } = useAuth();
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }

    api
      .verifyEmail(token)
      .then(async () => {
        setState("ok");
        // If this device is signed in, reflect the new status immediately.
        if (tokenStore.get()) {
          try {
            await refresh();
          } catch {
            /* non-fatal */
          }
        }
      })
      .catch((err) => {
        setState("error");
        setMessage(
          err instanceof ApiError
            ? err.fields.token?.[0] ?? err.message
            : "Could not verify this link. Request a new one.",
        );
      });
  }, [token, refresh]);

  const signedIn = !!user || !!tokenStore.get();

  return (
    <AuthLayout
      footer={
        signedIn ? (
          <Link to="/account" style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
            Back to overview
          </Link>
        ) : (
          <Link to="/login" style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
            Go to log in
          </Link>
        )
      }
    >
      {state === "verifying" && (
        <div style={{ textAlign: "center", color: portal.textSubtle, fontSize: 14 }}>
          Verifying your email…
        </div>
      )}

      {state === "ok" && (
        <>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              textAlign: "center",
              color: portal.label,
              marginBottom: 6,
            }}
          >
            Email verified
          </div>
          <div
            style={{ fontSize: 14, color: portal.textSubtle, textAlign: "center", marginBottom: 20 }}
          >
            Your email address is confirmed. Exports, evidence packs and recovery codes can now be
            emailed to you.
          </div>
          {signedIn ? (
            <LinkButton to="/account">Back to overview</LinkButton>
          ) : (
            <LinkButton to="/login">Go to log in</LinkButton>
          )}
        </>
      )}

      {state === "error" && (
        <>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              textAlign: "center",
              color: portal.label,
              marginBottom: 6,
            }}
          >
            Link didn't work
          </div>
          <div
            style={{ fontSize: 14, color: portal.dangerText, textAlign: "center", marginBottom: 20 }}
          >
            {message}
          </div>
          {signedIn && <LinkButton to="/account/verify-email">Request a new link</LinkButton>}
        </>
      )}
    </AuthLayout>
  );
}
