"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowUp,
  ArrowUpRight,
  Plus,
  ShoppingBag,
  Repeat2,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { agentService } from "@/services/contracts/agent.service";
import type { AgentRun } from "@/services/contracts/types";
import { useSession } from "@/features/auth/session";
import { Panel, Badge, ErrorNotice, useAction } from "@/components/ui/workflow";
type Turn = { prompt: string; run: AgentRun };
function RunReply({ run }: { run: AgentRun }) {
  const payload = run.result;
  const resultMode =
    payload &&
    typeof payload === "object" &&
    "modelMode" in payload &&
    (payload.modelMode === "live" || payload.modelMode === "fixture")
      ? payload.modelMode
      : undefined;
  const text =
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
      ? payload.message
      : typeof payload === "string"
        ? payload
        : null;
  return (
    <div className="vp-chat-reply">
      <div className="flex flex-wrap gap-2">
        <Badge>{run.status}</Badge>
        {(run.modelMode || resultMode) && (
          <Badge>
            {(run.modelMode || resultMode) === "live" ? "Live AI" : "Fixture AI"}
          </Badge>
        )}
        <Badge>PRIVATE</Badge>
      </div>
      {["QUEUED", "RUNNING"].includes(run.status) && (
        <p role="status">Vela is reviewing your question...</p>
      )}
      {run.status === "NEEDS_INFO" && (
        <p role="status">
          Vela needs more information. Review the open questions and add
          clarification before continuing.
        </p>
      )}
      {run.status === "STALE" && (
        <p>Context changed. Review the case and submit a new question.</p>
      )}
      {run.status === "ABSTAINED" && (
        <p>Vela could not provide a supported answer. Consider human review.</p>
      )}
      {run.status === "FAILED" && (
        <p>The run failed. You can submit a new question.</p>
      )}
      {text && <p>{text}</p>}
      {payload != null && !text && (
        <pre className="whitespace-pre-wrap break-words">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
export function Assistant({ caseId = null }: { caseId?: string | null }) {
  const { session } = useSession();
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [runId, setRunId] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const action = useAction();
  const result = useSWR(
    runId ? [session?.activeWorkspace.id, "agent", runId] : null,
    () => agentService.get(runId),
    {
      refreshInterval: (d) =>
        d && ["QUEUED", "RUNNING"].includes(d.status) ? 1500 : 0,
    },
  );
  const active = result.data ?? turns.at(-1)?.run;
  const busy =
    action.busy || (!!active && ["QUEUED", "RUNNING"].includes(active.status));
  if (session?.activeWorkspace.type === "ADMIN")
    return <p>Private party assistance is unavailable in Admin workspaces.</p>;
  if (!caseId && session?.activeWorkspace.type === "SELLER")
    return (
      <Panel title="Seller defense preparation">
        <p>
          Open an authorized case to prepare a private response using its
          evidence context.
        </p>
        <Link className="vp-link" href="/workspace/cases">
          Choose a case
        </Link>
      </Panel>
    );
  return (
    <section className="vp-chat-layout">
      <header className="vp-chat-header">
        <div className="vp-chat-title">
          <Image src="/velapal-logo.png" alt="" width={30} height={30} />
          <div>
            <h1>{caseId ? "Private preparation" : "Vela Assistant"}</h1>
            <p>
              {caseId
                ? "Only your party can access this assistance."
                : "Your personal agent. Your decisions."}
            </p>
          </div>
        </div>
        <button
          className="vp-link"
          disabled={busy}
          onClick={() => {
            setTurns([]);
            setRunId("");
            setPrompt("");
            input.current?.focus();
          }}
        >
          <Plus size={14} />
          New conversation
        </button>
      </header>
      {turns.length === 0 ? (
        <div className="vp-chat-welcome">
          <div className="vp-chat-logo">
            <Image
              src="/velapal-logo.png"
              alt="VelaPal sail"
              width={42}
              height={42}
            />
          </div>
          <p className="vp-eyebrow">A LITTLE HELP, RIGHT WHEN YOU NEED IT</p>
          <h2>
            {caseId
              ? "Let’s prepare your next step."
              : `What’s on your mind, ${session?.user.name.split(" ")[0] ?? "there"}?`}
          </h2>
          <p>
            {caseId
              ? "Review your evidence and prepare a private response."
              : "Make a purchase. Understand a bill. Find a way forward."}
            <br />
            {caseId
              ? "Nothing here grants consent or changes shared evidence."
              : "Vela keeps the context, so you don’t have to."}
          </p>
          <div className="vp-chat-suggestions">
            {[
              {
                title: "Find my next purchase",
                copy: "A Pocket Drive under $60",
                icon: ShoppingBag,
                prompt: "Help me find a Pocket Drive under $60.",
              },
              {
                title: "Check my subscriptions",
                copy: "See what’s renewing soon",
                icon: Repeat2,
                prompt: "Help me review my upcoming subscription renewals.",
              },
              {
                title: "Help with an order",
                copy: "Understand my case and options",
                icon: Scale,
                prompt: "Help me understand the next steps for an order issue.",
              },
            ].map((s) => (
              <button
                key={s.title}
                onClick={() => {
                  setPrompt(s.prompt);
                  input.current?.focus();
                }}
              >
                <s.icon size={18} />
                <ArrowUpRight size={13} />
                <strong>{s.title}</strong>
                <span>{s.copy}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="vp-chat-history" aria-label="Conversation">
          {turns.map((turn, i) => (
            <article key={turn.run.runId}>
              <p className="vp-chat-question">{turn.prompt}</p>
              <RunReply
                run={
                  i === turns.length - 1 && result.data ? result.data : turn.run
                }
              />
            </article>
          ))}
        </div>
      )}
      <div className="vp-chat-compose">
        <ErrorNotice error={result.error} />
        {action.feedback}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (busy || prompt.trim().length < 3) return;
            void action.run(async () => {
              const purpose = caseId
                ? session?.activeWorkspace.type === "SELLER"
                  ? "SELLER_PREPARATION"
                  : "CUSTOMER_PREPARATION"
                : "PERSONAL_ASSISTANT";
              const r = await agentService.start(
                purpose,
                caseId,
                prompt.trim(),
              );
              setTurns((v) => [
                ...v.map((t) =>
                  t.run.runId === result.data?.runId
                    ? { ...t, run: result.data }
                    : t,
                ),
                { prompt: prompt.trim(), run: r },
              ]);
              setRunId(r.runId);
              setPrompt("");
            }, "");
          }}
        >
          <textarea
            ref={input}
            aria-label="Your private question"
            placeholder="Ask Vela about a purchase, bill, or case..."
            rows={1}
            minLength={3}
            maxLength={5000}
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="vp-button"
            aria-label="Send message"
            disabled={busy || prompt.trim().length < 3}
          >
            <ArrowUp size={20} />
          </button>
        </form>
        <p>
          <ShieldCheck size={11} />
          You review and approve every payment or case action.
        </p>
      </div>
    </section>
  );
}
