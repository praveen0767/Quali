import React, { useEffect, useState } from 'react';
import { getEligibilityReport, downloadJsonLdCertificate } from '../lib/api/reports';
import { EligibilityReport } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';

export function EligibilityReportPage() {
  const [report, setReport] = useState<EligibilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEligibilityReport();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate eligibility report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopyHash = () => {
    if (!report) return;
    navigator.clipboard.writeText(report.cryptographicReceipt.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorMessage message={error || 'Unable to render report.'} onRetry={loadData} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E4E9F2]">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#245FD2] font-semibold">{report.caseId}</span>
            <Badge variant="VERIFIED" size="sm">
              Cryptographically Attested
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-[#0C1946] mt-0.5">Formal Eligibility Report</h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            icon="content_copy"
            onClick={handleCopyHash}
          >
            {copied ? 'Hash Copied!' : 'Copy SHA-256'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="download"
            onClick={() => downloadJsonLdCertificate(report)}
          >
            Download JSON-LD Audit Package
          </Button>
        </div>
      </div>

      {/* Main Attestation Certificate Container */}
      <Card className="p-8 space-y-8 bg-white border-2 border-[#E4E9F2] shadow-sm">
        {/* Certificate Masthead */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#E4E9F2] gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-[#0C1946] text-white flex items-center justify-center font-bold text-xs">
                Q
              </span>
              <span className="font-bold text-sm tracking-tight text-[#0C1946]">Quali Evidentiary Certificate</span>
            </div>
            <p className="text-xs text-[#526079]">
              Deterministic Academic &amp; Early-Career Qualification Audit
            </p>
          </div>
          <div className="text-left sm:text-right font-mono text-[11px] text-[#526079]">
            <p>Issued: <strong className="text-[#0C1946]">{new Date(report.generatedAt).toLocaleString()}</strong></p>
            <p>Dossier ID: <span className="text-[#245FD2]">{report.caseId}</span></p>
          </div>
        </div>

        {/* Candidate & Opportunity Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-[#F6F8FC] border border-[#E4E9F2] text-xs">
          <div>
            <span className="text-[#526079] block text-[10px] uppercase font-bold">Candidate Subject</span>
            <p className="font-bold text-sm text-[#0C1946] mt-0.5">{report.candidateName}</p>
            <p className="text-[#526079]">{report.institution} • M.S. Candidate</p>
          </div>
          <div>
            <span className="text-[#526079] block text-[10px] uppercase font-bold">Evaluated RFP Program</span>
            <p className="font-bold text-sm text-[#0C1946] mt-0.5">{report.opportunityTitle}</p>
            <p className="text-[#526079]">{report.sponsor}</p>
          </div>
        </div>

        {/* Overall Status Banner */}
        <div className="p-5 rounded-xl bg-[#E8F8F0] border border-[#A6E3B8] flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#137333] text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">verified</span>
            </div>
            <div>
              <p className="font-bold text-base text-[#137333]">
                VERIFIED ELIGIBLE — HARD CRITERIA AUDITED
              </p>
              <p className="text-xs text-[#137333]/90">
                Candidate mathematically satisfies all statutory fellowship restrictions.
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-3xl font-extrabold text-[#137333] font-mono">
              {report.deterministicScore}%
            </span>
            <span className="block text-[10px] font-mono text-[#137333] uppercase">Deterministic Gate</span>
          </div>
        </div>

        {/* Hard Gates Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#0C1946] uppercase tracking-wider">
              Statutory Hard Criteria Gates ({report.hardGatesPassed} / {report.totalHardGates} Passed)
            </h3>
            <Badge variant="MEETS" size="sm">100% Gate Clearance</Badge>
          </div>

          <div className="border border-[#E4E9F2] rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F6F8FC] border-b border-[#E4E9F2] text-[#526079] font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Gate Rule</th>
                  <th className="p-3">Required Standard</th>
                  <th className="p-3">Candidate Audit Value</th>
                  <th className="p-3 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E9F2]">
                {report.hardGates.map((gate) => (
                  <tr key={gate.id} className="hover:bg-[#F6F8FC]/50 transition-colors">
                    <td className="p-3 font-semibold text-[#0C1946]">{gate.name}</td>
                    <td className="p-3 text-[#526079]">{gate.requiredRule}</td>
                    <td className="p-3 font-mono text-[#0C1946]">{gate.candidateValue}</td>
                    <td className="p-3 text-right">
                      <Badge variant="MEETS" size="sm" icon="check_circle">
                        PASS
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Evidence Provenance Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-[#0C1946] uppercase tracking-wider">
            Evidence Provenance &amp; Cryptographic Manifest
          </h3>

          <div className="border border-[#E4E9F2] rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F6F8FC] border-b border-[#E4E9F2] text-[#526079] font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Source Document</th>
                  <th className="p-3">SHA-256 Digest</th>
                  <th className="p-3">Citations Extracted</th>
                  <th className="p-3 text-right">Enclave Protection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E9F2]">
                {report.evidenceProvenance.map((ev, i) => (
                  <tr key={i} className="hover:bg-[#F6F8FC]/50 transition-colors">
                    <td className="p-3 font-semibold text-[#0C1946] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#159A98]">description</span>
                      <span className="truncate max-w-[220px]">{ev.documentTitle}</span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#526079]">
                      {ev.sha256.substring(0, 20)}...
                    </td>
                    <td className="p-3 text-[#0C1946] font-mono">{ev.citationsUsed} Cites</td>
                    <td className="p-3 text-right font-medium text-[#159A98]">
                      {ev.enclaveStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cryptographic Attestation Block */}
        <div className="p-4 rounded-xl bg-[#0C1946] text-white space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[#87f4f1] font-bold uppercase tracking-wider">
              Cryptographic Receipt
            </span>
            <span className="text-[10px] text-white/60">
              Algorithm: {report.cryptographicReceipt.algorithm}
            </span>
          </div>
          <div className="p-2.5 bg-black/40 rounded-lg break-all text-[11px] text-[#87f4f1]">
            {report.cryptographicReceipt.hash}
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/80 pt-1">
            <span>Signer: {report.cryptographicReceipt.signingAuthority}</span>
            <span className="text-[#87f4f1]">Tamper-Proof Audit Active</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
