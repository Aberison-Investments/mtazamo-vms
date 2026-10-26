import { useEffect, useMemo, useState } from "react";
import { colors } from "../theme";
import { PlusIcon, DownloadIcon } from "../components/icons";
import { AddStationModal } from "../components/AddStationModal";
import {
  api,
  type Constituency,
  type CountyTree,
  type Station,
  type WardStations,
} from "../api";

interface GeographyProps {
  // County the workspace is scoped to (UUID or name, e.g. "Nakuru").
  county: string;
  workspaceName: string;
}

export function Geography({ county, workspaceName }: GeographyProps) {
  const [tree, setTree] = useState<CountyTree | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedWard, setSelectedWard] = useState<{ id: string; name: string } | null>(null);
  const [wardData, setWardData] = useState<WardStations | null>(null);
  const [loadingStations, setLoadingStations] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Load the county tree, then auto-select the first constituency + ward.
  useEffect(() => {
    let cancelled = false;
    api
      .countyTree(county)
      .then((data) => {
        if (cancelled) return;
        setTree(data);
        const firstCon = data.constituencies[0];
        const firstWard = firstCon?.wards[0];
        if (firstCon) setExpanded(new Set([firstCon.id]));
        if (firstWard) setSelectedWard({ id: firstWard.id, name: firstWard.name });
      })
      .catch((err) => {
        if (!cancelled) setTreeError(err instanceof Error ? err.message : "Failed to load geography");
      });
    return () => {
      cancelled = true;
    };
  }, [county]);

  // Load stations whenever the selected ward changes.
  useEffect(() => {
    if (!selectedWard) return;
    let cancelled = false;
    setLoadingStations(true);
    api
      .wardStations(selectedWard.id)
      .then((data) => {
        if (!cancelled) setWardData(data);
      })
      .catch(() => {
        if (!cancelled) setWardData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingStations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWard]);

  const countyLabel = useMemo(() => {
    if (!tree) return "";
    // Title-case the register's uppercase county name (e.g. "NAKURU" -> "Nakuru").
    return tree.county.name.charAt(0) + tree.county.name.slice(1).toLowerCase();
  }, [tree]);

  function toggleConstituency(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleStationAdded(station: Station) {
    setWardData((prev) => (prev ? { ...prev, stations: [...prev.stations, station] } : prev));
    setModalOpen(false);
  }

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ padding: "14px 32px 0 32px", fontSize: 12, color: colors.textFaint }}>
        <span style={{ color: colors.textPrimary }}>{workspaceName}</span>
        &nbsp;&gt;&nbsp; Geography
      </div>

      {/* Title + badge */}
      <div style={{ padding: "10px 32px 0 32px", display: "flex", alignItems: "center", gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Geography</h1>
        <span
          style={{
            padding: "3px 10px",
            background: colors.badgeBg,
            color: colors.badgeText,
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 2,
          }}
        >
          Read-only · from the station register
        </span>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "12px 32px",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button
          type="button"
          onClick={() => selectedWard && setModalOpen(true)}
          disabled={!selectedWard}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            height: 40,
            padding: "0 12px",
            fontSize: 14,
            color: colors.accent,
            fontWeight: 600,
            background: "transparent",
            border: 0,
            cursor: selectedWard ? "pointer" : "default",
            opacity: selectedWard ? 1 : 0.5,
          }}
        >
          <PlusIcon />
          Add a missing station
        </button>
        <a
          href={selectedWard ? api.exportUrl(selectedWard.id) : undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            height: 40,
            padding: "0 12px",
            fontSize: 14,
            color: colors.textSecondary,
            background: "transparent",
            textDecoration: "none",
            pointerEvents: selectedWard ? "auto" : "none",
            opacity: selectedWard ? 1 : 0.5,
          }}
        >
          <DownloadIcon />
          Export station list
        </a>
      </div>

      {/* Content: tree + table */}
      <div style={{ flexGrow: 1, overflow: "hidden", padding: "20px 32px", display: "flex", gap: 20 }}>
        {/* Left: county tree */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            background: colors.panelBg,
            border: `1px solid ${colors.border}`,
            padding: "14px 16px",
            boxSizing: "border-box",
            overflowY: "auto",
          }}
        >
          <h2 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600 }}>
            {countyLabel || "…"}
          </h2>
          {treeError && <div style={{ fontSize: 13, color: "#a4262c" }}>{treeError}</div>}
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              fontSize: 13,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {tree?.constituencies.map((con) => (
              <ConstituencyNode
                key={con.id}
                constituency={con}
                expanded={expanded.has(con.id)}
                selectedWardId={selectedWard?.id ?? null}
                onToggle={() => toggleConstituency(con.id)}
                onSelectWard={(w) => setSelectedWard({ id: w.id, name: w.name })}
              />
            ))}
          </ul>
        </div>

        {/* Right: stations table */}
        <div
          style={{
            flexGrow: 1,
            background: colors.panelBg,
            border: `1px solid ${colors.border}`,
            padding: "16px 18px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {selectedWard ? `Polling stations — ${selectedWard.name}` : "Polling stations"}
          </h2>

          <div style={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: colors.rowHover, textAlign: "left" }}>
                  {["Code", "Station", "Registered voters", "Agent"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "9px 10px",
                        fontWeight: 600,
                        borderBottom: `1px solid ${colors.borderStrong}`,
                        position: "sticky",
                        top: 0,
                        background: colors.rowHover,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingStations && (
                  <tr>
                    <td colSpan={4} style={{ padding: 14, color: colors.textMuted }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loadingStations &&
                  wardData?.stations.map((s) => (
                    <tr key={s.id}>
                      <td style={cellStyle}>{s.code ?? "—"}</td>
                      <td style={cellStyle}>{s.name}</td>
                      <td style={cellStyle}>
                        {s.registered_voters != null ? s.registered_voters.toLocaleString() : "—"}
                      </td>
                      <td style={{ ...cellStyle, color: s.agent ? colors.textPrimary : colors.warn }}>
                        {s.agent ?? "Unassigned"}
                      </td>
                    </tr>
                  ))}
                {!loadingStations && wardData && wardData.stations.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 14, color: colors.textMuted }}>
                      No stations recorded for this ward.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: "auto",
              background: colors.calloutBg,
              borderLeft: `4px solid ${colors.accent}`,
              padding: "13px 15px",
              fontSize: 13,
              lineHeight: 1.6,
              color: colors.calloutText,
            }}
          >
            Agents are assigned by your campaign manager, in their own portal. You see every
            assignment here as it is made, but you do not have to do the staffing yourself.
          </div>
        </div>
      </div>

      {modalOpen && selectedWard && (
        <AddStationModal
          wardId={selectedWard.id}
          wardName={selectedWard.name}
          onClose={() => setModalOpen(false)}
          onAdded={handleStationAdded}
        />
      )}
    </>
  );
}

const cellStyle = {
  padding: 10,
  borderBottom: `1px solid ${colors.border}`,
};

interface ConstituencyNodeProps {
  constituency: Constituency;
  expanded: boolean;
  selectedWardId: string | null;
  onToggle: () => void;
  onSelectWard: (ward: { id: string; name: string }) => void;
}

function ConstituencyNode({
  constituency,
  expanded,
  selectedWardId,
  onToggle,
  onSelectWard,
}: ConstituencyNodeProps) {
  const label =
    constituency.name.charAt(0) + constituency.name.slice(1).toLowerCase();
  return (
    <li style={{ listStyle: "none" }}>
      <div
        onClick={onToggle}
        style={{
          padding: "7px 9px",
          cursor: "pointer",
          fontWeight: expanded ? 600 : 400,
          background: expanded ? colors.selected : "transparent",
          color: colors.textSecondary,
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10, color: colors.textMuted, width: 8 }}>
          {expanded ? "▾" : "▸"}
        </span>
        {label}
      </div>
      {expanded && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {constituency.wards.map((w) => {
            const selected = w.id === selectedWardId;
            return (
              <li
                key={w.id}
                onClick={() => onSelectWard(w)}
                style={{
                  padding: "7px 9px 7px 24px",
                  cursor: "pointer",
                  color: selected ? colors.accentDark : colors.textMuted,
                  fontWeight: selected ? 600 : 400,
                  background: selected ? colors.selected : "transparent",
                }}
              >
                {w.name}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
