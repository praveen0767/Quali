import React, { useEffect, useState } from 'react';
import {
  getProfile,
  updateProfile,
  resetToDemoProfile,
  getPrivacySettings,
  updatePrivacySettings,
  triggerCryptographicShred,
} from '../lib/api/profile';
import { CandidateProfile, EducationTier, AuthStatus, PrivacyControls } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';

export function ProfileSettingsPage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number>(2); // Default to Step 2 like Stitch spec
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, priv] = await Promise.all([getProfile(), getPrivacySettings()]);
      setProfile(p);
      setPrivacy(priv);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve profile data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    try {
      await updateProfile(profile);
      if (privacy) await updatePrivacySettings(privacy);
      setSaveSuccess('Candidate Profile & Privacy Controls successfully updated.');
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    }
  };

  const handleResetDemo = async () => {
    const demo = await resetToDemoProfile();
    setProfile(demo);
    setSaveSuccess('Reset to official Elena Rostova (Stanford University) benchmark dataset.');
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleShred = async () => {
    if (window.confirm('WARNING: This will cryptographically shred all cached transcripts, extracted claims, and audit history across all local enclaves. Proceed?')) {
      const res = await triggerCryptographicShred();
      alert(res.message);
    }
  };

  const handleTagToggle = (tagName: string) => {
    if (!profile) return;
    setProfile({
      ...profile,
      domainTags: profile.domainTags.map((t) =>
        t.name === tagName ? { ...t, verified: !t.verified } : t
      ),
    });
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !profile || !privacy) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorMessage message={error || 'Unable to load profile settings.'} onRetry={loadData} />
      </div>
    );
  }

  const steps = [
    { num: 1, label: 'Credentials', desc: 'Institutional Auth' },
    { num: 2, label: 'Academic Profile', desc: 'Eligibility Baseline' },
    { num: 3, label: 'Domain Scope', desc: 'Research & Skills' },
    { num: 4, label: 'Evidence Vault', desc: 'Zero-Leak Privacy' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E4E9F2]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#0C1946]">Profile &amp; Privacy Vault Settings</h1>
            <Badge variant="VERIFIED" size="sm">
              FERPA &amp; GDPR Diligence
            </Badge>
          </div>
          <p className="text-xs text-[#526079] mt-0.5">
            Deterministic Eligibility Audit &amp; Verifiable Profile Setup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleResetDemo} icon="restart_alt">
            Reset Demo Student
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} icon="save">
            Save Changes
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-4 rounded-xl bg-[#E8F8F0] border border-[#A6E3B8] text-[#137333] text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Multi-Step Flow Indicator (Identical to Stitch code.html design) */}
      <nav aria-label="Onboarding Progress" className="w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-[#F6F8FC] p-1.5 rounded-2xl border border-[#E4E9F2]">
          {steps.map((st) => {
            const isActive = activeStep === st.num;
            return (
              <button
                key={st.num}
                type="button"
                onClick={() => setActiveStep(st.num)}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left cursor-pointer ${
                  isActive
                    ? 'bg-white shadow-sm border border-[#E4E9F2]'
                    : 'hover:bg-[#e7eeff]/40 text-[#526079]'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isActive ? 'bg-[#0C1946] text-white' : 'bg-[#E4E9F2] text-[#526079]'
                  }`}
                >
                  {st.num}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#0C1946] uppercase tracking-wider truncate">
                    {st.label}
                  </p>
                  <p className="text-[10px] text-[#526079] truncate">{st.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Step Container Panels */}
      <Card className="p-8 space-y-6 bg-white border border-[#E4E9F2]">
        {/* STEP 1: Institutional Credentials */}
        {activeStep === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E9F2]">
              <div>
                <h2 className="text-lg font-bold text-[#0C1946]">Institutional Access &amp; Credentials</h2>
                <p className="text-xs text-[#526079] mt-0.5">
                  Single sign-on via your university or enter auditable academic credentials.
                </p>
              </div>
              <span className="material-symbols-outlined text-[28px] text-[#245FD2]">
                account_balance
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0C1946]">
                  Institutional (.edu / .ac) Email
                </label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-xl text-xs text-[#0C1946]"
                />
                <span className="text-[10px] text-[#526079]">
                  Used to automatically verify accreditation tier without paperwork.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0C1946]">
                  Federated Auth Provider
                </label>
                <select
                  value={profile.authProvider}
                  onChange={(e) => setProfile({ ...profile, authProvider: e.target.value })}
                  className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-xl text-xs text-[#0C1946]"
                >
                  <option>InCommon / Shibboleth Federated SSO</option>
                  <option>Google Institutional Workspace</option>
                  <option>ORCID Connected Identity</option>
                </select>
                <span className="text-[10px] text-[#526079]">
                  Confirms active student status for protected cohort programs.
                </span>
              </div>
            </div>

            <div className="bg-[#E7EEFF]/60 p-4 rounded-xl border border-[#245FD2]/20 flex items-start gap-3">
              <span className="material-symbols-outlined text-[#245FD2] text-[20px] shrink-0 mt-0.5">
                verified_user
              </span>
              <div className="text-xs text-[#0C1946]">
                <strong className="block font-bold">Zero Blind Handoffs</strong>
                Quali connects directly with university registrars and published clearinghouses to confirm non-revocable matriculation dates, bypassing third-party trackers.
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Academic Profile & Hard Criteria (Default View from Stitch) */}
        {activeStep === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E9F2]">
              <div>
                <h2 className="text-lg font-bold text-[#0C1946]">Academic Profile &amp; Hard Criteria</h2>
                <p className="text-xs text-[#526079] mt-0.5">
                  Grounding criteria prevents applications to opportunities where disqualification is mathematically certain.
                </p>
              </div>
              <Badge variant="COBALT" size="sm">Required Fields</Badge>
            </div>

            {/* Educational Tier */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#0C1946]">Current Educational Tier</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['undergraduate', 'masters', 'phd', 'postdoc'] as EducationTier[]).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setProfile({ ...profile, educationTier: tier })}
                    className={`p-2.5 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                      profile.educationTier === tier
                        ? 'bg-[#0C1946] text-white shadow-xs'
                        : 'bg-[#F6F8FC] border border-[#E4E9F2] text-[#526079] hover:bg-[#e7eeff]'
                    }`}
                  >
                    {tier === 'undergraduate'
                      ? 'Undergraduate'
                      : tier === 'masters'
                      ? "Master's"
                      : tier === 'phd'
                      ? 'Ph.D. Candidate'
                      : 'Postdoctoral'}
                  </button>
                ))}
              </div>
              <div className="bg-[#F6F8FC] p-2.5 rounded-lg border border-[#E4E9F2] flex items-center gap-2 text-xs text-[#526079]">
                <span className="material-symbols-outlined text-[16px] text-[#245FD2]">rule</span>
                <span><strong className="text-[#0C1946]">Audited Impact:</strong> 74% of enterprise research fellowships reject applications instantly if education tier doesn't match the RFP callout.</span>
              </div>
            </div>

            {/* University & Degree */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0C1946]">University / Institution</label>
                <input
                  type="text"
                  value={profile.institution}
                  onChange={(e) => setProfile({ ...profile, institution: e.target.value })}
                  className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-xl text-xs text-[#0C1946]"
                />
                <span className="text-[10px] text-[#526079]">Carnegie Class R1 Research Entity</span>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0C1946]">Degree &amp; Specialization</label>
                <input
                  type="text"
                  value={profile.degree}
                  onChange={(e) => setProfile({ ...profile, degree: e.target.value })}
                  className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-xl text-xs text-[#0C1946]"
                />
                <span className="text-[10px] text-[#526079]">Full official transcript designation</span>
              </div>
            </div>

            {/* Graduation Date & GPA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0C1946]">Expected Graduation / Conferral</label>
                <input
                  type="month"
                  value={profile.graduationDate}
                  onChange={(e) => setProfile({ ...profile, graduationDate: e.target.value })}
                  className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-xl text-xs text-[#0C1946]"
                />
                <span className="text-[10px] text-[#526079]">Unlocks 42% of strict fellowship cutoffs that restrict candidate cohort dates.</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0C1946]">Cumulative GPA (Scale: 4.0)</label>
                  <label className="flex items-center gap-1 text-[11px] text-[#526079]">
                    <input
                      type="checkbox"
                      checked={profile.includeGpaInAudit}
                      onChange={(e) => setProfile({ ...profile, includeGpaInAudit: e.target.checked })}
                      className="rounded text-[#245FD2]"
                    />
                    Include in Audit
                  </label>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={profile.gpa}
                  onChange={(e) => setProfile({ ...profile, gpa: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-xl text-xs text-[#0C1946]"
                />
                <span className="text-[10px] text-[#526079]">Verified against uploaded PDF transcript index.</span>
              </div>
            </div>

            {/* Citizenship & Work Authorization */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#0C1946]">Work Authorization &amp; Geographic Standing</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'us-citizen' as AuthStatus, title: 'US Citizen / Permanent', sub: 'DoD / NASA / NSF Full Access' },
                  { id: 'f1-opt' as AuthStatus, title: 'F-1 Student (OPT / CPT)', sub: 'STEM extension eligibility' },
                  { id: 'eu-global' as AuthStatus, title: 'International / Remote', sub: 'Global research mobility' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProfile({ ...profile, workAuthorization: item.id })}
                    className={`p-3 rounded-xl text-left transition-all cursor-pointer ${
                      profile.workAuthorization === item.id
                        ? 'bg-[#0C1946] text-white shadow-xs'
                        : 'bg-[#F6F8FC] border border-[#E4E9F2] text-[#526079] hover:bg-[#e7eeff]'
                    }`}
                  >
                    <span className="font-bold text-xs block">{item.title}</span>
                    <span className={`text-[10px] block mt-0.5 ${profile.workAuthorization === item.id ? 'text-white/80' : 'text-[#526079]'}`}>
                      {item.sub}
                    </span>
                  </button>
                ))}
              </div>
              <div className="bg-[#FEF7E0]/40 p-2.5 rounded-lg border border-[#FEE180] flex items-center gap-2 text-xs text-[#B06000]">
                <span className="material-symbols-outlined text-[16px]">policy</span>
                <span><strong className="text-[#0C1946]">High-Stakes Filter:</strong> Automatic visa cross-matching eliminates ineligible federal research grants before you spend 15 hours drafting.</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Domain Specialization & Verifiable Tags */}
        {activeStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E9F2]">
              <div>
                <h2 className="text-lg font-bold text-[#0C1946]">Domain Specialization &amp; Evidentiary Tags</h2>
                <p className="text-xs text-[#526079] mt-0.5">
                  Quali extracts verifiable claims from your uploaded projects rather than keyword stuffing.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-[#0C1946] block">
                Core Focus Disciplines (Click to audit or toggle verification status):
              </label>

              <div className="flex flex-wrap gap-2">
                {profile.domainTags.map((tag) => (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => handleTagToggle(tag.name)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      tag.verified
                        ? 'bg-[#0C1946] text-white shadow-2xs'
                        : 'bg-[#F6F8FC] text-[#526079] border border-[#E4E9F2] hover:bg-[#e7eeff]'
                    }`}
                  >
                    <span>{tag.name}</span>
                    <span className="material-symbols-outlined text-[14px]">
                      {tag.verified ? 'verified' : 'add'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Extracted Proof Artifact Box */}
            <div className="bg-[#F6F8FC] p-4 rounded-xl border border-[#E4E9F2] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#0C1946]">Extracted Proof Artifact</span>
                <span className="text-[#245FD2] font-semibold">Page 3 Reference</span>
              </div>
              <p className="text-xs italic text-[#0C1946] bg-white p-3 rounded-lg border border-[#E4E9F2] leading-relaxed">
                “Co-authored 'Latent Graph Alignments in Single-Cell RNA Sequencing', accepted at NeurIPS 2024 Workshop. Benchmarked against 10M protein embeddings.”
              </p>
              <div className="flex items-center gap-1 text-[11px] text-[#137333] font-medium">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Verifiable claim grounded in uploaded pre-print repository.</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Privacy Protocol & Zero-Leak Enclave Controls */}
        {activeStep === 4 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E9F2]">
              <div>
                <h2 className="text-lg font-bold text-[#0C1946]">Privacy Protocol &amp; Evidence Grounding Controls</h2>
                <p className="text-xs text-[#526079] mt-0.5">
                  Institutional academic data requires strict defense against model leakage and hallucinated citations.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Control 1 */}
              <label className="flex items-start gap-3 p-4 bg-[#F6F8FC] rounded-xl border border-[#E4E9F2] cursor-pointer hover:border-[#245FD2]/30">
                <input
                  type="checkbox"
                  checked={privacy.zeroLeakEnclave}
                  onChange={(e) => setPrivacy({ ...privacy, zeroLeakEnclave: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded text-[#245FD2]"
                />
                <div className="text-xs space-y-1">
                  <span className="font-bold text-[#0C1946] block text-sm">
                    Local Document Vault: Zero Foundation Training
                  </span>
                  <p className="text-[#526079] leading-relaxed">
                    Your private transcripts, letters of recommendation, and unpublished pre-prints are stored in encrypted client enclave memory. We never license or train open commercial models on your work.
                  </p>
                </div>
              </label>

              {/* Control 2 */}
              <label className="flex items-start gap-3 p-4 bg-[#F6F8FC] rounded-xl border border-[#E4E9F2] cursor-pointer hover:border-[#245FD2]/30">
                <input
                  type="checkbox"
                  checked={privacy.strictGroundingEnforced}
                  onChange={(e) => setPrivacy({ ...privacy, strictGroundingEnforced: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded text-[#245FD2]"
                />
                <div className="text-xs space-y-1">
                  <span className="font-bold text-[#0C1946] block text-sm">
                    Strict Grounding Requirement
                  </span>
                  <p className="text-[#526079] leading-relaxed">
                    Quali rejects synthetic AI guesswork. Match scores are strictly computed by pairing verbatim requirement clauses with page-and-line citations from your verifiable records.
                  </p>
                </div>
              </label>

              {/* Control 3: Shredder */}
              <div className="p-4 bg-[#FCE8E6]/40 rounded-xl border border-[#F8B4B4] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#C5221F]">
                    Immediate Export &amp; One-Click Dossier Shredding
                  </span>
                  <Button variant="danger" size="sm" icon="delete_forever" onClick={handleShred}>
                    Shred All Cached Data
                  </Button>
                </div>
                <p className="text-xs text-[#526079] leading-relaxed">
                  Selecting shred guarantees permanent cryptographic wipe across all client storage tiers within 100 milliseconds.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step Navigation Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-[#E4E9F2]">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
            disabled={activeStep === 1}
          >
            Previous Step
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (activeStep < 4) {
                setActiveStep((prev) => prev + 1);
              } else {
                handleSave();
              }
            }}
          >
            {activeStep < 4 ? 'Continue Next Step →' : 'Save Profile & Launch My Day'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
