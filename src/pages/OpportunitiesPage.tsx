import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOpportunities } from '../lib/api/opportunities';
import { Opportunity } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EmptyState } from '../components/common/EmptyState';

export function OpportunitiesPage() {
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOpportunities();
      setOpportunities(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve opportunities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = opportunities.filter((opp) => {
    const matchesSearch =
      opp.title.toLowerCase().includes(search.toLowerCase()) ||
      opp.sponsor.toLowerCase().includes(search.toLowerCase()) ||
      opp.domainFocus.some((d) => d.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' || opp.category.toUpperCase() === selectedCategory;

    const matchesTier =
      selectedTier === 'ALL' || opp.matchTier === selectedTier;

    return matchesSearch && matchesCategory && matchesTier;
  });

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
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
          <h1 className="text-2xl font-bold text-[#0C1946]">Opportunity Workspace</h1>
          <p className="text-xs text-[#526079] mt-0.5">
            Discover and audit competitive graduate fellowships, research grants, and postdoctoral RFPs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon="rule"
            onClick={() => navigate('/criteria')}
          >
            Criteria Inspector
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="recommend"
            onClick={() => navigate('/recommendations')}
          >
            Match Recommendations
          </Button>
        </div>
      </div>

      {/* Filter Controls */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#526079] text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search fellowship, sponsor, or domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2] focus:bg-white"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['ALL', 'FELLOWSHIP', 'GRANT'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#0C1946] text-white shadow-2xs'
                    : 'bg-[#F6F8FC] text-[#526079] hover:bg-[#e7eeff]'
                }`}
              >
                {cat === 'ALL' ? 'All Types' : cat}
              </button>
            ))}
          </div>

          {/* Match Tier Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto justify-end">
            {[
              { id: 'ALL', label: 'All Eligibility' },
              { id: 'HIGH_MATCH', label: 'Eligible (90%+)' },
              { id: 'DISQUALIFIED', label: 'Disqualified' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTier(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedTier === t.id
                    ? 'bg-[#245FD2] text-white shadow-2xs'
                    : 'bg-[#F6F8FC] text-[#526079] hover:bg-[#e7eeff]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Opportunity Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No opportunities found"
          description="Try relaxing your search query or selecting 'All Types' to explore more programs."
          actionLabel="Reset Filters"
          onAction={() => {
            setSearch('');
            setSelectedCategory('ALL');
            setSelectedTier('ALL');
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((opp) => {
            const isHigh = opp.matchTier === 'HIGH_MATCH';
            const isDisqualified = opp.matchTier === 'DISQUALIFIED';

            return (
              <Card
                key={opp.id}
                hoverable
                onClick={() => setSelectedOpp(opp)}
                className={`p-5 flex flex-col justify-between space-y-4 border-t-4 ${
                  isHigh
                    ? 'border-t-[#137333]'
                    : isDisqualified
                    ? 'border-t-[#C5221F] bg-[#F6F8FC]/40'
                    : 'border-t-[#B06000]'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={opp.category === 'Fellowship' ? 'COBALT' : 'VIOLET'} size="sm">
                      {opp.category}
                    </Badge>
                    <Badge
                      variant={isHigh ? 'MEETS' : isDisqualified ? 'FAILED' : 'INSUFFICIENT'}
                      size="sm"
                      icon={isHigh ? 'verified' : isDisqualified ? 'block' : 'info'}
                    >
                      {isDisqualified ? 'Disqualified' : `${opp.matchScore}% Match`}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[#0C1946] leading-snug line-clamp-2">
                      {opp.title}
                    </h3>
                    <p className="text-xs text-[#526079] mt-0.5 truncate">
                      {opp.sponsor}
                    </p>
                  </div>

                  <div className="bg-[#F6F8FC] p-2.5 rounded-lg border border-[#E4E9F2] space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#526079]">Funding:</span>
                      <strong className="text-[#137333] font-semibold">{opp.fundingAmount}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#526079]">Deadline:</span>
                      <strong className="text-[#0C1946]">{opp.deadline}</strong>
                    </div>
                  </div>

                  <p className="text-xs text-[#526079] line-clamp-2 leading-relaxed">
                    {opp.rfpSummary}
                  </p>

                  {/* Domain Badges */}
                  <div className="flex flex-wrap gap-1">
                    {opp.domainFocus.slice(0, 3).map((d) => (
                      <span
                        key={d}
                        className="text-[10px] bg-white border border-[#E4E9F2] px-2 py-0.5 rounded-md text-[#526079]"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E4E9F2] flex items-center justify-between text-xs">
                  <span className="text-[#526079] font-mono text-[11px] truncate max-w-[160px]">
                    {opp.location}
                  </span>
                  <span className="text-[#245FD2] font-semibold hover:underline">
                    Inspect RFP →
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedOpp && (
        <Modal
          isOpen={!!selectedOpp}
          onClose={() => setSelectedOpp(null)}
          title={selectedOpp.title}
          subtitle={`Sponsored by ${selectedOpp.sponsor} • ${selectedOpp.category}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5 text-xs text-[#0C1946]">
            {/* Status Callout */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                selectedOpp.matchTier === 'HIGH_MATCH'
                  ? 'bg-[#E8F8F0] border-[#A6E3B8] text-[#137333]'
                  : selectedOpp.matchTier === 'DISQUALIFIED'
                  ? 'bg-[#FCE8E6] border-[#F8B4B4] text-[#C5221F]'
                  : 'bg-[#FEF7E0] border-[#FEE180] text-[#B06000]'
              }`}
            >
              <div className="space-y-0.5">
                <p className="font-bold text-sm">
                  {selectedOpp.matchTier === 'HIGH_MATCH'
                    ? 'Qualified: 90%+ Hard Criteria Aligned'
                    : selectedOpp.matchTier === 'DISQUALIFIED'
                    ? 'Disqualified by Strict Statutory Rule'
                    : 'Supplemental Proof Required'}
                </p>
                <p className="text-xs opacity-90">
                  {selectedOpp.matchTier === 'HIGH_MATCH'
                    ? 'All gates (Enrollment, GPA >= 3.75, F-1 Visa) verified against official records.'
                    : selectedOpp.matchTier === 'DISQUALIFIED'
                    ? 'Candidate F-1 status conflicts with U.S. Citizenship requirement.'
                    : '1 supplementary recommendation letter required to unlock.'}
                </p>
              </div>
              <span className="text-2xl font-bold font-mono shrink-0">
                {selectedOpp.matchScore}%
              </span>
            </div>

            {/* Key Metadata Table */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#F6F8FC] p-3.5 rounded-xl border border-[#E4E9F2]">
              <div>
                <span className="text-[#526079] block text-[10px] uppercase">Award Amount</span>
                <span className="font-bold text-[#137333]">{selectedOpp.fundingAmount}</span>
              </div>
              <div>
                <span className="text-[#526079] block text-[10px] uppercase">Deadline</span>
                <span className="font-bold">{selectedOpp.deadline}</span>
              </div>
              <div>
                <span className="text-[#526079] block text-[10px] uppercase">Citizenship Gating</span>
                <span className="font-bold">{selectedOpp.citizenshipRequirement}</span>
              </div>
            </div>

            {/* RFP Verbatim Quote */}
            <div className="space-y-1.5">
              <span className="font-bold text-[#0C1946] uppercase tracking-wider text-[11px]">
                Authoritative RFP Requirement Clause:
              </span>
              <p className="p-3 bg-[#F6F8FC] rounded-lg border-l-4 border-l-[#245FD2] border border-[#E4E9F2] italic text-[#0C1946] leading-relaxed">
                “{selectedOpp.rfpQuote}”
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E4E9F2]">
              <Button variant="secondary" size="sm" onClick={() => setSelectedOpp(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon="rule"
                onClick={() => {
                  setSelectedOpp(null);
                  navigate('/criteria');
                }}
              >
                Inspect Proof in Criteria Review
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
