import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  validateProfileSubmission,
  submitProfileForWorkflow,
  getWorkflowProfile,
  initiateDocumentProcessing,
  getDocumentProcessingStatus,
  evaluateWorkflowEligibility,
  generateWorkflowChecklist,
  getWorkflowState,
} from '../lib/api/workflow';
import { 
  ProfileSubmission, 
  IngestedDocument, 
  EvidenceCitation, 
  CriteriaRubric, 
  ApplicationTask,
  EligibilityReport,
  EducationTier,
  AuthStatus,
} from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';
import { EvidenceCallout } from '../components/common/EvidenceCallout';

type WorkflowStep = 'profile' | 'document' | 'eligibility' | 'checklist' | 'complete';
type ProcessingState = 'idle' | 'validating' | 'processing' | 'extracting' | 'complete' | 'error';

interface ProcessingResult {
  requestId: string;
  state: string;
  document: IngestedDocument | null;
  citations: EvidenceCitation[];
  error?: string;
}

export function WorkflowPage() {
  const navigate = useNavigate();
  
  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('profile');
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  
  // Profile form state
  const [profileForm, setProfileForm] = useState<ProfileSubmission>({
    fullName: '',
    email: '',
    institution: '',
    degree: '',
    educationTier: 'masters',
    graduationDate: '',
    gpa: 0,
    workAuthorization: 'f1-opt',
    domainTags: [],
  });
  const [profileErrors, setProfileErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [profileValidating, setProfileValidating] = useState(false);
  
  // Document upload state
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<IngestedDocument['documentType']>('TRANSCRIPT');
  const [documentUploading, setDocumentUploading] = useState(false);
  
  // Eligibility state
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>('opp-biox-2026');
  const [eligibilityResult, setEligibilityResult] = useState<{
    report: EligibilityReport;
    criteria: CriteriaRubric[];
    meetsCriteria: CriteriaRubric[];
    failedCriteria: CriteriaRubric[];
    insufficientCriteria: CriteriaRubric[];
    hardGates: Array<{ id: string; name: string; requiredRule: string; candidateValue: string; status: string; evidenceSnippet: string }>;
  } | null>(null);
  const [evaluatingEligibility, setEvaluatingEligibility] = useState(false);
  
  // Checklist state
  const [checklistTasks, setChecklistTasks] = useState<ApplicationTask[]>([]);
  const [generatingChecklist, setGeneratingChecklist] = useState(false);
  
  // Step navigation
  const [workflowId, setWorkflowId] = useState<string>(`wf-${Date.now()}`);
  
  // Load initial profile if exists
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await getWorkflowProfile();
        if (profile && profile.fullName) {
          setProfileForm({
            fullName: profile.fullName,
            email: profile.email,
            institution: profile.institution,
            degree: profile.degree,
            educationTier: profile.educationTier,
            graduationDate: profile.graduationDate,
            gpa: profile.gpa,
            workAuthorization: profile.workAuthorization,
            domainTags: profile.domainTags,
          });
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    };
    loadProfile();
  }, []);

  const handleValidateProfile = async () => {
    setProfileValidating(true);
    setProfileErrors([]);
    try {
      const result = await validateProfileSubmission(profileForm);
      if (!result.valid) {
        setProfileErrors(result.errors.map(e => ({ field: e.field, message: e.message })));
        return false;
      }
      return true;
    } catch (err: unknown) {
      setProfileErrors([{ field: 'general', message: err instanceof Error ? err.message : 'Validation failed' }]);
      return false;
    } finally {
      setProfileValidating(false);
    }
  };

  const handleSubmitProfile = async () => {
    const valid = await handleValidateProfile();
    if (!valid) return;

    setProcessingState('validating');
    try {
      const profile = await submitProfileForWorkflow(profileForm);
      setProcessingState('complete');
      setTimeout(() => {
        setCurrentStep('document');
        setProcessingState('idle');
      }, 1500);
    } catch (err: unknown) {
      setProcessingState('error');
      setProfileErrors([{ field: 'general', message: err instanceof Error ? err.message : 'Submission failed' }]);
    }
  };

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentFile) return;

    setDocumentUploading(true);
    setProcessingState('processing');
    try {
      const result = await initiateDocumentProcessing(documentFile, documentType);
      setWorkflowId(result.requestId);
      
      // Poll for completion
      const pollStatus = async () => {
        try {
          const status = await getDocumentProcessingStatus(result.requestId);
          setProcessingResult(status);
          
          if (status.state === 'completed' && status.document) {
            setProcessingState('complete');
            setTimeout(() => {
              setCurrentStep('eligibility');
              setProcessingState('idle');
            }, 1000);
          } else if (status.state === 'error') {
            setProcessingState('error');
          } else {
            // Continue polling
            setTimeout(pollStatus, 500);
          }
        } catch (err) {
          setProcessingState('error');
        }
      };
      
      pollStatus();
    } catch (err: unknown) {
      setProcessingState('error');
      console.error('Upload failed:', err);
    } finally {
      setDocumentUploading(false);
    }
  };

  const handleEvaluateEligibility = async () => {
    if (!processingResult?.document) return;
    
    setEvaluatingEligibility(true);
    try {
      const result = await evaluateWorkflowEligibility({
        opportunityId: selectedOpportunityId,
        caseId: workflowId,
      });
      setEligibilityResult(result);
      setCurrentStep('checklist');
    } catch (err: unknown) {
      console.error('Eligibility evaluation failed:', err);
    } finally {
      setEvaluatingEligibility(false);
    }
  };

  const handleGenerateChecklist = async () => {
    if (!eligibilityResult?.report) return;
    
    setGeneratingChecklist(true);
    try {
      const result = await generateWorkflowChecklist({
        opportunityId: selectedOpportunityId,
        eligibilityResultId: eligibilityResult.report.id,
      });
      setChecklistTasks(result.tasks);
      setCurrentStep('complete');
    } catch (err: unknown) {
      console.error('Checklist generation failed:', err);
    } finally {
      setGeneratingChecklist(false);
    }
  };

  const renderProfileStep = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-bold text-[#0C1946] mb-4">1. Candidate Profile</h2>
        <p className="text-xs text-[#526079] mb-6">
          Provide your academic background, qualifications, and relevant preferences for opportunity matching.
        </p>
        
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">Full Name *</label>
            <input
              type="text"
              value={profileForm.fullName}
              onChange={(e) => setProfileForm(f => ({ ...f, fullName: e.target.value }))}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
              placeholder="Elena Rostova"
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">Email *</label>
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm(f => ({ ...f, email: e.target.value }))}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
              placeholder="e.rostova@stanford.edu"
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">Institution *</label>
            <input
              type="text"
              value={profileForm.institution}
              onChange={(e) => setProfileForm(f => ({ ...f, institution: e.target.value }))}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
              placeholder="Stanford University"
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">Degree Program *</label>
            <input
              type="text"
              value={profileForm.degree}
              onChange={(e) => setProfileForm(f => ({ ...f, degree: e.target.value }))}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
              placeholder="M.S. Computer Science"
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">Education Tier *</label>
            <select
              value={profileForm.educationTier}
              onChange={(e) => setProfileForm(f => ({ ...f, educationTier: e.target.value as EducationTier }))}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
            >
              <option value="undergraduate">Undergraduate</option>
              <option value="masters">Masters</option>
              <option value="phd">PhD</option>
              <option value="postdoc">Postdoc</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">Graduation Date (YYYY-MM) *</label>
            <input
              type="month"
              value={profileForm.graduationDate}
              onChange={(e) => setProfileForm(f => ({ ...f, graduationDate: e.target.value }))}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">GPA (0.00 - 4.00) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="4.0"
              value={profileForm.gpa || ''}
              onChange={(e) => setProfileForm(f => ({ ...f, gpa: parseFloat(e.target.value) || 0 }))}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
              placeholder="3.92"
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">Work Authorization *</label>
            <select
              value={profileForm.workAuthorization}
              onChange={(e) => setProfileForm(f => ({ ...f, workAuthorization: e.target.value as AuthStatus }))}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
            >
              <option value="us-citizen">US Citizen</option>
              <option value="f1-opt">F-1 OPT</option>
              <option value="eu-global">EU / Global</option>
            </select>
          </div>
        </form>
        
        {profileErrors.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
            {profileErrors.map((err, i) => (
              <div key={i}>{err.message}</div>
            ))}
          </div>
        )}
        
        <div className="mt-6 flex justify-end">
          <Button 
            variant="primary" 
            size="md" 
            onClick={handleSubmitProfile}
            loading={profileValidating || processingState !== 'idle'}
            disabled={processingState !== 'idle'}
          >
            {processingState === 'validating' ? 'Validating...' : 
             processingState === 'processing' ? 'Submitting...' : 
             'Continue to Document Upload'}
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderDocumentStep = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-bold text-[#0C1946] mb-4">2. Document Ingestion</h2>
        <p className="text-xs text-[#526079] mb-6">
          Upload an opportunity PDF or supporting document for extraction and criteria analysis.
        </p>
        
        {processingState === 'complete' && processingResult?.document && (
          <div className="mb-6 p-4 bg-[#E8F8F0] border border-[#A6E3B8] rounded-lg">
            <div className="flex items-center gap-2 text-[#137333] font-semibold text-xs mb-2">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Document Processed Successfully
            </div>
            <div className="text-xs text-[#526079] space-y-1">
              <p><strong>File:</strong> {processingResult.document.name}</p>
              <p><strong>Type:</strong> {processingResult.document.documentType}</p>
              <p><strong>Pages:</strong> {processingResult.document.pageCount}</p>
              <p><strong>OCR Confidence:</strong> {(processingResult.document.ocrConfidence * 100).toFixed(1)}%</p>
              <p><strong>SHA-256:</strong> {processingResult.document.sha256.slice(0, 24)}...</p>
              {processingResult.citations.length > 0 && (
                <p className="mt-2"><strong>Extracted Citations:</strong> {processingResult.citations.length}</p>
              )}
            </div>
          </div>
        )}
        
        {processingState === 'processing' && (
          <div className="mb-6 p-4 bg-[#E7EEFF] border border-[#245FD2]/30 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 border-2 border-[#245FD2] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold text-[#0C1946]">Processing Document...</span>
            </div>
            <div className="w-full bg-[#F6F8FC] h-2 rounded-full overflow-hidden">
              <div className="bg-[#245FD2] h-full transition-all duration-300" style={{ width: '60%' }} />
            </div>
            <p className="text-[10px] text-[#526079] mt-2">Computing SHA-256 hash and extracting claims...</p>
          </div>
        )}
        
        <form onSubmit={handleDocumentUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#0C1946] mb-1">Document Type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as IngestedDocument['documentType'])}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
            >
              <option value="TRANSCRIPT">Official Academic Transcript (.pdf)</option>
              <option value="PREPRINT">Peer-Reviewed Paper / Pre-print (.pdf)</option>
              <option value="LOR">Letter of Recommendation (.pdf)</option>
              <option value="I20_VISA">Form I-20 / Visa Document (.pdf)</option>
              <option value="CV">Academic CV / Research Resume (.pdf)</option>
            </select>
          </div>
          
          <div className="border-2 border-dashed border-[#E4E9F2] rounded-xl p-6 text-center hover:border-[#245FD2]/40 transition-colors">
            <input
              type="file"
              id="document-upload"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => {
                if (e.target.files?.[0]) setDocumentFile(e.target.files[0]);
              }}
              className="hidden"
            />
            <label htmlFor="document-upload" className="cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#E4E9F2] mx-auto flex items-center justify-center text-[#245FD2] mb-2">
                <span className="material-symbols-outlined text-[24px]">upload_file</span>
              </div>
              <p className="text-xs font-semibold text-[#245FD2]">Click to upload or drag and drop</p>
              <p className="text-[10px] text-[#526079] mt-1">PDF, JPEG, PNG (Max 25MB)</p>
            </label>
          </div>
          
          {documentFile && (
            <div className="p-3 bg-[#E7EEFF] rounded-lg border border-[#245FD2]/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <span className="material-symbols-outlined text-[#245FD2]">description</span>
                <span className="font-semibold truncate">{documentFile.name}</span>
                <span className="text-[#526079]">({(documentFile.size / 1024).toFixed(0)} KB)</span>
              </div>
              <button
                type="button"
                onClick={() => setDocumentFile(null)}
                className="text-[#C5221F] hover:underline"
              >
                Remove
              </button>
            </div>
          )}
          
          <div className="flex justify-end">
            <Button 
              variant="primary" 
              size="md" 
              type="submit"
              loading={documentUploading}
              disabled={!documentFile || processingState === 'processing'}
            >
              {documentUploading ? 'Processing...' : 'Upload & Process Document'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );

  const renderEligibilityStep = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-bold text-[#0C1946] mb-4">3. Eligibility Evaluation</h2>
        <p className="text-xs text-[#526079] mb-6">
          Run the deterministic rules engine against your profile and uploaded documents.
        </p>
        
        {evaluatingEligibility && (
          <div className="mb-6 p-4 bg-[#E7EEFF] border border-[#245FD2]/30 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 border-2 border-[#245FD2] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold text-[#0C1946]">Evaluating Eligibility...</span>
            </div>
            <p className="text-[10px] text-[#526079]">Running hard gates and criteria analysis...</p>
          </div>
        )}
        
        {eligibilityResult && (
          <div className="space-y-6">
            {/* Overall Status */}
            <div className={`p-5 rounded-xl border flex items-center justify-between ${
              eligibilityResult.report.overallStatus === 'VERIFIED_ELIGIBLE'
                ? 'bg-[#E8F8F0] border-[#A6E3B8]'
                : eligibilityResult.report.overallStatus === 'DISQUALIFIED'
                ? 'bg-red-50 border-red-200'
                : 'bg-[#FEF7E0] border-[#FEE180]'
            }`}>
              <div>
                <p className={`font-bold text-sm ${
                  eligibilityResult.report.overallStatus === 'VERIFIED_ELIGIBLE'
                    ? 'text-[#137333]'
                    : eligibilityResult.report.overallStatus === 'DISQUALIFIED'
                    ? 'text-red-700'
                    : 'text-[#B06000]'
                }`}>
                  {eligibilityResult.report.overallStatus.replace('_', ' ')}
                </p>
                <p className="text-xs text-[#526079] mt-1">
                  Deterministic Score: <strong className="text-[#0C1946]">{eligibilityResult.report.deterministicScore}%</strong>
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold font-mono text-[#0C1946]">{eligibilityResult.report.deterministicScore}%</p>
                <p className="text-[10px] text-[#526079]">Match Confidence</p>
              </div>
            </div>
            
            {/* Hard Gates */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-[#0C1946] uppercase tracking-wider">
                Hard Gates ({eligibilityResult.hardGates.filter(g => g.status === 'PASS').length}/{eligibilityResult.hardGates.length} Passed)
              </h3>
              <div className="border border-[#E4E9F2] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F6F8FC] border-b border-[#E4E9F2] text-[#526079]">
                    <tr>
                      <th className="p-3">Gate</th>
                      <th className="p-3">Required Standard</th>
                      <th className="p-3">Candidate Value</th>
                      <th className="p-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E9F2]">
                    {eligibilityResult.hardGates.map((gate) => (
                      <tr key={gate.id} className="hover:bg-[#F6F8FC]/50">
                        <td className="p-3 font-semibold text-[#0C1946]">{gate.name}</td>
                        <td className="p-3 text-[#526079]">{gate.requiredRule}</td>
                        <td className="p-3 font-mono text-[#0C1946]">{gate.candidateValue}</td>
                        <td className="p-3 text-right">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            gate.status === 'PASS' ? 'bg-[#137333] text-white' : 'bg-red-100 text-red-700'
                          }`}>
                            {gate.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Criteria by Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* MEETS */}
              <div className="p-4 rounded-xl bg-[#E8F8F0] border border-[#A6E3B8]">
                <h4 className="text-xs font-bold text-[#137333] uppercase tracking-wider mb-3 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  MEETS ({eligibilityResult.meetsCriteria.length})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {eligibilityResult.meetsCriteria.map((crit) => (
                    <div key={crit.id} className="p-2 bg-white rounded-lg border border-[#A6E3B8] text-xs">
                      <p className="font-semibold text-[#0C1946]">{crit.criterionTitle}</p>
                      {crit.evidenceCitation && (
                        <p className="text-[#526079] mt-1 font-mono">
                          “{crit.evidenceCitation.verbatimQuote.slice(0, 80)}...”
                        </p>
                      )}
                      <p className="text-[#137333] mt-1">Page {crit.evidenceCitation?.pageNumber}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* DOES NOT MEET */}
              <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">cancel</span>
                  DOES NOT MEET ({eligibilityResult.failedCriteria.length})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {eligibilityResult.failedCriteria.map((crit) => (
                    <div key={crit.id} className="p-2 bg-white rounded-lg border border-red-200 text-xs">
                      <p className="font-semibold text-[#0C1946]">{crit.criterionTitle}</p>
                      <p className="text-red-600 mt-1">{crit.evaluatorNote}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* INSUFFICIENT EVIDENCE */}
              <div className="p-4 rounded-xl bg-[#FEF7E0] border border-[#FEE180]">
                <h4 className="text-xs font-bold text-[#B06000] uppercase tracking-wider mb-3 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  INSUFFICIENT EVIDENCE ({eligibilityResult.insufficientCriteria.length})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {eligibilityResult.insufficientCriteria.map((crit) => (
                    <div key={crit.id} className="p-2 bg-white rounded-lg border border-[#FEE180] text-xs">
                      <p className="font-semibold text-[#0C1946]">{crit.criterionTitle}</p>
                      <p className="text-[#B06000] mt-1">{crit.evaluatorNote}</p>
                      {crit.evidenceCitation && (
                        <p className="text-[#526079] mt-1 text-[10px]">
                          Partial evidence: Page {crit.evidenceCitation.pageNumber}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="mt-6 flex justify-end">
          <Button 
            variant="primary" 
            size="md" 
            onClick={handleEvaluateEligibility}
            loading={evaluatingEligibility}
            disabled={!processingResult?.document || evaluatingEligibility}
          >
            {evaluatingEligibility ? 'Evaluating...' : 'Evaluate Eligibility'}
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderChecklistStep = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-bold text-[#0C1946] mb-4">4. Action Planning</h2>
        <p className="text-xs text-[#526079] mb-6">
          Generate a checklist of tasks linked to the opportunity and missing requirements.
        </p>
        
        {generatingChecklist && (
          <div className="mb-6 p-4 bg-[#E7EEFF] border border-[#245FD2]/30 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 border-2 border-[#245FD2] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold text-[#0C1946]">Generating Checklist...</span>
            </div>
          </div>
        )}
        
        {checklistTasks.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#0C1946] uppercase tracking-wider">
                Generated Tasks
              </h3>
              <span className="text-xs text-[#526079]">{checklistTasks.length} tasks</span>
            </div>
            <div className="space-y-2">
              {checklistTasks.map((task) => (
                <div key={task.id} className="p-4 bg-white border border-[#E4E9F2] rounded-lg flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0C1946]">{task.title}</p>
                    <p className="text-[10px] text-[#526079] mt-0.5">
                      {task.opportunityTitle} • Due: {task.deadline}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                      task.priority === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-[#F6F8FC] text-[#526079]'
                    }`}>
                      {task.priority}
                    </span>
                    <span className="text-[10px] text-[#526079]">{task.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {eligibilityResult && (
          <div className="mt-6 flex justify-end">
            <Button 
              variant="primary" 
              size="md" 
              onClick={handleGenerateChecklist}
              loading={generatingChecklist}
              disabled={generatingChecklist}
            >
              {generatingChecklist ? 'Generating...' : 'Generate Checklist'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-6">
      <Card className="p-6 bg-[#E8F8F0] border-[#A6E3B8]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#137333] text-white flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">check_circle</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#137333]">Workflow Complete</h2>
            <p className="text-xs text-[#526079]">Your application package has been generated</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-3 bg-white rounded-lg">
            <p className="text-2xl font-bold text-[#0C1946]">4</p>
            <p className="text-[10px] text-[#526079]">Steps Completed</p>
          </div>
          <div className="p-3 bg-white rounded-lg">
            <p className="text-2xl font-bold text-[#0C1946]">{profileForm.fullName || '—'}</p>
            <p className="text-[10px] text-[#526079]">Candidate</p>
          </div>
          <div className="p-3 bg-white rounded-lg">
            <p className="text-2xl font-bold text-[#0C1946]">{checklistTasks.length}</p>
            <p className="text-[10px] text-[#526079]">Action Items</p>
          </div>
          <div className="p-3 bg-white rounded-lg">
            <p className="text-2xl font-bold text-[#0C1946]">{eligibilityResult?.report.deterministicScore || 0}%</p>
            <p className="text-[10px] text-[#526079]">Match Score</p>
          </div>
        </div>
        
        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={() => navigate('/planner')}>
            View Full Planner
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/report')}>
            View Eligibility Report
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentStep('profile')}>
            Start New Workflow
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 'profile':
        return renderProfileStep();
      case 'document':
        return renderDocumentStep();
      case 'eligibility':
        return renderEligibilityStep();
      case 'checklist':
        return renderChecklistStep();
      case 'complete':
        return renderCompleteStep();
      default:
        return null;
    }
  };

  const renderProgress = () => (
    <div className="flex items-center gap-2 mb-6">
      {(['profile', 'document', 'eligibility', 'checklist', 'complete'] as const).map((step, i) => (
        <React.Fragment key={step}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              currentStep === step 
                ? 'bg-[#245FD2] text-white' 
                : i < ['profile', 'document', 'eligibility', 'checklist', 'complete'].indexOf(currentStep)
                ? 'bg-[#137333] text-white'
                : 'bg-[#F6F8FC] text-[#526079]'
            }`}>
              {i < ['profile', 'document', 'eligibility', 'checklist', 'complete'].indexOf(currentStep) ? '✓' : i + 1}
            </div>
            <span className={`text-xs hidden sm:block ${
              currentStep === step ? 'text-[#0C1946] font-semibold' : 'text-[#526079]'
            }`}>
              {step.charAt(0).toUpperCase() + step.slice(1)}
            </span>
          </div>
          {i < 4 && (
            <div className={`flex-1 h-0.5 ${
              i < ['profile', 'document', 'eligibility', 'checklist', 'complete'].indexOf(currentStep)
                ? 'bg-[#137333]'
                : 'bg-[#E4E9F2]'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 pb-16">
      <div className="pb-4 border-b border-[#E4E9F2]">
        <h1 className="text-2xl font-bold text-[#0C1946]">Application Workflow</h1>
        <p className="text-xs text-[#526079] mt-1">
          End-to-end candidate application: profile, documents, eligibility, and action planning.
        </p>
      </div>
      
      {renderProgress()}
      
      {renderStepContent()}
    </div>
  );
}
