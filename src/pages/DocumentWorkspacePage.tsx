import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getDocument, revalidateDocument } from '../lib/api/documents';
import { getReconciliation } from '../lib/api/reconciliation';
import { getRuns } from '../lib/api/runs';
import { Document, DocumentField, ReconciliationResult, AgentTrace } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { DocumentDetailSkeleton } from '../components/common/Skeleton';

type WorkspaceTab = 'overview' | 'extraction' | 'evidence' | 'validation' | 'reconciliation' | 'trace';

export function DocumentWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [document, setDocument] = useState<Document | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [trace, setTrace] = useState<AgentTrace | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  const [selectedField, setSelectedField] = useState<DocumentField | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Active Tab from query param or default to 'overview'
  const activeTab = (searchParams.get('tab') as WorkspaceTab) || 'overview';

  const setTab = (tab: WorkspaceTab) => {
    setSearchParams({ tab });
  };

  const loadDocumentData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const doc = await getDocument(id);
      setDocument(doc);
      if (doc.fields.length > 0) {
        // Default selected field to the first flagged or first item
        const flagged = doc.fields.find((f) => f.status === 'FLAGGED' || f.status === 'MISMATCH');
        setSelectedField(flagged || doc.fields[0]);
      }

      // Load matching reconciliation and trace if available
      try {
        const recon = await getReconciliation(doc.caseId);
        setReconciliation(recon);
      } catch {
        // Recon not critical
      }

      try {
        const runs = await getRuns();
        if (runs.length > 0) setTrace(runs[0]);
      } catch {
        // Trace not critical
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Document processing service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocumentData();
  }, [id]);

  const handleRevalidate = async () => {
    if (!id) return;
    setRevalidating(true);
    try {
      const updated = await revalidateDocument(id);
      setDocument(updated);
      setToast(`Document ${id} successfully revalidated against backend rules.`);
      setTimeout(() => setToast(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Revalidation request failed');
    } finally {
      setRevalidating(false);
    }
  };

  if (loading) {
    return <DocumentDetailSkeleton />;
  }

  if (error || !document) {
    return (
      <div className="p-8">
        <ErrorMessage
          title="Document Workspace Unavailable"
          message={error || `Document with ID "${id}" could not be retrieved from backend.`}
          onRetry={loadDocumentData}
        />
      </div>
    );
  }

  const isDegraded = document.quality.isDegraded;
  const isMismatch = document.status === 'MISMATCH' || document.status === 'REVIEW_REQUIRED';

  return (
    <div className="flex flex-col w-full min-h-full pb-10">
      {/* Toast */}
      {toast && (
        <div className="bg-secondary/15 border-b border-secondary/30 px-6 py-2 flex items-center justify-between text-xs font-mono text-secondary">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span>{toast}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* Workspace Top Header Bar */}
      <div className="px-6 py-4 bg-surface-container-lowest border-b border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-mono text-on-surface-variant">
            <span
              onClick={() => navigate('/documents')}
              className="hover:text-primary cursor-pointer transition-colors"
            >
              Documents
            </span>
            <span className="text-outline-variant">/</span>
            <span className="font-semibold text-primary">{document.name}</span>
            <span className="text-outline-variant">/</span>
            <span className="bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface">
              Case #{document.caseId}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-bold text-on-surface font-mono">{document.name}</h1>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                document.status === 'VERIFIED'
                  ? 'bg-secondary/10 text-secondary border-secondary/30'
                  : 'bg-error-container/30 text-error border-error/40'
              }`}
            >
              {document.status}
            </span>

            {isDegraded && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-tertiary-container/30 text-tertiary border border-tertiary/40">
                DEGRADED SCAN RESOLUTION
              </span>
            )}

            <span className="text-[10px] font-mono text-on-surface-variant">
              Type: {document.documentType} · Reliability: {(document.overallReliability * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRevalidate}
            disabled={revalidating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-mono transition-colors border border-outline-variant/30 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">autorenew</span>
            <span>{revalidating ? 'Revalidating...' : 'Revalidate Document'}</span>
          </button>

          {isMismatch && (
            <button
              onClick={() => navigate('/reviews/rev-001')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container text-xs font-mono font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">assignment_turned_in</span>
              <span>Open Human Review</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="px-6 bg-surface-container-low border-b border-outline-variant/20 flex gap-2 overflow-x-auto">
        {(
          [
            { id: 'overview', label: 'Overview', icon: 'info' },
            { id: 'extraction', label: 'Extraction', icon: 'table_rows' },
            { id: 'evidence', label: 'Evidence', icon: 'find_in_page' },
            { id: 'validation', label: 'Validation', icon: 'rule' },
            { id: 'reconciliation', label: 'Reconciliation', icon: 'compare_arrows' },
            { id: 'trace', label: 'Trace', icon: 'account_tree' },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-mono border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-primary text-primary font-bold bg-surface-container-high/40'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.id === 'extraction' && (
                <span className="text-[10px] px-1 bg-surface-container-high rounded text-on-surface-variant">
                  {document.fields.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="p-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant">
                  Overall Reliability
                </span>
                <div className="text-2xl font-bold font-mono text-on-surface">
                  {(document.overallReliability * 100).toFixed(1)}%
                </div>
                <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${document.overallReliability * 100}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant">
                  Field Coverage
                </span>
                <div className="text-2xl font-bold font-mono text-on-surface">
                  {document.fieldCoveragePercent}%
                </div>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  {document.fields.length} schema entities extracted
                </span>
              </div>

              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant">
                  Image Quality (IQA)
                </span>
                <div className="text-2xl font-bold font-mono text-on-surface">
                  {document.quality.resolutionDpi} DPI
                </div>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  Skew: {document.quality.skewAngle}° · Noise: {document.quality.noiseLevel}
                </span>
              </div>

              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant">
                  Integrity &amp; Tamper Score
                </span>
                <div className="text-2xl font-bold font-mono text-secondary">
                  {document.tamperSignal.detected ? 'ANOMALOUS' : 'PRISTINE'}
                </div>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  Anomaly score: {document.tamperSignal.score}
                </span>
              </div>
            </div>

            {/* Ingest Provenance Metadata */}
            <div className="rounded bg-surface-container-lowest border border-outline-variant/20 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-on-surface font-mono flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">fingerprint</span>
                <span>Cryptographic Provenance &amp; Ingestion Metadata</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant block uppercase">Original File Name</span>
                  <span className="text-on-surface font-semibold">{document.provenance.originalFileName}</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant block uppercase">Uploaded Timestamp</span>
                  <span className="text-on-surface font-semibold">{new Date(document.provenance.uploadedAt).toLocaleString()}</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant block uppercase">Uploaded Agent / User</span>
                  <span className="text-on-surface font-semibold">{document.provenance.uploadedBy}</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant block uppercase">OCR Engine &amp; Model</span>
                  <span className="text-secondary font-semibold">{document.provenance.ocrEngine}</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant block uppercase">Processing Latency</span>
                  <span className="text-primary font-semibold">{document.provenance.processingDurationMs}ms</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant block uppercase">Review State</span>
                  <span className="text-tertiary font-semibold">{document.reviewState}</span>
                </div>
              </div>

              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20 font-mono text-[11px] text-on-surface-variant break-all">
                <span className="text-on-surface font-bold">SHA-256 Checksum: </span>
                {document.provenance.sha256}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EXTRACTION */}
        {activeTab === 'extraction' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-on-surface-variant">
                Showing {document.fields.length} extracted fields validated against ontology schema
              </span>
              <button
                onClick={() => setTab('evidence')}
                className="text-xs font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Switch to Document Evidence Viewer</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>

            <div className="rounded bg-surface-container-lowest border border-outline-variant/20 overflow-hidden">
              <table className="w-full text-left font-sans text-xs">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-[10px] font-mono uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-medium">Field Entity</th>
                    <th className="py-2.5 px-4 font-medium">Normalized Value</th>
                    <th className="py-2.5 px-4 font-medium">Raw OCR Stream</th>
                    <th className="py-2.5 px-4 font-medium text-center">Reliability</th>
                    <th className="py-2.5 px-4 font-medium text-center">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 font-mono text-[11px]">
                  {document.fields.map((field) => (
                    <tr
                      key={field.id}
                      className={`hover:bg-surface-container-low/60 transition-colors ${
                        field.status === 'FLAGGED' ? 'bg-error-container/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-medium text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-primary">
                          label
                        </span>
                        <span>{field.label}</span>
                      </td>

                      <td className="py-3 px-4 text-on-surface font-semibold font-mono">
                        {field.value}
                      </td>

                      <td className="py-3 px-4 text-on-surface-variant font-mono text-[10px] truncate max-w-xs">
                        {field.rawValue}
                      </td>

                      <td className="py-3 px-4 text-center font-mono">
                        <span
                          className={
                            field.confidence >= 0.95
                              ? 'text-secondary font-bold'
                              : 'text-tertiary font-bold'
                          }
                        >
                          {field.confidence.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            field.status === 'VERIFIED' || field.status === 'MATCH'
                              ? 'bg-secondary/10 text-secondary'
                              : 'bg-error-container/40 text-error font-bold'
                          }`}
                        >
                          {field.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedField(field);
                            setTab('evidence');
                          }}
                          className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-primary text-[10px] font-mono transition-colors cursor-pointer border border-outline-variant/30"
                        >
                          [View Evidence]
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: EVIDENCE */}
        {activeTab === 'evidence' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visual Canvas (2 cols) */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
                <span className="font-semibold text-on-surface uppercase tracking-wider">
                  Document Preview Canvas &amp; Dynamic Bounding Boxes
                </span>
                <span>Click any field on the right to anchor &amp; zoom</span>
              </div>

              <div className="relative rounded overflow-hidden bg-surface-container-high border border-outline-variant/30 min-h-[500px]">
                {document.imageUrl ? (
                  <img
                    src={document.imageUrl}
                    alt="Document preview"
                    className="w-full h-full object-contain max-h-[600px] opacity-75"
                  />
                ) : (
                  <div className="p-12 text-center text-on-surface-variant font-mono">
                    Image preview unavailable for this intake
                  </div>
                )}

                {/* Interactive SVG Bounding Box Overlays */}
                <div className="absolute inset-0 pointer-events-none">
                  {document.fields.map((f) => {
                    const isSelected = selectedField?.id === f.id;
                    if (!f.boundingBox) return null;
                    const { x, y, w, h } = f.boundingBox;
                    return (
                      <div
                        key={f.id}
                        className={`absolute border transition-all ${
                          isSelected
                            ? 'border-2 border-primary bg-primary/20 shadow-lg'
                            : f.status === 'FLAGGED'
                            ? 'border border-error bg-error/10'
                            : 'border border-secondary/40 bg-secondary/5'
                        }`}
                        style={{
                          left: `${(x / 600) * 100}%`,
                          top: `${(y / 600) * 100}%`,
                          width: `${(w / 600) * 100}%`,
                          height: `${(h / 600) * 100}%`,
                        }}
                      >
                        {isSelected && (
                          <div className="absolute -top-6 left-0 bg-surface-container-lowest border border-primary text-primary px-1.5 py-0.5 rounded text-[9px] font-mono whitespace-nowrap shadow-md">
                            {f.label}: {f.value}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Evidence Inspector Side Panel (1 col) */}
            <div className="space-y-4">
              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <h3 className="font-semibold text-sm text-on-surface font-mono">
                    Evidence Inspector
                  </h3>
                  {selectedField && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        selectedField.status === 'VERIFIED'
                          ? 'bg-secondary/10 text-secondary'
                          : 'bg-error-container/30 text-error'
                      }`}
                    >
                      {selectedField.status}
                    </span>
                  )}
                </div>

                {selectedField ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-on-surface-variant block uppercase">
                        Selected Field
                      </span>
                      <span className="font-bold text-on-surface text-sm">
                        {selectedField.label}
                      </span>
                    </div>

                    <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20 space-y-1">
                      <span className="text-[10px] text-on-surface-variant block uppercase">
                        Normalized Value
                      </span>
                      <span className="text-primary font-bold">{selectedField.value}</span>
                    </div>

                    <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20 space-y-1">
                      <span className="text-[10px] text-on-surface-variant block uppercase">
                        Raw OCR Token Stream
                      </span>
                      <span className="text-on-surface text-[11px]">{selectedField.rawValue}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20">
                        <span className="text-on-surface-variant block uppercase">Confidence</span>
                        <span className="text-secondary font-bold">
                          {selectedField.confidence.toFixed(3)}
                        </span>
                      </div>
                      <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20">
                        <span className="text-on-surface-variant block uppercase">Page Number</span>
                        <span className="text-on-surface font-bold">
                          {selectedField.pageNumber || 1}
                        </span>
                      </div>
                    </div>

                    {selectedField.boundingBox && (
                      <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20 text-[10px]">
                        <span className="text-on-surface-variant block uppercase mb-0.5">
                          Bounding Box Coordinates
                        </span>
                        <span className="text-primary">
                          [x: {selectedField.boundingBox.x}, y: {selectedField.boundingBox.y}, w:{' '}
                          {selectedField.boundingBox.w}, h: {selectedField.boundingBox.h}]
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-on-surface-variant font-mono">
                    Select a field below to inspect evidence anchors.
                  </div>
                )}
              </div>

              {/* Field Quick Selector List */}
              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant block">
                  All Document Fields
                </span>
                <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-xs">
                  {document.fields.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => setSelectedField(f)}
                      className={`p-2 rounded cursor-pointer transition-colors flex items-center justify-between ${
                        selectedField?.id === f.id
                          ? 'bg-primary/10 border border-primary/40 text-primary'
                          : 'hover:bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      <span className="truncate">{f.label}</span>
                      <span className="text-[10px] opacity-80">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: VALIDATION */}
        {activeTab === 'validation' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>
                Deterministic Rule Validation: {document.validation.rulesPassed} of{' '}
                {document.validation.rulesChecked} rules passed
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] ${
                  document.validation.isValid
                    ? 'bg-secondary/10 text-secondary'
                    : 'bg-error-container/30 text-error'
                }`}
              >
                {document.validation.isValid ? 'ALL INVARIANTS PASS' : 'RULE FAILURE DETECTED'}
              </span>
            </div>

            <div className="space-y-3">
              {document.validation.rules.map((rule) => (
                <div
                  key={rule.ruleId}
                  className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          rule.status === 'PASS' ? 'text-secondary' : 'text-error'
                        }`}
                      >
                        {rule.status === 'PASS' ? 'check_circle' : 'cancel'}
                      </span>
                      <span className="font-semibold text-xs text-on-surface font-mono">
                        {rule.ruleId} — {rule.ruleName}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        rule.status === 'PASS'
                          ? 'bg-secondary/10 text-secondary border border-secondary/30'
                          : 'bg-error-container/30 text-error border border-error/40'
                      }`}
                    >
                      {rule.status}
                    </span>
                  </div>

                  <p className="text-xs text-on-surface-variant font-sans">{rule.description}</p>

                  <div className="p-2.5 rounded bg-surface-container-low font-mono text-[11px] text-on-surface flex items-center justify-between">
                    <span>Result: {rule.message}</span>
                    {rule.actual && <span className="text-primary font-bold">Observed: {rule.actual}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: RECONCILIATION */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-on-surface-variant">
                Cross-document matching against Case #{document.caseId}
              </span>
              <button
                onClick={() => navigate('/reconciliation')}
                className="text-xs font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open Full Cross-Document Reconciliation Cockpit</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </button>
            </div>

            {reconciliation ? (
              <div className="rounded bg-surface-container-lowest border border-outline-variant/20 p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 font-mono text-xs">
                  <div>
                    <span className="text-on-surface font-bold">Matched Pair: </span>
                    <span className="text-primary">
                      {reconciliation.sourceDocName} ↔ {reconciliation.targetDocName}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      reconciliation.status === 'MATCH'
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-error-container/30 text-error font-bold'
                    }`}
                  >
                    {reconciliation.status}
                  </span>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  {reconciliation.nodes.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      className="p-2.5 rounded bg-surface-container-low flex items-center justify-between"
                    >
                      <span className="text-on-surface font-medium">{n.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-on-surface-variant">{n.targetValue}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            n.status === 'MATCH'
                              ? 'text-secondary bg-secondary/10'
                              : 'text-error bg-error/10 font-bold'
                          }`}
                        >
                          {n.deltaLabel || n.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-on-surface-variant font-mono text-xs">
                No matching reconciliation record found for this document.
              </div>
            )}
          </div>
        )}

        {/* TAB 6: TRACE */}
        {activeTab === 'trace' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Agent Execution Pipeline Stages</span>
              <span>{trace ? `Run ID: ${trace.runId}` : 'Authoritative Runtime Trace'}</span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              {trace ? (
                trace.stages.map((st, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-outline-variant font-mono w-6">
                        0{i + 1}
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
                      <div>
                        <span className="font-semibold text-on-surface block">{st.label}</span>
                        <span className="text-[10px] text-on-surface-variant font-sans">
                          {st.component} · {st.outputSummary}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-[10px]">
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
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-on-surface-variant">
                  No trace recorded yet for this session.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
