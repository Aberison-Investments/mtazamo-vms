import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api, type ElectionRun, type Workspace } from "../api";
import { portal } from "../portalTheme";

interface Ctx {
  workspace: Workspace;
  myRole: string;
  activeRun: ElectionRun | null;   // the open/tallying run — used to gate submissions
  viewedRun: ElectionRun | null;   // the run displayed in the war room — can be any run
  runs: ElectionRun[];
  setActiveRun: (run: ElectionRun | null) => void;
  setViewedRun: (run: ElectionRun | null) => void;
  refreshRuns: () => Promise<void>;
}

const WorkspaceContext = createContext<Ctx | null>(null);

export function useWorkspaceContext(): Ctx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaceContext used outside WorkspaceLayout");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [myRole, setMyRole] = useState<string>("aspirant");
  const [runs, setRuns] = useState<ElectionRun[]>([]);
  const [activeRun, setActiveRun] = useState<ElectionRun | null>(null);
  const [viewedRun, setViewedRun] = useState<ElectionRun | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getWorkspace(id)
      .then(({ workspace: w, my_role }) => {
        setWorkspace(w);
        setMyRole(my_role);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const refreshRuns = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.listRuns(id);
      setRuns(res.runs);
      setActiveRun(res.active_run);
      // On first load, default viewedRun to the active run, or the most recent run if none is active.
      setViewedRun((prev) => prev ?? res.active_run ?? res.runs[0] ?? null);
    } catch {
      // non-fatal
    }
  }, [id]);

  useEffect(() => {
    if (workspace) refreshRuns();
  }, [workspace, refreshRuns]);

  if (notFound) return <Navigate to="/workspaces" replace />;

  if (!workspace) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: portal.font,
          color: portal.textSubtle,
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ workspace, myRole, activeRun, viewedRun, runs, setActiveRun, setViewedRun, refreshRuns }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
