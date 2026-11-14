import React, { useEffect, useState } from 'react';
import { getIngestedDocuments, uploadDocument, deleteDocument } from '../lib/api/documents';
import { IngestedDocument } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';

export function DocumentIntakePage() {
  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload Form State
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<IngestedDocument['documentType']>('TRANSCRIPT');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIngestedDocuments();
      setDocuments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve document vault index.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select or drop a valid PDF document to ingest.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const newDoc = await uploadDocument({ file, documentType });
      setDocuments((prev) => [newDoc, ...prev]);
      setUploadSuccess(`Document "${file.name}" ingested into Zero-Leak Enclave with verified SHA-256 fingerprint.`);
      setFile(null);
      setTimeout(() => setUploadSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ingestion failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to permanently shred "${name}" from the enclave?`)) {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E4E9F2]">
        <div>
          <h1 className="text-2xl font-bold text-[#0C1946]">Document Ingestion Vault</h1>
          <p className="text-xs text-[#526079] mt-0.5">
            Ingest official transcripts, research pre-prints, and letters into client-encrypted zero-leak enclave storage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="VERIFIED" icon="shield">
            Zero-Leak Enclave Active
          </Badge>
          <Badge variant="MUTED">
            FERPA &amp; GDPR Compliant
          </Badge>
        </div>
      </div>

      {uploadSuccess && (
        <div className="p-4 rounded-xl bg-[#E8F8F0] border border-[#A6E3B8] text-[#137333] text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{uploadSuccess}</span>
        </div>
      )}

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Drag & Drop Ingestion Form (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-[#0C1946]">Ingest New Record</h2>
              <p className="text-xs text-[#526079] mt-0.5">
                Claims will be deterministically indexed with page &amp; line coordinates.
              </p>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              {/* Document Category */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0C1946]">Document Type</label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as IngestedDocument['documentType'])}
                  className="w-full p-2 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
                >
                  <option value="TRANSCRIPT">Official Academic Transcript (.pdf)</option>
                  <option value="PREPRINT">Peer-Reviewed Paper / Pre-print (.pdf)</option>
                  <option value="LOR">Letter of Recommendation (.pdf)</option>
                  <option value="I20_VISA">Form I-20 / Visa Document (.pdf)</option>
                  <option value="CV">Academic CV / Research Resume (.pdf)</option>
                </select>
              </div>

              {/* Drag Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                  dragOver
                    ? 'border-[#245FD2] bg-[#E7EEFF]/30'
                    : 'border-[#E4E9F2] hover:border-[#245FD2]/40 bg-[#F6F8FC]'
                }`}
              >
                <input
                  type="file"
                  id="file-upload"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="file-upload" className="cursor-pointer space-y-2 block">
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#E4E9F2] mx-auto flex items-center justify-center text-[#245FD2] shadow-2xs">
                    <span className="material-symbols-outlined text-[22px]">upload_file</span>
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-[#245FD2]">Click to upload</span> or drag and drop
                  </div>
                  <p className="text-[10px] text-[#526079]">
                    PDF, JPEG or PNG (Max: 25MB) • Auto SHA-256 hashed
                  </p>
                </label>
              </div>

              {file && (
                <div className="p-3 bg-[#E7EEFF] rounded-lg border border-[#245FD2]/20 flex items-center justify-between text-xs text-[#0C1946]">
                  <div className="flex items-center gap-2 truncate">
                    <span className="material-symbols-outlined text-[18px] text-[#245FD2]">description</span>
                    <span className="font-semibold truncate">{file.name}</span>
                    <span className="text-[10px] text-[#526079]">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-[#C5221F] hover:underline text-[11px] cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                loading={isUploading}
                icon="lock"
              >
                Hash &amp; Ingest into Enclave
              </Button>
            </form>
          </Card>

          {/* Privacy Protocol Callout */}
          <Card className="p-4 bg-[#F6F8FC] border-[#E4E9F2] space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#0C1946]">
              <span className="material-symbols-outlined text-[16px] text-[#159A98]">security</span>
              <span>Zero Foundation Model Training Guarantee</span>
            </div>
            <p className="text-[#526079] leading-relaxed text-[11px]">
              Uploaded transcripts and unpublished research papers are never fed into open foundation training sets. Claims are extracted strictly within your isolated sandbox session.
            </p>
          </Card>
        </div>

        {/* Right: Ingested Documents List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E9F2]">
              <div>
                <h2 className="text-base font-bold text-[#0C1946]">Audited Documents Vault</h2>
                <p className="text-xs text-[#526079]">
                  {documents.length} verified documents with cryptographic provenance
                </p>
              </div>
              <Badge variant="COBALT" size="sm">
                51 Indexed Claims
              </Badge>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-10 text-xs text-[#526079]">
                No documents in vault. Ingest a transcript or paper on the left.
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 rounded-xl bg-white border border-[#E4E9F2] hover:border-[#245FD2]/30 space-y-2.5 transition-all shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#F6F8FC] border border-[#E4E9F2] flex items-center justify-center text-[#245FD2] shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-[18px]">
                            {doc.documentType === 'TRANSCRIPT'
                              ? 'school'
                              : doc.documentType === 'PREPRINT'
                              ? 'article'
                              : 'verified_user'}
                          </span>
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <h4 className="text-xs font-bold text-[#0C1946] truncate">
                            {doc.name}
                          </h4>
                          <p className="text-[11px] text-[#526079]">
                            {doc.documentType} • {doc.pageCount} Pages • {(doc.sizeBytes / 1024).toFixed(0)} KB • OCR: {(doc.ocrConfidence * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="VERIFIED" size="sm">
                          {doc.extractedClaimsCount} Claims
                        </Badge>
                        <button
                          onClick={() => handleDelete(doc.id, doc.name)}
                          className="p-1 text-[#526079] hover:text-[#C5221F] rounded cursor-pointer"
                          title="Purge document"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Excerpt */}
                    <p className="text-[11px] italic text-[#526079] bg-[#F6F8FC] p-2 rounded-lg border border-[#E4E9F2]">
                      “{doc.previewExcerpt}”
                    </p>

                    {/* Provenance Footer */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#526079] pt-1 border-t border-[#E4E9F2]">
                      <span className="truncate">
                        SHA-256: <strong className="text-[#0C1946]">{doc.sha256.substring(0, 24)}...</strong>
                      </span>
                      <span className="text-[#159A98] font-semibold shrink-0">Enclave Verified</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
