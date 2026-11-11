"use client";

import { ApiError } from "@/services/contracts/api-client";
import { useOverview } from "@/features/overview/hooks/use-overview";
import OverviewSummary from "./overview-summary";

export default function OverviewContent() {
  const {
    summary,
    error,
    isLoading,
    isRefreshing,
    refresh,
  } = useOverview();

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading overview"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            aria-hidden="true"
            className="h-40 rounded-2xl border border-slate-200 bg-white p-5 motion-safe:animate-pulse"
          >
            <div className="h-4 w-28 rounded bg-slate-100" />
            <div className="mt-5 h-8 w-20 rounded bg-slate-100" />
            <div className="mt-4 h-3 w-36 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    const needsLogin =
      error instanceof ApiError && error.status === 401;

    return (
      <div
        role="alert"
        className="rounded-2xl border border-slate-200 bg-white p-6"
      >
        <h2 className="font-semibold text-slate-900">
          {needsLogin
            ? "Sign in required"
            : "Unable to load your overview"}
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          {needsLogin
            ? "Sign in to VelaPal, then try again."
            : "Please try again in a moment."}
        </p>

        <button
          type="button"
          disabled={isRefreshing}
          onClick={() => {
            void refresh().catch(() => undefined);
          }}
          className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
        >
          {isRefreshing ? "Loading..." : "Try again"}
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <p className="text-sm text-slate-600">
        No overview data is available.
      </p>
    );
  }

  return <OverviewSummary summary={summary} />;
}
