/**
 * The always-visible status strip.
 *
 * Exports and transcriptions both run for minutes on the server, and neither
 * had any presence outside the screen that started it — so leaving that screen
 * meant losing sight of the work entirely. This sits in the top bar, is visible
 * from every screen, and stays until the job is finished and acknowledged.
 *
 * Deliberately compact. It reports that something is happening and roughly how
 * far along; the screen that owns the job shows the detail.
 */

import { dismissActivity, useActivities, type Activity } from "./activity";

const KIND_LABELS: Record<Activity["kind"], string> = {
  export: "Export",
  subtitles: "Subtitles",
};

export const ActivityBar: React.FC = () => {
  const activities = useActivities();
  if (!activities.length) return null;

  return (
    <div className="activity">
      {activities.map((a) => (
        <div key={a.id} className={`activity-item ${a.state}`}>
          <div className="activity-head">
            <span className="activity-kind">{KIND_LABELS[a.kind]}</span>
            <span className="muted activity-label" title={a.label}>
              {a.label}
            </span>
            {a.state === "working" ? (
              <span className="muted small">
                {a.percent != null ? `${a.percent}%` : (a.detail ?? "…")}
              </span>
            ) : (
              /*
                Finished items stay until dismissed. An export that completes
                while the editor is on another screen would otherwise vanish
                without ever having been seen.
              */
              <button
                className="link activity-dismiss"
                onClick={() => dismissActivity(a.id)}
                title="Dismiss"
              >
                ✕
              </button>
            )}
          </div>

          {a.state === "working" ? (
            <div className="bar">
              <div
                className={a.percent == null ? "bar-fill indeterminate" : "bar-fill"}
                style={a.percent != null ? { width: `${a.percent}%` } : undefined}
              />
            </div>
          ) : (
            <span className={a.state === "error" ? "error small" : "ok small"}>
              {a.state === "error" ? (a.error ?? "Failed") : "Done"}
            </span>
          )}

          {/* The stage matters most while a model is downloading — that is the
              part that can take minutes with nothing else to look at. */}
          {a.state === "working" && a.percent != null && a.detail ? (
            <span className="muted activity-stage">{a.detail}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
};
