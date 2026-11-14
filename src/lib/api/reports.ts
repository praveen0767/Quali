import { apiClient, isMockModeEnabled } from './client';
import { EligibilityReport } from './types';
import { MOCK_ELIGIBILITY_REPORT } from './mockAdapter';

export async function getEligibilityReport(caseId = 'AUDIT-STANFORD-BIOX-8821'): Promise<EligibilityReport> {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ...MOCK_ELIGIBILITY_REPORT, caseId });
  }
  return apiClient<EligibilityReport>(`/api/v1/reports/${encodeURIComponent(caseId)}`);
}

export function downloadJsonLdCertificate(report: EligibilityReport): void {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalCredential',
    name: `Quali Verifiable Eligibility Dossier: ${report.opportunityTitle}`,
    credentialCategory: 'Deterministic Eligibility Audit',
    educationalLevel: 'Graduate Research Tier',
    recognizedBy: {
      '@type': 'EducationalOrganization',
      name: report.institution,
    },
    recipient: {
      '@type': 'Person',
      name: report.candidateName,
    },
    auditDetails: {
      caseId: report.caseId,
      overallStatus: report.overallStatus,
      deterministicScore: report.deterministicScore,
      hardGates: report.hardGates,
      evidenceProvenance: report.evidenceProvenance,
      cryptographicReceipt: report.cryptographicReceipt,
    },
    dateCreated: report.generatedAt,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/ld+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Quali_AuditReceipt_${report.caseId}.jsonld`;
  a.click();
  URL.revokeObjectURL(url);
}
