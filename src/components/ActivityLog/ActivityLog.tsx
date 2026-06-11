"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { XIcon } from "@/components/Icons";
import { api, authFetch } from "@/lib/apiBase";

interface ActivityLogProps {
  open: boolean;
  onClose: () => void;
  workspace:
    | { type: "personal" }
    | { type: "team"; teamId: string; teamName: string; role: "owner" | "editor" | "viewer" };
}

interface ActivityEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorEmail: string;
}

const PAGE_SIZE = 50;

// Consistent color per user based on email hash
const USER_COLORS = [
  { bg: "bg-tilli/10", text: "text-tilli/60", dot: "bg-tilli/50" },
  { bg: "bg-blue-500/10", text: "text-blue-400/60", dot: "bg-blue-400/50" },
  { bg: "bg-green-500/10", text: "text-green-400/60", dot: "bg-green-400/50" },
  { bg: "bg-yellow-500/10", text: "text-yellow-400/60", dot: "bg-yellow-400/50" },
  { bg: "bg-purple-500/10", text: "text-purple-400/60", dot: "bg-purple-400/50" },
  { bg: "bg-pink-500/10", text: "text-pink-400/60", dot: "bg-pink-400/50" },
  { bg: "bg-cyan-500/10", text: "text-cyan-400/60", dot: "bg-cyan-400/50" },
  { bg: "bg-orange-500/10", text: "text-orange-400/60", dot: "bg-orange-400/50" },
];

function getUserColor(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

const ACTION_LABELS: Record<string, string> = {
  "request.created": "created request",
  "request.updated": "updated request",
  "request.deleted": "deleted request",
  "request.executed": "executed request",
  "collection.created": "created collection",
  "collection.updated": "updated collection",
  "collection.deleted": "deleted collection",
  "folder.created": "created folder",
  "folder.deleted": "deleted folder",
  "member.added": "added member",
  "member.removed": "removed member",
  "member.role_changed": "changed member role",
  "environment.created": "created environment",
  "environment.deleted": "deleted environment",
};

const METHOD_COLORS: Record<string, string> = {
  GET: "#4ade80",
  POST: "#facc15",
  PUT: "#60a5fa",
  DELETE: "#f87171",
  PATCH: "#c084fc",
};

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

function extractMethod(entry: ActivityEntry): { method: string | null; displayName: string } {
  // 1. From metadata
  if (entry.metadata?.method) {
    const m = String(entry.metadata.method).toUpperCase();
    if (METHOD_COLORS[m]) {
      // For executed requests, resourceName is "GET https://..." — strip the method prefix
      let displayName = entry.resourceName || "";
      if (entry.action === "request.executed" && displayName.startsWith(m + " ")) {
        displayName = displayName.slice(m.length + 1);
      }
      return { method: m, displayName };
    }
  }
  // 2. From resourceName (e.g. "GET https://..." for request.executed)
  if (entry.resourceName && entry.action.startsWith("request.")) {
    const parts = entry.resourceName.split(" ");
    if (parts.length >= 2 && HTTP_METHODS.includes(parts[0].toUpperCase())) {
      return { method: parts[0].toUpperCase(), displayName: parts.slice(1).join(" ") };
    }
  }
  return { method: null, displayName: entry.resourceName || "" };
}

function formatAction(action: string): string {
  return ACTION_LABELS[action] || action;
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export default function ActivityLog({ open, onClose, workspace }: ActivityLogProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const teamId = workspace.type === "team" ? workspace.teamId : null;

  const fetchEntries = useCallback(
    async (offset: number, append: boolean) => {
      if (!teamId) return;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await authFetch(
          api(`/api/teams/${teamId}/activity?limit=${PAGE_SIZE}&offset=${offset}`),
          {
            headers: { "x-team-id": teamId },
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load activity (${res.status})`);
        }

        const data = await res.json();
        setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries));
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load activity");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [teamId]
  );

  // Fetch initial entries when panel opens
  useEffect(() => {
    if (open && teamId) {
      setEntries([]);
      setTotal(0);
      fetchEntries(0, false);
    }
  }, [open, teamId, fetchEntries]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Close when clicking backdrop
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  const handleLoadMore = useCallback(() => {
    fetchEntries(entries.length, true);
  }, [entries.length, fetchEntries]);

  if (!open) return null;

  const hasMore = entries.length < total;
  const isPersonal = workspace.type === "personal";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[var(--overlay-bg)]"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        data-testid="activity-log-panel"
        className="flex h-full w-[420px] flex-col border-l border-border-primary bg-surface-base shadow-xl animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-content-primary">Activity Log</h2>
            {workspace.type === "team" && (
              <p className="text-xs text-content-muted">{workspace.teamName}</p>
            )}
          </div>
          <button
            data-testid="activity-log-close"
            onClick={onClose}
            className="rounded p-1 text-content-muted transition-colors hover:bg-surface-secondary hover:text-content-secondary"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-surface-base scrollbar-thumb-border-primary hover:scrollbar-thumb-content-dim" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--scrollbar-thumb) var(--surface-base)" }}>
          {isPersonal ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16">
              <p className="text-xs text-content-muted">Activity logs are available for team workspaces</p>
              <p className="text-[10px] text-content-dim">
                Switch to a team workspace to view activity
              </p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-primary border-t-tilli" />
              <p className="text-xs text-content-muted">Loading activity...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16">
              <p className="text-xs text-red-400">{error}</p>
              <button
                onClick={() => fetchEntries(0, false)}
                className="rounded bg-surface-secondary px-3 py-1 text-xs text-content-secondary transition-colors hover:bg-surface-secondary"
              >
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div data-testid="activity-empty" className="flex flex-col items-center justify-center gap-2 px-4 py-16">
              <p className="text-xs text-content-muted">No activity yet</p>
              <p className="text-[10px] text-content-dim">
                Team actions will appear here as they happen
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border-secondary/50">
              {entries.map((entry, index) => {
                const color = getUserColor(entry.actorEmail);
                return (
                  <div
                    key={entry.id}
                    data-testid={`activity-entry-${index}`}
                    className="px-4 py-3 transition-colors hover:bg-surface-secondary/30"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Color dot avatar */}
                      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${color.bg}`}>
                        <span className={`text-[10px] font-bold ${color.text}`}>
                          {entry.actorEmail.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs">
                            <span className={`font-semibold ${color.text}`}>
                              {entry.actorEmail}
                            </span>{" "}
                            <span className="text-content-tertiary">
                              {formatAction(entry.action)}
                            </span>
                          </p>
                          <span className="shrink-0 text-[10px] text-content-dim">
                            {formatRelativeTime(entry.createdAt)}
                          </span>
                        </div>
                        {entry.resourceName && (() => {
                          const { method, displayName } = extractMethod(entry);
                          return (
                            <p className="mt-0.5 truncate text-xs text-content-muted">
                              {method ? (
                                <>
                                  <span className="font-bold" style={{ color: METHOD_COLORS[method] || "inherit" }}>
                                    {method}
                                  </span>{" "}
                                </>
                              ) : null}
                              {displayName}
                            </p>
                          );
                        })()}
                        {entry.metadata?.environment ? (
                          <span className="mt-1 inline-block rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-content-tertiary">
                            env: {String(entry.metadata.environment)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div className="px-4 py-3">
                  <button
                    data-testid="activity-load-more"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="w-full rounded border border-border-primary bg-surface-secondary px-3 py-1.5 text-xs text-content-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50"
                  >
                    {loadingMore ? "Loading..." : `Load more (${total - entries.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {entries.length > 0 && (
          <div className="border-t border-border-primary px-4 py-2">
            <p className="text-[10px] text-content-dim">
              Showing {entries.length} of {total} entries
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
