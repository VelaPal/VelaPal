"use client";

import { ApiError } from "@/services/contracts/api-client";

type RequestStateProps = {
  error?: Error;
  loadingLabel?: string;
  onRetry: () => Promise<unknown>;
  isRetrying?: boolean;
};

export default function RequestState({ error, loadingLabel = "Loading...",onRetry,isRetrying = false}: RequestStateProps) {
  if (!error) {
    return (
      <p
        role="status"
        className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        {loadingLabel}
      </p>
    );
  }

  let message = "This section could not be loaded. Please try again.";

  if (error instanceof ApiError) {
    if (error.status === 401) {
      message = "Sign in to VelaPal, then try again.";
    } else if (error.status === 404) {
      message = "This record could not be found or is unavailable.";
    }
  }

  return (
    <div
      role="alert"
      className="rounded-2xl border border-slate-200 bg-white p-6"
    >
      <p className="text-sm leading-6 text-slate-600">
        {message}
      </p>

      <button
        type="button"
        disabled={isRetrying}
        onClick={() => {void onRetry().catch(() => undefined);
}}
        className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
      >
        {isRetrying ? "Loading..." : "Try again"}
      </button>
    </div>
  );
}
