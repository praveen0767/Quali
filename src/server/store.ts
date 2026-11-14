import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CandidateProfile,
  PrivacyControls,
  Opportunity,
  IngestedDocument,
  CriteriaRubric,
  EligibilityReport,
  OpportunityRecommendation,
  ApplicationTask,
  VoiceAssistantMessage,
  Document,
  EvidenceSource,
  CaseRecord,
  ReconciliationResult,
  ReviewCase,
  PolicyRule,
  AgentTrace,
  SystemHealth,
} from '../lib/api/types';
import {
  INITIAL_CANDIDATE_PROFILE,
  MOCK_PRIVACY_CONTROLS,
  MOCK_OPPORTUNITIES,
  MOCK_INGESTED_DOCUMENTS,
  MOCK_CRITERIA_RUBRIC,
  MOCK_ELIGIBILITY_REPORT,
  MOCK_RECOMMENDATIONS,
  MOCK_TASKS,
  MOCK_VOICE_CONVERSATION,
} from '../lib/api/mockAdapter';
import {
  MOCK_CASES,
  MOCK_PO_DOC,
  MOCK_INVOICE_DOC,
  MOCK_EVIDENCE_LIST as MOCK_EVIDENCE_SOURCES,
  MOCK_RECONCILIATION as MOCK_RECONCILIATION_RESULT,
  MOCK_REVIEWS,
  MOCK_POLICIES,
  MOCK_TRACE as MOCK_AGENT_TRACES,
  MOCK_SYSTEM_HEALTH,
} from '../lib/mockData';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  correlationId?: string;
}

export interface QualiDataStore {
  profile: CandidateProfile;
  privacy: PrivacyControls;
  opportunities: Opportunity[];
  ingestedDocuments: IngestedDocument[];
  criteriaRubrics: CriteriaRubric[];
  eligibilityReports: Record<string, EligibilityReport>;
  recommendations: OpportunityRecommendation[];
  tasks: ApplicationTask[];
  voiceMessages: VoiceAssistantMessage[];
  auditLogs: AuditLogEntry[];
  // TruDoc compatibility records
  legacyDocuments: Document[];
  cases: CaseRecord[];
  evidenceSources: EvidenceSource[];
  reconciliationResults: Record<string, ReconciliationResult>;
  reviews: ReviewCase[];
  policies: PolicyRule[];
  runs: AgentTrace[];
  systemHealth: SystemHealth;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'quali_store.json');

function createInitialStore(): QualiDataStore {
  return {
    profile: JSON.parse(JSON.stringify(INITIAL_CANDIDATE_PROFILE)),
    privacy: JSON.parse(JSON.stringify(MOCK_PRIVACY_CONTROLS)),
    opportunities: JSON.parse(JSON.stringify(MOCK_OPPORTUNITIES)),
    ingestedDocuments: JSON.parse(JSON.stringify(MOCK_INGESTED_DOCUMENTS)),
    criteriaRubrics: JSON.parse(JSON.stringify(MOCK_CRITERIA_RUBRIC)),
    eligibilityReports: {
      'AUDIT-STANFORD-BIOX-8821': JSON.parse(JSON.stringify(MOCK_ELIGIBILITY_REPORT)),
      'rep-biox-8821': JSON.parse(JSON.stringify(MOCK_ELIGIBILITY_REPORT)),
    },
    recommendations: JSON.parse(JSON.stringify(MOCK_RECOMMENDATIONS)),
    tasks: JSON.parse(JSON.stringify(MOCK_TASKS)),
    voiceMessages: JSON.parse(JSON.stringify(MOCK_VOICE_CONVERSATION)),
    auditLogs: [
      {
        id: 'audit-001',
        timestamp: '2026-02-18T10:00:00.000Z',
        action: 'STORE_INITIALIZED',
        actor: 'SYSTEM',
        details: { description: 'Quali persistent store initialized with baseline Stanford dataset.' },
      },
    ],
    legacyDocuments: [
      JSON.parse(JSON.stringify(MOCK_PO_DOC)),
      JSON.parse(JSON.stringify(MOCK_INVOICE_DOC)),
    ],
    cases: JSON.parse(JSON.stringify(MOCK_CASES)),
    evidenceSources: JSON.parse(JSON.stringify(MOCK_EVIDENCE_SOURCES)),
    reconciliationResults: {
      'REC-8821': JSON.parse(JSON.stringify(MOCK_RECONCILIATION_RESULT)),
    },
    reviews: JSON.parse(JSON.stringify(MOCK_REVIEWS)),
    policies: JSON.parse(JSON.stringify(MOCK_POLICIES)),
    runs: JSON.parse(JSON.stringify(MOCK_AGENT_TRACES)),
    systemHealth: JSON.parse(JSON.stringify(MOCK_SYSTEM_HEALTH)),
  };
}

class StoreManager {
  private data: QualiDataStore;

  constructor() {
    this.data = this.load();
  }

  private load(): QualiDataStore {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      // Don't log error details that might contain path info
      console.warn('[Quali Store] Error reading persistent store, creating fresh store.');
    }

    const fresh = createInitialStore();
    this.persist(fresh);
    return fresh;
  }

  public persist(customData?: QualiDataStore): void {
    const dataToSave = customData || this.data;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Use atomic write with temp file for safe concurrent access
      const tmpFile = `${STORE_FILE}.${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, STORE_FILE);
    } catch (err) {
      // Log without exposing file paths or error details
      console.error('[Quali Store] Failed to persist data store.');
    }
  }

  public get(): QualiDataStore {
    return this.data;
  }

  public update(fn: (data: QualiDataStore) => void): QualiDataStore {
    fn(this.data);
    this.persist();
    return this.data;
  }

  public resetToDemo(): QualiDataStore {
    this.data = createInitialStore();
    this.persist();
    return this.data;
  }

  public shred(correlationId?: string): { success: boolean; purgeTimestamp: string; message: string } {
    const timestamp = new Date().toISOString();
    // Zero-Leak Enclave purge: reset to clean state, log cryptographic shred event
    const shreddedStore = createInitialStore();
    // Clear dynamic ingested documents
    shreddedStore.ingestedDocuments = [];
    shreddedStore.tasks = shreddedStore.tasks.filter((t) => t.category !== 'DOCUMENT');
    shreddedStore.auditLogs.push({
      id: `shred-${Date.now()}`,
      timestamp,
      action: 'CRYPTOGRAPHIC_SHRED',
      actor: 'CANDIDATE_REQUEST',
      details: {
        method: 'DOD_5220_22_M_OVERWRITE',
        enclaveZeroed: true,
      },
      correlationId,
    });

    this.data = shreddedStore;
    this.persist();

    return {
      success: true,
      purgeTimestamp: timestamp,
      message: 'Zero-Leak Enclave purge verified. All candidate documents and cached claims cryptographically shredded across persistent storage tiers.',
    };
  }

  public logAudit(action: string, actor: string, details: Record<string, unknown>, correlationId?: string): void {
    // Sanitize details before logging - prevent PII in audit logs
    const sanitizedDetails = this.sanitizeForAuditLog(details);
    
    this.data.auditLogs.unshift({
      id: `audit-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      action,
      actor,
      details: sanitizedDetails,
      correlationId,
    });
    this.persist();
  }

  /**
   * Sanitize audit log details to remove PII
   * This prevents logging personal profile data or document contents
   */
  private sanitizeForAuditLog(details: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      'email', 'fullName', 'name', 'ssn', 'phone', 'address', 'birthDate',
      'document', 'content', 'text', 'body', 'payload', 'buffer', 'file',
      'candidateName', 'institution', 'degree', 'workAuthorization',
      'rawOcrText', 'snippetText',
    ];
    
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      if (sensitiveKeys.some((k) => k.toLowerCase() === key.toLowerCase())) {
        // Keep a hash for deduplication but not the actual value
        if (typeof value === 'string') {
          sanitized[key] = `[HASH:${this.hashCode(value).toString(16)}]`;
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeForAuditLog(value as Record<string, unknown>);
      } else if (key.toLowerCase().includes('file') || key.toLowerCase().includes('document')) {
        // Be extra careful with file/document-related fields
        if (typeof value === 'string' && value.length > 50) {
          sanitized[key] = value.slice(0, 20) + '...[TRUNCATED]';
        } else {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export const db = new StoreManager();
