import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCases } from '../lib/api/cases';
import { CaseRecord } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function CasesPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCases();
      setCases(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Cases directory service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  return (
    <div className="p-6 space-y-6 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <h1 className="text-xl font-bold font-mono text-on-surface">Reconciliation Cases</h1>
          <p className="text-xs text-on-surface-variant font-mono mt-0.5">
            Audit envelopes binding purchase orders to delivered vendor tax invoices.
          </p>
        </div>

        <button
          onClick={() => navigate('/documents/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-container text-on-primary-container text-xs font-mono font-bold rounded shadow-xs"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>+ New Intake Case</span>
        </button>
      </div>

      {error && (
        <ErrorMessage
          title="Cases Service Unavailable"
          message={error}
          onRetry={fetchCases}
        />
      )}

      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-4 font-mono">
          {cases.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/cases/${c.id}`)}
              className="p-5 rounded bg-surface-container-lowest border border-outline-variant/20 hover:border-primary/40 cursor-pointer transition-all shadow-xs space-y-3"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    folder_supervised
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-on-surface">{c.caseNumber}</h2>
                    <span className="text-[10px] text-on-surface-variant">
                      {c.vendorName} → {c.buyerName}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      c.status === 'CLEARED'
                        ? 'bg-secondary/10 text-secondary border-secondary/30'
                        : 'bg-error-container/30 text-error border-error/40 font-bold'
                    }`}
                  >
                    {c.status}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {c.documents.length} Documents
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-outline-variant/15 text-xs">
                <div>
                  <span className="text-[10px] text-on-surface-variant block uppercase">
                    Committed PO
                  </span>
                  <span className="text-on-surface font-semibold">
                    ₹{c.totalCommittedAmount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant block uppercase">
                    Billed Invoice
                  </span>
                  <span
                    className={c.varianceAmount > 0 ? 'text-error font-bold' : 'text-on-surface font-semibold'}
                  >
                    ₹{c.totalBilledAmount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant block uppercase">
                    Financial Variance
                  </span>
                  <span
                    className={c.varianceAmount > 0 ? 'text-error font-bold' : 'text-secondary font-bold'}
                  >
                    {c.varianceAmount > 0
                      ? `+₹${c.varianceAmount.toLocaleString()}`
                      : '₹0.00 (Zero Delta)'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-on-surface-variant block uppercase">
                    Last Updated
                  </span>
                  <span className="text-on-surface-variant text-[11px]">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
