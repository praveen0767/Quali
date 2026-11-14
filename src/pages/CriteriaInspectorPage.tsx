import React, { useEffect, useState } from 'react';
import { getCriteria, updateCriterionStatus } from '../lib/api/criteria';
import { CriteriaRubric, VerificationStatus } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge, BadgeVariant } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EvidenceCallout } from '../components/common/EvidenceCallout';

/**
 * Rubric statuses may use either the verification vocabulary or the decision
 * vocabulary; map decision values onto badge variants.
 */
function statusVariant(status: CriteriaRubric['status']): BadgeVariant {
  switch (status) {
    case 'DOES_NOT_MEET':
      return 'FAILED';
    case 'INSUFFICIENT_EVIDENCE':
      return 'INSUFFICIENT';
    default:
      return status as BadgeVariant;
  }
}

export function CriteriaInspectorPage() {
  const [rubrics, setRubrics] = useState<CriteriaRubric[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'HARD_GATES' | 'DOMAIN'>('ALL');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCriteria();
      setRubrics(data);
      if (data.length > 0) {
        setSelectedRubricId(data[0].id);
        setNoteInput(data[0].evaluatorNote || '');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve criteria inspection matrix.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedRubric = rubrics.find((r) => r.id === selectedRubricId) || rubrics[0];

  const handleStatusChange = async (newStatus: VerificationStatus) => {
    if (!selectedRubric) return;
    const updated = await updateCriterionStatus(selectedRubric.id, newStatus, noteInput);
    setRubrics((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const filteredRubrics = rubrics.filter((r) => {
    if (filterType === 'HARD_GATES') return r.isHardGate;
    if (filterType === 'DOMAIN') return !r.isHardGate;
    return true;
  });

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-5 h-[500px] rounded-2xl" />
          <Skeleton className="lg:col-span-7 h-[500px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorMessage message={error} onRetry={loadData} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E4E9F2]">
        <div>
          <h1 className="text-2xl font-bold text-[#0C1946]">Criteria Review &amp; Evidence Inspector</h1>
          <p className="text-xs text-[#526079] mt-0.5">
            Side-by-side auditable review pairing requirement clauses with verbatim document citations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="VERIFIED" icon="verified">
            Zero Hallucination Gate
          </Badge>
        </div>
      </div>

      {/* Main Asymmetric Split Pane (5 cols criteria list, 7 cols inspector) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Criteria Rubric List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4E9F2]">
              <span className="text-xs font-bold text-[#0C1946] uppercase tracking-wider">
                Opportunity Rubric
              </span>
              <div className="flex items-center gap-1">
                {(['ALL', 'HARD_GATES', 'DOMAIN'] as const).map((ft) => (
                  <button
                    key={ft}
                    onClick={() => setFilterType(ft)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      filterType === ft
                        ? 'bg-[#0C1946] text-white'
                        : 'bg-[#F6F8FC] text-[#526079] hover:bg-[#e7eeff]'
                    }`}
                  >
                    {ft === 'ALL' ? 'All' : ft === 'HARD_GATES' ? 'Hard Gates' : 'Domain'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {filteredRubrics.map((r) => {
                const isSelected = r.id === selectedRubric?.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setSelectedRubricId(r.id);
                      setNoteInput(r.evaluatorNote || '');
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                      isSelected
                        ? 'bg-[#E7EEFF] border-[#245FD2] shadow-xs'
                        : 'bg-white border-[#E4E9F2] hover:border-[#245FD2]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {r.isHardGate && (
                          <span className="bg-[#0C1946] text-white text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase">
                            Hard Gate
                          </span>
                        )}
                        <span className="text-[11px] text-[#526079] font-mono">{r.clauseCategory}</span>
                      </div>
                      <Badge variant={statusVariant(r.status)} size="sm">
                        {r.status}
                      </Badge>
                    </div>

                    <h4 className="text-xs font-bold text-[#0C1946] leading-snug">
                      {r.criterionTitle}
                    </h4>

                    <p className="text-[11px] text-[#526079] line-clamp-1 italic">
                      “{r.clauseExcerpt}”
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: Detailed Evidence Inspector (7 cols) */}
        {selectedRubric && (
          <div className="lg:col-span-7 space-y-4">
            <Card className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-[#E4E9F2] gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={selectedRubric.isHardGate ? 'NAVY' : 'COBALT'} size="sm">
                      {selectedRubric.isHardGate ? 'Statutory Hard Gate' : 'Domain Qualification'}
                    </Badge>
                    <span className="text-xs text-[#526079]">
                      {selectedRubric.opportunityTitle}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-[#0C1946] mt-1.5">
                    {selectedRubric.criterionTitle}
                  </h2>
                </div>
                <Badge variant={statusVariant(selectedRubric.status)} size="md" icon="verified">
                  {selectedRubric.status}
                </Badge>
              </div>

              {/* Requirement Clause Box */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#526079] uppercase tracking-wider">
                  Mandatory RFP Requirement Clause:
                </span>
                <div className="p-3 bg-[#F6F8FC] rounded-xl border border-[#E4E9F2] border-l-4 border-l-[#245FD2] text-xs text-[#0C1946] italic leading-relaxed">
                  “{selectedRubric.clauseExcerpt}”
                </div>
              </div>

              {/* Extracted Evidence Citation */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#159A98] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  Verbatim Extracted Proof Receipt:
                </span>

                {selectedRubric.evidenceCitation ? (
                  <EvidenceCallout
                    quote={selectedRubric.evidenceCitation.verbatimQuote}
                    documentName={selectedRubric.evidenceCitation.documentName}
                    pageNumber={selectedRubric.evidenceCitation.pageNumber}
                    lineNumber={selectedRubric.evidenceCitation.lineNumber}
                    confidence={selectedRubric.evidenceCitation.confidence}
                    status={statusVariant(selectedRubric.status)}
                    sha256={selectedRubric.evidenceCitation.sha256Hash}
                  />
                ) : (
                  <div className="p-4 bg-[#FEF7E0] border border-[#FEE180] rounded-xl text-xs text-[#B06000]">
                    No verbatim document proof currently indexed for this criterion.
                  </div>
                )}
              </div>

              {/* Auditor Assessment Note */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#0C1946]">
                  Verification Assessment &amp; Evaluator Note
                </label>
                <textarea
                  rows={2}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Enter verifiable audit reasoning..."
                  className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-xl text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
                />
              </div>

              {/* Human In The Loop Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-[#E4E9F2] flex-wrap gap-2">
                <span className="text-[11px] text-[#526079]">
                  Update Decision Status:
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleStatusChange('FAILED')}
                  >
                    Mark Failed
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleStatusChange('INSUFFICIENT')}
                  >
                    Flag Ambiguity
                  </Button>
                  <Button
                    variant="teal"
                    size="sm"
                    icon="check"
                    onClick={() => handleStatusChange('MEETS')}
                  >
                    Confirm Verifiable Match
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
