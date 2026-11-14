import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRun } from '../lib/api/runs';
import { AgentTrace } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getRun(id)
      .then((data) => setTrace(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Run trace could not be loaded.')
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !trace) {
    return (
      <div className="p-8">
        <ErrorMessage
          title="Agent Run Offline"
          message={error || `Run ID "${id}" could not be retrieved from backend.`}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 pb-12 max-w-5xl mx-auto font-sans">
      {/* Breadcrumbs */}
      <div className="flex items-center justify-between font-mono text-xs text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span onClick={() => navigate('/runs')} className="hover:text-primary cursor-pointer">
            Agent Runs
          </span>
          <span className="text-outline-variant">/</span>
          <span className="font-bold text-primary">{trace.runId}</span>
        </div>
        <button
          onClick={() => navigate('/runs')}
          className="hover:text-on-surface flex items-center gap-1 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to Runs</span>
        </button>
      </div>

      {/* Header Card */}
      <div className="p-6 rounded bg-surface-container-lowest border border-outline-variant/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-xl font-bold text-on-surface">{trace.runId}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  trace.overallStatus === 'COMPLETED'
                    ? 'bg-secondary/10 text-secondary'
                    : 'bg-error-container/30 text-error'
                }`}
              >
                {trace.overallStatus}
              </span>
            </div>
            <div className="text-xs text-on-surface-variant font-mono mt-1">
              Case #{trace.caseId} · Runtime: {trace.runtimeVersion}
            </div>
          </div>

          <div className="text-right font-mono text-xs">
            <span className="text-on-surface-variant block text-[10px] uppercase">
              Total Execution Time
            </span>
            <span className="text-secondary font-bold text-base">{trace.totalDurationMs}ms</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant block uppercase">Engine Latency</span>
            <span className="text-primary font-bold">{trace.engineLatencyMs}ms</span>
          </div>
          <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant block uppercase">Stages Executed</span>
            <span className="text-on-surface font-bold">{trace.stages.length}</span>
          </div>
          <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant block uppercase">MCP Tool Calls</span>
            <span className="text-on-surface font-bold">{trace.mcpToolExecutions.length}</span>
          </div>
          <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant block uppercase">Started At</span>
            <span className="text-on-surface">{new Date(trace.startedAt).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: MCP TOOL EXECUTION VIEW */}
      <div className="rounded bg-surface-container-lowest border border-outline-variant/30 p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              hub
            </span>
            <div>
              <h2 className="text-sm font-bold font-mono text-on-surface">
                MCP Tool Execution Control Plane
              </h2>
              <span className="text-[10px] font-mono text-on-surface-variant">
                Model Context Protocol Lifecycle &amp; Security Gate Attestation
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-secondary bg-secondary/10 px-2 py-0.5 rounded border border-secondary/25">
            VERIFIED REGISTRY
          </span>
        </div>

        {/* MCP Lifecycle Pipeline Visualizer */}
        <div className="p-4 rounded bg-surface-container-low border border-outline-variant/20 overflow-x-auto">
          <div className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider mb-2 font-semibold">
            Control-Plane Invariant Pipeline Flow:
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] min-w-max text-on-surface">
            <span className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/30">
              Tool Request
            </span>
            <span className="text-primary font-bold">↓</span>
            <span className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/30">
              MCP Registry
            </span>
            <span className="text-primary font-bold">↓</span>
            <span className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/30 text-secondary">
              Schema Validation
            </span>
            <span className="text-primary font-bold">↓</span>
            <span className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/30">
              Ownership
            </span>
            <span className="text-primary font-bold">↓</span>
            <span className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/30 text-tertiary">
              Risk Classification
            </span>
            <span className="text-primary font-bold">↓</span>
            <span className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/30 text-primary">
              Policy
            </span>
            <span className="text-primary font-bold">↓</span>
            <span className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/30">
              Execution
            </span>
            <span className="text-primary font-bold">↓</span>
            <span className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant/30 font-bold">
              Result
            </span>
          </div>
        </div>

        {/* Tool Execution Rows */}
        <div className="space-y-3 font-mono text-xs">
          {trace.mcpToolExecutions.map((tool) => (
            <div
              key={tool.stepNumber}
              className="p-4 rounded bg-surface-container-low border border-outline-variant/20 space-y-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-outline-variant font-bold">
                    STEP 0{tool.stepNumber}
                  </span>
                  <span className="font-bold text-on-surface">{tool.toolName}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded ${
                      tool.riskClassification === 'HIGH'
                        ? 'bg-error-container/40 text-error'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    RISK: {tool.riskClassification}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-on-surface-variant">
                    Policy: <strong className="text-on-surface">{tool.policyApplied}</strong>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      tool.executionStatus === 'SUCCESS'
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-error-container/40 text-error'
                    }`}
                  >
                    {tool.executionStatus} ({tool.durationMs}ms)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="p-2.5 rounded bg-surface-container-lowest border border-outline-variant/15 space-y-1">
                  <span className="text-[9px] text-on-surface-variant uppercase block">
                    Request Payload:
                  </span>
                  <pre className="text-primary text-[10px] overflow-x-auto whitespace-pre-wrap">
                    {tool.requestPayload}
                  </pre>
                </div>
                <div className="p-2.5 rounded bg-surface-container-lowest border border-outline-variant/15 space-y-1">
                  <span className="text-[9px] text-on-surface-variant uppercase block">
                    Result Payload:
                  </span>
                  <pre
                    className={`text-[10px] overflow-x-auto whitespace-pre-wrap ${
                      tool.executionStatus === 'HALTED' ? 'text-error font-bold' : 'text-secondary'
                    }`}
                  >
                    {tool.resultPayload}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: EXPANDABLE AGENT TRACE STAGES */}
      <div className="rounded bg-surface-container-lowest border border-outline-variant/30 p-6 space-y-4">
        <h2 className="text-sm font-bold font-mono text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">
            timeline
          </span>
          <span>Pipeline Diagnostic Stages (Expandable)</span>
        </h2>

        <div className="space-y-2 font-mono text-xs">
          {trace.stages.map((st, i) => {
            const isExpanded = expandedStage === i;
            return (
              <div
                key={i}
                className="rounded border border-outline-variant/20 bg-surface-container-low overflow-hidden"
              >
                <div
                  onClick={() => setExpandedStage(isExpanded ? null : i)}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-surface-container-high/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-outline-variant w-5">
                      {i < 9 ? `0${i + 1}` : i + 1}
                    </span>
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        st.status === 'COMPLETED'
                          ? 'text-secondary'
                          : st.status === 'VIOLATION_HALTED'
                          ? 'text-error'
                          : 'text-tertiary'
                      }`}
                    >
                      {st.status === 'COMPLETED'
                        ? 'check_circle'
                        : st.status === 'VIOLATION_HALTED'
                        ? 'cancel'
                        : 'pending'}
                    </span>
                    <span className="font-semibold text-on-surface">{st.label}</span>
                  </div>

                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-on-surface-variant">{st.durationMs}ms</span>
                    <span
                      className={`px-2 py-0.5 rounded ${
                        st.status === 'COMPLETED'
                          ? 'bg-secondary/10 text-secondary'
                          : 'bg-error-container/30 text-error font-bold'
                      }`}
                    >
                      {st.status}
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 bg-surface-container-lowest border-t border-outline-variant/15 text-xs space-y-2">
                    <div className="flex justify-between text-[11px] text-on-surface-variant">
                      <span>Component: <strong className="text-on-surface">{st.component}</strong></span>
                      <span>Timestamp: {st.timestamp}</span>
                    </div>
                    {st.inputSummary && (
                      <div className="p-2 bg-surface-container-low rounded text-[11px]">
                        <span className="text-on-surface-variant block uppercase text-[9px]">
                          Input Summary:
                        </span>
                        <span className="text-on-surface">{st.inputSummary}</span>
                      </div>
                    )}
                    {st.outputSummary && (
                      <div className="p-2 bg-surface-container-low rounded text-[11px]">
                        <span className="text-on-surface-variant block uppercase text-[9px]">
                          Output Summary:
                        </span>
                        <span className="text-primary font-bold">{st.outputSummary}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
