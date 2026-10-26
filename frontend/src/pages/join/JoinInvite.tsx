import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type ManagerInvite } from "../../api";
import { portal, seatLabel } from "../../portalTheme";
import { AuthLayout, PrimaryButton } from "../../components/portal/ui";

export function JoinInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<ManagerInvite | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.getInvite(token).then(({ invite: inv }) => setInvite(inv)).catch(() => setInvalid(true));
  }, [token]);

  async function handleDecline(e: React.MouseEvent) {
    e.preventDefault();
    if (!token || declining) return;
    setDeclining(true);
    try {
      await api.declineInvite(token);
      setDeclined(true);
    } catch {
      setDeclining(false);
    }
  }

  function handleAccept() {
    navigate(`/join/${token}/verify`);
  }

  if (invalid) {
    return (
      <AuthLayout>
        <div style={{ textAlign: "center", color: portal.ink, marginBottom: 8, fontSize: 16, fontWeight: 600 }}>
          Invite not found
        </div>
        <div style={{ textAlign: "center", fontSize: 14, color: portal.textSubtle }}>
          This invite link is invalid or has expired. Ask the workspace owner to send a new one.
        </div>
      </AuthLayout>
    );
  }

  if (!invite) {
    return (
      <AuthLayout>
        <div style={{ textAlign: "center", color: portal.textSubtle, fontSize: 14 }}>Loading…</div>
      </AuthLayout>
    );
  }

  const inviterName = invite.inviter_name ?? "Someone";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: portal.canvasSubtle,
        fontFamily: portal.font,
        color: portal.ink,
        fontSize: 14,
        lineHeight: "20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 16px 56px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: portal.brand,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: portal.inverse,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          M
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.2px" }}>Mtazamo</span>
        <span style={{ fontSize: 14, color: portal.textSubtle }}>Votes</span>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: portal.canvas,
          borderRadius: 8,
          boxShadow: portal.cardShadow,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "26px 28px 22px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 20,
              padding: "0 8px",
              borderRadius: 3,
              background: portal.brandSubtlest,
              color: portal.brandText,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.3px",
              marginBottom: 12,
            }}
          >
            Campaign manager invite
          </span>
          <div
            style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700, marginBottom: 6 }}
          >
            {inviterName} invited you to help run their {invite.workspace.name} campaign
          </div>
          <div style={{ fontSize: 14, color: portal.textSubtle }}>
            This link is tied to{" "}
            <strong style={{ color: portal.ink, fontWeight: 600 }}>{invite.phone_masked}</strong>.
            Accepting confirms you are the person that number belongs to.
          </div>
        </div>

        {/* Workspace */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 28px",
            borderBottom: `1px solid ${portal.borderSubtle}`,
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 5,
              background: portal.avatarDark,
              color: portal.inverse,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {new Date().getFullYear().toString().slice(2)}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{invite.workspace.name}</div>
            <div style={{ fontSize: 12, color: portal.textSubtle }}>
              {[seatLabel(invite.workspace.seat), invite.workspace.county && `${invite.workspace.county} County`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "14px 28px 24px" }}>
          {declined ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#FFF7F5",
                color: "#AE2A19",
                fontSize: 12,
                lineHeight: "18px",
              }}
            >
              Declined. {inviterName} will be notified and this link stops working. Close this page
              — nothing else is needed.
            </div>
          ) : (
            <>
              <PrimaryButton
                style={{ height: 40, fontSize: 14, fontWeight: 600, marginBottom: 12 }}
                onClick={handleAccept}
              >
                Accept and verify my phone
              </PrimaryButton>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <a
                  href="#"
                  onClick={handleDecline}
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                    color: portal.textSubtle,
                  }}
                >
                  {declining ? "Declining…" : "Decline this invite"}
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 460,
          marginTop: 16,
          fontSize: 12,
          lineHeight: "18px",
          color: portal.textSubtle,
          textAlign: "center",
        }}
      >
        You are accepting a role inside one workspace only. Mtazamo will never ask you for a
        voter's ID number or a result form by SMS.
      </div>
    </div>
  );
}
