import {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { buildsApi, type RecentBuild } from "@/api/builds";
import { useBuildStore } from "@/store/build";
import { useAuthStore } from "@/store/auth";
import { buildFilename } from "@/utils/buildFilename";
import BuildStatusIndicator from "./BuildStatusIndicator";
import styles from "./RecentBuildsPanel.module.css";

export interface RecentBuildsPanelHandle {
  refresh: () => void;
}

function formatAge(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const RecentBuildsPanel = forwardRef<RecentBuildsPanelHandle>(
  function RecentBuildsPanel(_, ref) {
    const [builds, setBuilds] = useState<RecentBuild[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const setActiveBuild = useBuildStore((s) => s.setActiveBuild);
    const user = useAuthStore((s) => s.user);

    const fetchBuilds = useCallback(async () => {
      if (!user) {
        setBuilds([]);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await buildsApi.recent();
        setBuilds(data);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load recent builds",
        );
      } finally {
        setLoading(false);
      }
    }, [user]);

    useImperativeHandle(ref, () => ({ refresh: fetchBuilds }), [fetchBuilds]);

    useEffect(() => {
      fetchBuilds();
    }, [fetchBuilds]);

    async function handleDownload(build: RecentBuild) {
      setDownloadingId(build.id);
      setError(null);
      try {
        const restored = await buildsApi.restore(build.id);
        setActiveBuild(restored);
        const filename = buildFilename(
          build.keyboardName ?? "keyboard",
          build.configHash,
          build.mcu,
        );
        await buildsApi.download(build.id, filename);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Download failed");
      } finally {
        setDownloadingId(null);
      }
    }

    if (!user) return null;
    if (builds.length === 0 && !loading && !error) return null;

    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Recent Builds</span>
          <button
            className={styles.refreshBtn}
            onClick={fetchBuilds}
            disabled={loading}
            aria-label="Refresh recent builds">
            {loading ? "…" : "↺"}
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <ul className={styles.list}>
          {builds.map((build, index) => (
            <li
              key={build.id}
              className={index === 0 ? styles.itemFirst : styles.item}>
              <div className={styles.itemTop}>
                <div className={styles.name}>
                  {build.keyboardName ?? "Unknown"}
                  <br />
                  <div className={styles.itemMeta}>
                    {build.configHash && (
                      <span className={styles.hash} title="Config hash">
                        #{build.configHash.slice(0, 8)}
                      </span>
                    )}
                    {build.createdAt && (
                      <span className={styles.age}>
                        {formatAge(build.createdAt)}
                      </span>
                    )}
                    {build.mode && (
                      <span className={styles.mode}>{build.mode}</span>
                    )}
                  </div>
                </div>
                {index === 0 &&
                  build.status === "success" &&
                  build.artifactAvailable && (
                    <button
                      className={styles.downloadBtnInline}
                      onClick={() => handleDownload(build)}
                      disabled={downloadingId === build.id}
                      title="Download firmware artifact">
                      {downloadingId === build.id
                        ? "Downloading…"
                        : "↓ Download Firmware"}
                    </button>
                  )}
                <BuildStatusIndicator status={build.status} variant="badge" />
              </div>

              {index > 0 &&
                build.status === "success" &&
                build.artifactAvailable &&
                build.mode === "ecs" && (
                  <button
                    className={styles.downloadBtn}
                    onClick={() => handleDownload(build)}
                    disabled={downloadingId === build.id}
                    title="Download this firmware artifact">
                    {downloadingId === build.id ? "Downloading…" : "↓ Download"}
                  </button>
                )}
            </li>
          ))}
        </ul>
      </div>
    );
  },
);
