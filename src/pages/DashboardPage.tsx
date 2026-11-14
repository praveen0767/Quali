import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile } from '../lib/api/profile';
import { getOpportunities } from '../lib/api/opportunities';
import { getTasks, updateTaskStatus } from '../lib/api/planner';
import { getIngestedDocuments } from '../lib/api/documents';
import { CandidateProfile, Opportunity, ApplicationTask, IngestedDocument } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EvidenceCallout } from '../components/common/EvidenceCallout';

export function DashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tasks, setTasks] = useState<ApplicationTask[]>([]);
  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, o, t, d] = await Promise.all([
        getProfile(),
        getOpportunities(),
        getTasks(),
        getIngestedDocuments(),
      ]);
      setProfile(p);
      setOpportunities(o);
      setTasks(t);
      setDocuments(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load My Day intelligence data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleTask = async (taskId: string, currentStatus: ApplicationTask['status']) => {
    const nextStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    const updated = await updateTaskStatus(taskId, nextStatus);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorMessage message={error || 'Unable to load profile data.'} onRetry={loadData} />
      </div>
    );
  }

  const highMatchOpps = opportunities.filter((o) => o.matchTier === 'HIGH_MATCH');
  const pendingTasks = tasks.filter((t) => t.status !== 'COMPLETED');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-16">
      {/* Hero: Candidate Dossier & Deterministic Status */}
      <Card className="p-6 bg-white overflow-hidden relative">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#E7EEFF] overflow-hidden shrink-0 border-2 border-[#245FD2]/20 shadow-xs">
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-[#0C1946]">{profile.fullName}</h1>
                <Badge variant="VERIFIED" icon="verified">
                  Stanford Registrar Verified
                </Badge>
                <Badge variant="COBALT">F-1 STEM OPT</Badge>
              </div>
              <p className="text-xs text-[#526079]">
                {profile.degree} • <strong className="text-[#0C1946]">{profile.institution}</strong> (Graduation: {profile.graduationDate})
              </p>
              <p className="text-xs text-[#526079] flex items-center gap-2 pt-0.5">
                <span>GPA: <strong className="text-[#0C1946]">3.92 / 4.0</strong></span>
                <span>•</span>
                <span>Focus: <strong className="text-[#245FD2]">{profile.focusVector}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              icon="upload_file"
              onClick={() => navigate('/documents')}
            >
              Ingest Document
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="verified"
              onClick={() => navigate('/report')}
            >
              View Certified Report
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <Card className="p-4 space-y-2 hoverable" onClick={() => navigate('/criteria')}>
          <div className="flex items-center justify-between text-[#526079]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Deterministic Gate</span>
            <span className="material-symbols-outlined text-[18px] text-[#245FD2]">rule</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0C1946]">88%</span>
            <span className="text-xs text-[#137333] font-medium">Hard Gates Met</span>
          </div>
          <p className="text-[11px] text-[#526079]">
            Conferral date &amp; GPA satisfy 14 active fellowship calls.
          </p>
        </Card>

        {/* KPI 2 */}
        <Card className="p-4 space-y-2 hoverable" onClick={() => navigate('/opportunities')}>
          <div className="flex items-center justify-between text-[#526079]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">High Match Opps</span>
            <span className="material-symbols-outlined text-[18px] text-[#159A98]">recommend</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0C1946]">{highMatchOpps.length}</span>
            <span className="text-xs text-[#159A98] font-medium">90%+ Confidence</span>
          </div>
          <p className="text-[11px] text-[#526079]">
            Stanford Bio-X ($58k) &amp; Google PhD ($65k).
          </p>
        </Card>

        {/* KPI 3 */}
        <Card className="p-4 space-y-2 hoverable" onClick={() => navigate('/documents')}>
          <div className="flex items-center justify-between text-[#526079]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Evidence Vault</span>
            <span className="material-symbols-outlined text-[18px] text-[#7545D6]">lock</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0C1946]">{documents.length}</span>
            <span className="text-xs text-[#7545D6] font-medium">Zero-Leak Enclave</span>
          </div>
          <p className="text-[11px] text-[#526079]">
            51 verified claims grounded with SHA-256 provenance.
          </p>
        </Card>

        {/* KPI 4 */}
        <Card className="p-4 space-y-2 hoverable" onClick={() => navigate('/planner')}>
          <div className="flex items-center justify-between text-[#526079]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Application Tasks</span>
            <span className="material-symbols-outlined text-[18px] text-[#B06000]">task_alt</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0C1946]">{pendingTasks.length}</span>
            <span className="text-xs text-[#B06000] font-medium">Pending Action</span>
          </div>
          <p className="text-[11px] text-[#526079]">
            Next deadline: Bio-X letter from Prof. Vance (May 20).
          </p>
        </Card>
      </div>

      {/* Main Grid: My Day Action Tasks vs Verifiable Proof Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: My Day Planner Action Center (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E9F2]">
              <div>
                <h2 className="text-base font-bold text-[#0C1946]">My Day Action Planner</h2>
                <p className="text-xs text-[#526079]">Prioritized items required to bridge eligibility gaps</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/planner')}>
                View Full Schedule →
              </Button>
            </div>

            <div className="space-y-2.5">
              {tasks.slice(0, 4).map((task) => {
                const isDone = task.status === 'COMPLETED';
                return (
                  <div
                    key={task.id}
                    className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                      isDone
                        ? 'bg-[#F6F8FC]/50 border-[#E4E9F2] opacity-70'
                        : 'bg-white border-[#E4E9F2] hover:border-[#245FD2]/30 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => handleToggleTask(task.id, task.status)}
                        className="mt-1 w-4 h-4 rounded text-[#245FD2] focus:ring-0 cursor-pointer"
                      />
                      <div className="space-y-0.5 min-w-0">
                        <p className={`text-xs font-semibold ${isDone ? 'line-through text-[#526079]' : 'text-[#0C1946]'}`}>
                          {task.title}
                        </p>
                        <p className="text-[11px] text-[#526079] truncate">
                          {task.opportunityTitle} • Due: <strong className="text-[#0C1946]">{task.deadline}</strong>
                        </p>
                      </div>
                    </div>

                    <Badge
                      variant={task.priority === 'HIGH' ? 'INSUFFICIENT' : 'MUTED'}
                      size="sm"
                    >
                      {task.priority}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Strongest Match Spotlight */}
          {highMatchOpps.length > 0 && (
            <Card className="p-6 space-y-4 border-l-4 border-l-[#245FD2]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#245FD2] uppercase tracking-wider">
                  Top Recommended Opportunity
                </span>
                <Badge variant="MEETS" icon="verified">
                  {highMatchOpps[0].matchScore}% Deterministic Match
                </Badge>
              </div>

              <div>
                <h3 className="text-lg font-bold text-[#0C1946]">{highMatchOpps[0].title}</h3>
                <p className="text-xs text-[#526079] mt-0.5">
                  Sponsored by {highMatchOpps[0].sponsor} • Funding: <strong className="text-[#137333]">{highMatchOpps[0].fundingAmount}</strong>
                </p>
              </div>

              <p className="text-xs text-[#526079] leading-relaxed">
                {highMatchOpps[0].rfpSummary}
              </p>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-[#526079]">
                  Deadline: <strong className="text-[#0C1946]">{highMatchOpps[0].deadline}</strong>
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate('/criteria')}
                  icon="rule"
                >
                  Review Proof Criteria
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Verifiable Evidence Callout & Disqualification Guard (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Grounded Evidence Proof */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#0C1946] uppercase tracking-wider">
                Verifiable Research Proof
              </h3>
              <Badge variant="VERIFIED" size="sm">
                Peer-Reviewed
              </Badge>
            </div>

            <EvidenceCallout
              quote="Co-authored 'Latent Graph Alignments in Single-Cell RNA Sequencing', accepted at NeurIPS 2024 Workshop. Benchmarked against 10M protein embeddings."
              documentName="NeurIPS2024_Latent_Graph_Alignments_Preprint.pdf"
              pageNumber={3}
              lineNumber={14}
              confidence={0.984}
              status="VERIFIED"
              sha256="4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e19b02a9b407a1234567890"
            />

            <p className="text-[11px] text-[#526079]">
              This citation automatically fulfills the interdisciplinary bio-computational requirements across 3 fellowships without manual resume crafting.
            </p>
          </Card>

          {/* Automatic Disqualification Filter (High-Stakes Filter) */}
          <Card className="p-5 space-y-3 bg-[#FEF7E0]/30 border-[#FEE180]">
            <div className="flex items-center gap-2 text-[#B06000]">
              <span className="material-symbols-outlined text-[20px]">policy</span>
              <h3 className="text-xs font-bold uppercase tracking-wider">
                High-Stakes Filter Protected
              </h3>
            </div>
            <p className="text-xs text-[#0C1946] leading-relaxed">
              Automatic visa cross-matching eliminated the <strong>NSF GRFP ($53,000)</strong> and <strong>DARPA AI ($150,000)</strong> calls because your verified SEVIS record confirms F-1 Student status.
            </p>
            <div className="p-2.5 rounded-lg bg-white border border-[#FEE180] text-[11px] text-[#B06000]">
              <strong>Audited Benefit:</strong> Prevents spending 15+ hours drafting proposals where disqualification is mathematically certain.
            </div>
          </Card>

          {/* Voice Assistant Teaser */}
          <Card className="p-5 space-y-3 bg-[#0C1946] text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#87f4f1] uppercase tracking-wider">
                Quali Voice Assistant
              </span>
              <span className="material-symbols-outlined text-[#87f4f1] text-[20px]">graphic_eq</span>
            </div>
            <p className="text-xs text-white/90 leading-relaxed">
              Ask audio or text questions about fellowship eligibility, hard criteria gates, or paper citation receipts.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-xs"
              onClick={() => navigate('/assistant')}
            >
              Ask Voice Assistant
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
