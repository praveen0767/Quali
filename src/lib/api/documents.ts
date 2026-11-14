import { apiClient, isMockModeEnabled } from './client';
import { IngestedDocument, Document } from './types';
import { MOCK_INGESTED_DOCUMENTS } from './mockAdapter';
import { MOCK_PO_DOC, MOCK_INVOICE_DOC } from '../mockData';

let localIngestedDocs: IngestedDocument[] = [...MOCK_INGESTED_DOCUMENTS];
const localLegacyDocs: Document[] = [MOCK_PO_DOC, MOCK_INVOICE_DOC];

// Quali Ingested Documents
export async function getIngestedDocuments(): Promise<IngestedDocument[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...localIngestedDocs]);
  }
  return apiClient<IngestedDocument[]>('/api/v1/documents/ingested');
}

export async function uploadDocument(params: {
  file: File;
  documentType: IngestedDocument['documentType'];
}): Promise<IngestedDocument> {
  if (isMockModeEnabled()) {
    const newDoc: IngestedDocument = {
      id: `doc-${Date.now()}`,
      name: params.file.name,
      documentType: params.documentType,
      uploadedAt: new Date().toISOString(),
      sizeBytes: params.file.size,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      enclaveEncrypted: true,
      pageCount: 1,
      ocrConfidence: 0.992,
      extractedClaimsCount: 4,
      status: 'INDEXED',
      previewExcerpt: `Extracted claims from ${params.file.name}. Validated against academic eligibility index.`,
    };
    localIngestedDocs.unshift(newDoc);
    return Promise.resolve(newDoc);
  }

  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('document_type', params.documentType);

  return apiClient<IngestedDocument>('/api/v1/documents/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function deleteDocument(id: string): Promise<{ success: boolean }> {
  if (isMockModeEnabled()) {
    localIngestedDocs = localIngestedDocs.filter((d) => d.id !== id);
    return Promise.resolve({ success: true });
  }
  return apiClient<{ success: boolean }>(`/api/v1/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// Enterprise Document Records (TruDoc Legacy Compatibility)
export async function getDocuments(): Promise<Document[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...localLegacyDocs]);
  }
  return apiClient<Document[]>('/api/v1/documents');
}

export async function getDocument(id: string): Promise<Document> {
  if (isMockModeEnabled()) {
    const doc = localLegacyDocs.find((d) => d.id === id) || localLegacyDocs[0];
    return Promise.resolve(doc);
  }
  return apiClient<Document>(`/api/v1/documents/${encodeURIComponent(id)}`);
}

export async function revalidateDocument(id: string): Promise<Document> {
  if (isMockModeEnabled()) {
    const doc = localLegacyDocs.find((d) => d.id === id) || localLegacyDocs[0];
    return Promise.resolve(doc);
  }
  return apiClient<Document>(`/api/v1/documents/${encodeURIComponent(id)}/revalidate`, {
    method: 'POST',
  });
}
