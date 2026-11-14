import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecommendations } from '../lib/api/recommendations';
import { OpportunityRecommendation } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';

export function RecommendationsPage() {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<OpportunityRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'ALL' | 'QUALIFIED' | 'DISQUALIFIED'>('ALL');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecommendations();
      setRecommendations(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve match recommendations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = recommendations.filter((rec) => {
    if (selectedTab === 'QUALIFIED') return rec.tier !== 'DISQUALIFIED';
    if (selectedTab === 'DISQUALIFIED') return rec.tier === 'DISQUALIFIED';
    return true;
  });

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
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
          <h1 className="text-2xl font-bold text-[#0C1946]">Personalized Match Recommendations</h1>
          <p className="text-xs text-[#526079] mt-0.5">
            Transparent deterministic matching. Discover why you qualify and receive concrete gap-bridging guidance.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 bg-[#F6F8FC] p-1 rounded-xl border border-[#E4E9F2]">
          {(['ALL', 'QUALIFIED', 'DISQUALIFIED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedTab === tab
                  ? 'bg-white text-[#0C1946] shadow-xs'
                  : 'text-[#526079] hover:text-[#0C1946]'
              }`}
            >
              {tab === 'ALL'
                ? `All (${recommendations.length})`
                : tab === 'QUALIFIED'
                ? 'Qualified (3)'
                : 'Disqualified (1)'}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendation Cards */}
      <div className="space-y-4">
        {filtered.map((rec) => {
          const isHigh = rec.tier === 'HIGH_MATCH';
          const isDisqualified = rec.tier === 'DISQUALIFIED';

          return (
            <Card
              key={rec.id}
              className={`p-6 border-l-4 space-y-4 ${
                isHigh
                  ? 'border-l-[#137333]'
                  : isDisqualified
                  ? 'border-l-[#C5221F] bg-[#F6F8FC]/50'
                  : 'border-l-[#B06000]'
              }`}
            >
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={isHigh ? 'MEETS' : isDisqualified ? 'FAILED' : 'INSUFFICIENT'}>
                      {isHigh
                        ? 'High Confidence Match'
                        : isDisqualified
                        ? 'Mathematically Disqualified'
                        : 'Supplemental Evidence Needed'}
                    </Badge>
                    <span className="text-xs text-[#526079]">•</span>
                    <span className="text-xs text-[#526079] font-medium">{rec.opportunity.category}</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#0C1946]">
                    {rec.opportunity.title}
                  </h3>
                  <p className="text-xs text-[#526079]">
                    {rec.opportunity.sponsor} • Award: <strong className="text-[#137333] font-semibold">{rec.opportunity.fundingAmount}</strong> • Deadline: <strong className="text-[#0C1946]">{rec.opportunity.deadline}</strong>
                  </p>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <span className={`text-3xl font-extrabold font-mono ${isDisqualified ? 'text-[#C5221F]' : 'text-[#245FD2]'}`}>
                    {rec.matchPercent}%
                  </span>
                  <span className="block text-[10px] text-[#526079] font-mono uppercase">
                    Audit Score
                  </span>
                </div>
              </div>

              {/* Rationale Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Qualifying Factors */}
                {rec.qualifyingClauses.length > 0 && (
                  <div className="p-3.5 bg-[#E8F8F0] rounded-xl border border-[#A6E3B8] space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[#137333]">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      <span>Verified Qualifying Criteria</span>
                    </div>
                    <ul className="space-y-1.5 pl-5 list-disc text-[#137333]/90">
                      {rec.qualifyingClauses.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Disqualifying / Missing Factors */}
                {rec.disqualifyingClauses.length > 0 && (
                  <div className="p-3.5 bg-[#FCE8E6] rounded-xl border border-[#F8B4B4] space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[#C5221F]">
                      <span className="material-symbols-outlined text-[16px]">cancel</span>
                      <span>Disqualifying Clauses</span>
                    </div>
                    <ul className="space-y-1.5 pl-5 list-disc text-[#C5221F]/90">
                      {rec.disqualifyingClauses.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Actionable Gap Bridge Guidance */}
              {rec.gapBridgeActions.length > 0 && (
                <div className="p-3 bg-[#F6F8FC] rounded-xl border border-[#E4E9F2] flex items-start gap-2.5 text-xs text-[#0C1946]">
                  <span className="material-symbols-outlined text-[18px] text-[#245FD2] shrink-0 mt-0.5">
                    lightbulb
                  </span>
                  <div>
                    <span className="font-bold text-[#245FD2]">Bridge The Gap: </span>
                    <span className="text-[#526079]">{rec.gapBridgeActions[0]}</span>
                  </div>
                </div>
              )}

              {/* Card Action Footer */}
              <div className="pt-2 border-t border-[#E4E9F2] flex items-center justify-between text-xs">
                <span className="text-[#526079]">
                  RFP: {rec.opportunity.citizenshipRequirement}
                </span>
                {!isDisqualified ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon="rule"
                    onClick={() => navigate('/criteria')}
                  >
                    Open Criteria Inspector
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-[#C5221F]">
                    Disqualification Gated
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
