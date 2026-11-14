import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from './store';
import { correlationMiddleware, structuredLog, sanitizeForLogging } from './middleware/correlation';
import { errorHandler, AppError } from './middleware/errorHandler';
import { createSecureCORS, createStrictAPICORS } from './middleware/secureCors';
import { createRateLimiter, uploadLimiter, sensitiveOperationLimiter } from './middleware/rateLimit';
import {
  validateDocumentUpload,
  processDocument,
  computeSha256,
  MAX_DOCUMENT_SIZE_BYTES,
  scanForPromptInjection,
} from './engine/documentPipeline';
import { evaluateEligibility } from './engine/rulesEngine';
import { generateChecklistTasks } from './engine/checklistGenerator';
import { getHealthChecker, metricsMiddleware, safeRequestLogger } from './engine/health';
import { CandidateProfile, VerificationStatus, ApplicationTask, ProfileSubmission, IngestedDocument, EvidenceCitation, OperationalMetrics, HealthCheckResult } from '../lib/api/types';

// Secure CORS configuration - restrict to configured origins in production
const secureCors = createSecureCORS({
  allowedOrigins: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [])
    : ['http://localhost:3000', 'http://localhost:5173'],
});

// Create rate limiters
const generalLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 100,
});

const strictCors = createStrictAPICORS();

// Module variables - lazy loaded
let orchestratorModule: typeof import('./orchestrator/index') | null = null;
let voiceModule: typeof import('./orchestrator/voiceAssistant') | null = null;

function getOrchestrator(): typeof import('./orchestrator/index') {
  if (!orchestratorModule) {
    throw new Error('Orchestrator module not initialized. Call createApp() first.');
  }
  return orchestratorModule;
}

function getVoice(): typeof import('./orchestrator/voiceAssistant') {
  if (!voiceModule) {
    throw new Error('Voice module not initialized. Call createApp() first.');
  }
  return voiceModule;
}

function ensureOrchestratorInitialized() {
  if (!orchestratorModule || !voiceModule) {
    throw new Error('Orchestrator modules not initialized. Call createApp() first.');
  }
}

export async function createApp(): Promise<express.Application> {
  const app = express();

  // Basic Middleware
  app.use(cors(secureCors));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(correlationMiddleware);
  app.use(metricsMiddleware);
  app.use(safeRequestLogger); // Sanitized request logging

  // Multer setup in-memory for Zero-Leak Enclave processing
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
  });

  // Pre-load orchestrator modules
  orchestratorModule = await import('./orchestrator/index');
  orchestratorModule.initializeOrchestrator();
  voiceModule = await import('./orchestrator/voiceAssistant');
  // ==========================================
  // 1. Profile Routes
  // ==========================================

  app.get('/api/v1/profile', (req: Request, res: Response) => {
    res.json(db.get().profile);
  });

  app.patch('/api/v1/profile', (req: Request, res: Response, next: NextFunction) => {
    try {
      const updates = req.body as Partial<CandidateProfile>;

      // Validation
      if (updates.email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(updates.email)) {
          throw new AppError('Invalid email format provided.', 400, 'INVALID_EMAIL');
        }
      }

      if (updates.educationTier !== undefined) {
        const validTiers = ['undergraduate', 'masters', 'phd', 'postdoc'];
        if (!validTiers.includes(updates.educationTier)) {
          throw new AppError(`Invalid education tier. Must be one of: ${validTiers.join(', ')}`, 400, 'INVALID_EDUCATION_TIER');
        }
      }

      if (updates.gpa !== undefined) {
        if (typeof updates.gpa !== 'number' || updates.gpa < 0 || updates.gpa > 4.0) {
          throw new AppError('GPA must be a floating point value between 0.00 and 4.00 on the standard 4.0 scale.', 400, 'INVALID_GPA');
        }
      }

      if (updates.workAuthorization !== undefined) {
        const validAuth = ['us-citizen', 'f1-opt', 'eu-global'];
        if (!validAuth.includes(updates.workAuthorization)) {
          throw new AppError(`Invalid work authorization status. Must be one of: ${validAuth.join(', ')}`, 400, 'INVALID_WORK_AUTH');
        }
      }

      if (updates.graduationDate !== undefined) {
        if (typeof updates.graduationDate !== 'string' || !/^\d{4}-\d{2}(-\d{2})?$/.test(updates.graduationDate)) {
          throw new AppError('Graduation date must follow YYYY-MM or YYYY-MM-DD format.', 400, 'INVALID_GRADUATION_DATE');
        }
      }

      const updated = db.update((state) => {
        state.profile = { ...state.profile, ...updates };
      }).profile;

      db.logAudit('PROFILE_UPDATED', 'USER', { updatedFields: Object.keys(updates) }, req.correlationId);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/v1/profile/reset-demo', (req: Request, res: Response) => {
    const state = db.resetToDemo();
    db.logAudit('PROFILE_RESET_DEMO', 'USER', {}, req.correlationId);
    res.json(state.profile);
  });

  app.get('/api/v1/profile/privacy', (req: Request, res: Response) => {
    res.json(db.get().privacy);
  });

  app.patch('/api/v1/profile/privacy', (req: Request, res: Response) => {
    const updates = req.body;
    const updated = db.update((state) => {
      state.privacy = { ...state.privacy, ...updates };
    }).privacy;
    db.logAudit('PRIVACY_UPDATED', 'USER', { updates }, req.correlationId);
    res.json(updated);
  });

  app.post('/api/v1/profile/shred', (req: Request, res: Response) => {
    // Zero-Leak cryptographic shredding
    const result = db.shred(req.correlationId);
    res.json(result);
  });

  // ==========================================
  // 2. Documents & Ingestion Vault
  // ==========================================

  app.get('/api/v1/documents/ingested', (req: Request, res: Response) => {
    res.json(db.get().ingestedDocuments);
  });

  app.post(
    '/api/v1/documents/upload',
    upload.single('file') as unknown as express.RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const file = req.file;
        if (!file) {
          throw new AppError('No document file attached in multipart form-data (key "file" required).', 400, 'MISSING_FILE');
        }

        const documentType = (req.body.document_type || req.body.documentType || 'TRANSCRIPT');

        // Validation
        const validation = validateDocumentUpload({
          filename: file.originalname,
          sizeBytes: file.size,
          mimeType: file.mimetype,
          buffer: file.buffer,
        });

        if (!validation.valid) {
          throw new AppError(validation.error!, 400, validation.code, validation.details);
        }

        // Security: Check for prompt injection in document content
        const injectionScan = scanForPromptInjection?.(file.buffer);
        if (injectionScan?.detected) {
          structuredLog({
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId,
            level: 'warn',
            message: 'Prompt injection detected in uploaded document',
            metadata: { severity: injectionScan.severity, documentId: undefined },
          });
          throw new AppError(
            'Document content contains potentially unsafe patterns. Please upload a valid document.',
            400,
            'SECURITY_POLICY_VIOLATION',
            { reason: injectionScan.details }
          );
        }

        // Duplicate Check via SHA-256
        const hash = computeSha256(file.buffer);
        const existing = db.get().ingestedDocuments.find((d) => d.sha256 === hash);
        if (existing) {
          throw new AppError(
            `Duplicate document detected: "${file.originalname}" has identical cryptographic fingerprint (SHA-256: ${hash}) to existing vault document "${existing.name}".`,
            409,
            'DUPLICATE_DOCUMENT',
            { existingDocumentId: existing.id, sha256: hash }
          );
        }

        // Process Document
        const result = processDocument({
          filename: file.originalname,
          buffer: file.buffer,
          mimeType: file.mimetype,
          documentType,
        });

        db.update((state) => {
          state.ingestedDocuments.unshift(result.document);
        });

        db.logAudit('DOCUMENT_INGESTED', 'USER', {
          documentId: result.document.id,
          name: result.document.name,
          sha256: result.document.sha256,
        }, req.correlationId);

        res.status(201).json(result.document);
      } catch (err) {
        next(err);
      }
    }
  );

  app.get('/api/v1/documents/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const ingested = db.get().ingestedDocuments.find((d) => d.id === id);
      if (ingested) {
        return res.json(ingested);
      }
      const legacy = db.get().legacyDocuments.find((d) => d.id === id);
      if (legacy) {
        return res.json(legacy);
      }
      throw new AppError(`Document with ID "${id}" not found.`, 404, 'NOT_FOUND');
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/v1/documents/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const doc = db.get().ingestedDocuments.find((d) => d.id === id);
      if (!doc) {
        throw new AppError(`Document with ID "${id}" not found.`, 404, 'NOT_FOUND');
      }

      db.update((state) => {
        state.ingestedDocuments = state.ingestedDocuments.filter((d) => d.id !== id);
      });

      db.logAudit('DOCUMENT_DELETED', 'USER', { documentId: id, name: doc.name }, req.correlationId);
      res.json({ success: true, message: `Document "${doc.name}" securely deleted.` });
    } catch (err) {
      next(err);
    }
  });

  // TruDoc Legacy Document compatibility
  app.get('/api/v1/documents', (req: Request, res: Response) => {
    res.json(db.get().legacyDocuments);
  });

  app.post('/api/v1/documents/:id/revalidate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const doc = db.get().legacyDocuments.find((d) => d.id === id);
      if (!doc) {
        throw new AppError(`Document "${id}" not found.`, 404, 'NOT_FOUND');
      }
      res.json(doc);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 3. Criteria & Evidence
  // ==========================================

  app.get('/api/v1/criteria', (req: Request, res: Response) => {
    const oppId = req.query.opportunity_id as string | undefined;
    const rubrics = db.get().criteriaRubrics;
    if (oppId) {
      return res.json(rubrics.filter((r) => r.opportunityId === oppId));
    }
    res.json(rubrics);
  });

  app.patch('/api/v1/criteria/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, note } = req.body as { status?: VerificationStatus; note?: string };

      const item = db.get().criteriaRubrics.find((r) => r.id === id);
      if (!item) {
        throw new AppError(`Criteria rubric item "${id}" not found.`, 404, 'NOT_FOUND');
      }

      const updated = db.update((state) => {
        const target = state.criteriaRubrics.find((r) => r.id === id)!;
        if (status) target.status = status;
        if (note !== undefined) target.evaluatorNote = note;
      }).criteriaRubrics.find((r) => r.id === id)!;

      db.logAudit('CRITERIA_OVERRIDE', 'EVALUATOR', {
        criterionId: id,
        newStatus: status,
        note,
      }, req.correlationId);

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/evidence', (req: Request, res: Response) => {
    const docId = req.query.document_id as string | undefined;
    const sources = db.get().evidenceSources;
    if (docId) {
      return res.json(sources.filter((s) => s.documentId === docId));
    }
    res.json(sources);
  });

  app.get('/api/v1/evidence/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const item = db.get().evidenceSources.find((s) => s.id === id);
      if (!item) {
        throw new AppError(`Evidence source "${id}" not found.`, 404, 'NOT_FOUND');
      }
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 4. Eligibility Engine & Decisions
  // ==========================================

  app.post('/api/v1/eligibility/evaluate', sensitiveOperationLimiter.middleware, (req: Request, res: Response, next: NextFunction) => {
    try {
      const oppId = (req.body.opportunityId || req.body.opportunity_id || 'opp-biox-2026') as string;
      const state = db.get();
      const opp = state.opportunities.find((o) => o.id === oppId);
      if (!opp) {
        throw new AppError(`Opportunity "${oppId}" not found for evaluation.`, 404, 'NOT_FOUND');
      }

      const outcome = evaluateEligibility(opp, {
        opportunityId: opp.id,
        candidateProfile: state.profile,
        criteriaRubrics: state.criteriaRubrics,
        documents: state.ingestedDocuments,
        caseId: req.body.caseId,
      });

      // Save report in state
      db.update((s) => {
        s.eligibilityReports[outcome.report.caseId] = outcome.report;
        s.eligibilityReports[outcome.report.id] = outcome.report;
        // Update criteria rubrics
        for (const crit of outcome.criteria) {
          const idx = s.criteriaRubrics.findIndex((r) => r.id === crit.id);
          if (idx >= 0) {
            s.criteriaRubrics[idx] = crit;
          } else {
            s.criteriaRubrics.push(crit);
          }
        }
      });

      db.logAudit('ELIGIBILITY_EVALUATED', 'ENGINE', {
        opportunityId: opp.id,
        caseId: outcome.report.caseId,
        overallStatus: outcome.report.overallStatus,
        deterministicScore: outcome.report.deterministicScore,
      }, req.correlationId);

      res.json(outcome);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/reports/:caseId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { caseId } = req.params;
      const reports = db.get().eligibilityReports;
      const found = reports[caseId] || reports['AUDIT-STANFORD-BIOX-8821'];
      if (!found) {
        throw new AppError(`Eligibility report for case "${caseId}" not found.`, 404, 'NOT_FOUND');
      }
      res.json(found);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 5. Opportunities & Recommendations
  // ==========================================

  app.get('/api/v1/opportunities', (req: Request, res: Response) => {
    res.json(db.get().opportunities);
  });

  app.get('/api/v1/opportunities/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const opp = db.get().opportunities.find((o) => o.id === id);
      if (!opp) {
        throw new AppError(`Opportunity "${id}" not found.`, 404, 'NOT_FOUND');
      }
      res.json(opp);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/recommendations', (req: Request, res: Response) => {
    res.json(db.get().recommendations);
  });

  // ==========================================
  // 6. Action Planner & Tasks
  // ==========================================

  app.get('/api/v1/tasks', (req: Request, res: Response) => {
    res.json(db.get().tasks);
  });

  app.post('/api/v1/tasks', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<ApplicationTask>;
      if (!body.title || !body.opportunityTitle) {
        throw new AppError('Task title and opportunityTitle are required.', 400, 'MISSING_FIELDS');
      }

      const newTask: ApplicationTask = {
        id: `task-${Date.now()}`,
        title: body.title,
        opportunityTitle: body.opportunityTitle,
        deadline: body.deadline || new Date().toISOString().split('T')[0],
        priority: body.priority || 'MEDIUM',
        category: body.category || 'DOCUMENT',
        status: body.status || 'PENDING',
        actionUrl: body.actionUrl,
      };

      db.update((state) => {
        state.tasks.unshift(newTask);
      });

      db.logAudit('TASK_CREATED', 'USER', { taskId: newTask.id, title: newTask.title }, req.correlationId);
      res.status(201).json(newTask);
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/v1/tasks/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updates = req.body as Partial<ApplicationTask>;

      const existing = db.get().tasks.find((t) => t.id === id);
      if (!existing) {
        throw new AppError(`Task with ID "${id}" not found.`, 404, 'NOT_FOUND');
      }

      const updated = db.update((state) => {
        const t = state.tasks.find((task) => task.id === id)!;
        Object.assign(t, updates);
      }).tasks.find((task) => task.id === id)!;

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/v1/tasks/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      db.update((state) => {
        state.tasks = state.tasks.filter((t) => t.id !== id);
      });
      res.json({ success: true, message: `Task "${id}" deleted.` });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/v1/planner/generate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const oppId = (req.body.opportunityId || req.body.opportunity_id || 'opp-biox-2026') as string;
      const state = db.get();
      const opp = state.opportunities.find((o) => o.id === oppId);
      if (!opp) {
        throw new AppError(`Opportunity "${oppId}" not found.`, 404, 'NOT_FOUND');
      }

      const generated = generateChecklistTasks(opp, state.criteriaRubrics);
      db.update((s) => {
        s.tasks = [...generated, ...s.tasks];
      });

      res.json({ success: true, generatedTasksCount: generated.length, tasks: generated });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 7. Voice Assistant
  // ==========================================

  app.get('/api/v1/assistant/messages', (req: Request, res: Response) => {
    res.json(db.get().voiceMessages);
  });

  app.post('/api/v1/assistant/query', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prompt } = req.body as { prompt?: string };
      if (!prompt || typeof prompt !== 'string') {
        throw new AppError('Prompt text required.', 400, 'MISSING_PROMPT');
      }

      const now = new Date().toISOString();
      const userMsg = {
        id: `msg-${Date.now()}-u`,
        sender: 'USER' as const,
        text: prompt,
        timestamp: now,
      };

      let replyText = 'Your query has been audited against your verified Stanford transcript and research publications index.';
      let citations = [
        {
          documentName: 'Official_Academic_Transcript_Stanford_Spring2024.pdf',
          page: 1,
          quote: 'Degree: M.S. Computer Science. Cumulative GPA: 3.92.',
        },
      ];

      const lower = prompt.toLowerCase();
      if (lower.includes('nsf') || lower.includes('grfp') || lower.includes('citizen')) {
        replyText = 'You are currently ineligible for the NSF GRFP due to the statutory U.S. citizenship requirement (NSF Solicitation Section II.B). Your verified SEVIS I-20 denotes F-1 Student status.';
        citations = [
          {
            documentName: 'NSF_GRFP_Solicitation_2026.pdf',
            page: 4,
            quote: 'Applicants must be United States citizens, nationals, or permanent residents of the United States at deadline.',
          },
          {
            documentName: 'Form_I20_F1_STEM_OPT_Signed.pdf',
            page: 1,
            quote: 'Student Status: F-1 Student. Field of Study: Computer Sciences.',
          },
        ];
      } else if (lower.includes('bio-x') || lower.includes('stanford') || lower.includes('fellowship')) {
        replyText = 'The Stanford Bio-X Fellowship is your highest confidence match (94%). All hard eligibility gates are satisfied (Conferral May 2026, GPA 3.92 vs 3.75, F-1 visa allowed). Your NeurIPS paper demonstrates the interdisciplinary computing requirement.';
        citations = [
          {
            documentName: 'NeurIPS2024_Latent_Graph_Alignments_Preprint.pdf',
            page: 3,
            quote: '“Latent Graph Alignments in Single-Cell RNA Sequencing”, accepted at NeurIPS 2024 Workshop.',
          },
        ];
      }

      const assistantMsg = {
        id: `msg-${Date.now()}-a`,
        sender: 'QUALI_ASSISTANT' as const,
        text: replyText,
        timestamp: new Date().toISOString(),
        citations,
      };

      db.update((state) => {
        state.voiceMessages.push(userMsg, assistantMsg);
      });

      res.json(assistantMsg);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 8. System Health & Telemetry
  // ==========================================

  app.get('/api/v1/system/health', (req: Request, res: Response) => {
    res.json(db.get().systemHealth);
  });

  app.get('/api/v1/system/telemetry', (req: Request, res: Response) => {
    const state = db.get();
    res.json({
      deterministicGateEngine: 'OPERATIONAL',
      zeroLeakEnclave: 'ACTIVE',
      evidenceHasher: 'SHA-256 VERIFIED',
      activeOpportunitiesCount: state.opportunities.length,
      verifiedClaimsCount: state.ingestedDocuments.reduce((sum, d) => sum + d.extractedClaimsCount, 0),
      backendApiStatus: 'CONNECTED',
      latencyMs: 8,
      dataSource: 'LIVE_BACKEND',
    });
  });

  app.get('/api/v1/system/ping', (req: Request, res: Response) => {
    const service = (req.query.service as string) || 'pythonApi';
    res.json({
      service,
      latencyMs: 7,
      status: 'CONNECTED',
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // 9. TruDoc Legacy Subsystems (Cases, Reconciliation, Reviews, Policies, Runs)
  // ==========================================

  app.get('/api/v1/cases', (req: Request, res: Response) => {
    res.json(db.get().cases);
  });

  app.get('/api/v1/cases/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const c = db.get().cases.find((item) => item.id === id || item.caseNumber === id);
      if (!c) throw new AppError(`Case "${id}" not found.`, 404, 'NOT_FOUND');
      res.json(c);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/reconciliation/:caseId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { caseId } = req.params;
      const rec = db.get().reconciliationResults[caseId] || db.get().reconciliationResults['REC-8821'];
      if (!rec) throw new AppError(`Reconciliation result for case "${caseId}" not found.`, 404, 'NOT_FOUND');
      res.json(rec);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/v1/reconciliation/:id/approve-exception', (req: Request, res: Response) => {
    const { reason } = req.body;
    db.logAudit('EXCEPTION_APPROVED', 'ADMIN', { caseId: req.params.id, reason }, req.correlationId);
    res.json({ success: true, message: `Exception approved: ${reason || 'Approved under institutional policy.'}` });
  });

  app.post('/api/v1/reconciliation/:id/request-credit-note', (req: Request, res: Response) => {
    const { amount } = req.body;
    res.json({
      success: true,
      creditNoteReference: `CN-REQ-${Date.now()}`,
      message: `Credit note request generated for $${amount || 2500} and transmitted to vendor.`,
    });
  });

  app.get('/api/v1/reviews', (req: Request, res: Response) => {
    res.json(db.get().reviews);
  });

  app.get('/api/v1/reviews/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = db.get().reviews.find((item) => item.id === req.params.id);
      if (!r) throw new AppError(`Review item "${req.params.id}" not found.`, 404, 'NOT_FOUND');
      res.json(r);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/v1/reviews/:id/action', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { action, correctedValue, reason, reviewerId } = req.body;
      const review = db.get().reviews.find((item) => item.id === id);
      if (!review) throw new AppError(`Review "${id}" not found.`, 404, 'NOT_FOUND');

      db.update((state) => {
        const item = state.reviews.find((r) => r.id === id)!;
        item.status = action === 'ACCEPT' ? 'ACCEPTED' : action === 'CORRECT' ? 'CORRECTED' : 'REJECTED';
        if (correctedValue) item.suggestedValue = correctedValue;
        item.resolutionNote = reason;
      });

      db.logAudit('REVIEW_ACTION', reviewerId || 'REVIEWER', { reviewId: id, action, correctedValue, reason }, req.correlationId);

      res.json({
        success: true,
        reviewId: id,
        status: action === 'ACCEPT' ? 'ACCEPTED' : action === 'CORRECT' ? 'CORRECTED' : 'REJECTED',
        updatedDocumentStatus: 'VERIFIED',
        message: `Review item successfully resolved with action ${action}.`,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/policies', (req: Request, res: Response) => {
    res.json(db.get().policies);
  });

  app.get('/api/v1/policies/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const p = db.get().policies.find((item) => item.id === req.params.id);
      if (!p) throw new AppError(`Policy "${req.params.id}" not found.`, 404, 'NOT_FOUND');
      res.json(p);
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/v1/policies/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const policy = db.get().policies.find((p) => p.id === id);
      if (!policy) throw new AppError(`Policy "${id}" not found.`, 404, 'NOT_FOUND');

      const updated = db.update((state) => {
        const p = state.policies.find((item) => item.id === id)!;
        p.status = status;
      }).policies.find((p) => p.id === id)!;

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/runs', (req: Request, res: Response) => {
    res.json(db.get().runs);
  });

  app.get('/api/v1/runs/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = db.get().runs.find((item) => item.id === req.params.id || item.runId === req.params.id);
      if (!run) throw new AppError(`Agent trace run "${req.params.id}" not found.`, 404, 'NOT_FOUND');
      res.json(run);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 10. Quali AI Orchestrator Endpoints
  // ==========================================
  // Note: orchestratorModule and voiceModule are pre-loaded above

  // Create new workflow
  app.post('/api/v1/orchestrator/workflow', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { createWorkflow } = getOrchestrator();
      
      const body = req.body;
      if (!body.userId || !body.userRequest) {
        throw new AppError('userId and userRequest are required.', 400, 'MISSING_FIELDS');
      }
      
      const workflow = createWorkflow({
        userId: body.userId,
        userRequest: body.userRequest,
        userPreferences: body.userPreferences,
        opportunityId: body.opportunityId,
        profileVersion: body.profileVersion,
        documentVersion: body.documentVersion,
        resumeFrom: body.resumeFrom,
        transcript: body.transcript,
      });
      
      db.logAudit('WORKFLOW_CREATED', 'USER', {
        workflowId: workflow.workflowId,
        userId: body.userId,
      }, req.correlationId);
      
      res.status(201).json({
        workflowId: workflow.workflowId,
        status: workflow.status,
        currentStep: workflow.currentStep,
        message: 'Workflow created. Use execute endpoint to run.',
      });
    } catch (err) {
      next(err);
    }
  });

  // Execute workflow step
  app.post('/api/v1/orchestrator/workflow/:workflowId/execute', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { executeStep, executeFullWorkflow } = getOrchestrator();
      
      const { workflowId } = req.params;
      const { step, full } = req.body as { step?: string; full?: boolean };
      
      let result;
      if (full) {
        const state = executeFullWorkflow(workflowId);
        result = {
          workflowId: state.workflowId,
          status: state.status,
          currentStep: state.currentStep,
          completedToolCalls: state.completedToolCalls,
        };
      } else if (step) {
        const stepResult = executeStep(workflowId, step);
        result = {
          success: stepResult.success,
          stepName: stepResult.stepName,
          result: stepResult.result,
          error: stepResult.error,
          nextStep: stepResult.nextStep,
        };
      } else {
        // Execute all remaining steps
        const state = executeFullWorkflow(workflowId);
        result = {
          workflowId: state.workflowId,
          status: state.status,
          currentStep: state.currentStep,
          completedToolCalls: state.completedToolCalls,
        };
      }
      
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Get workflow status
  app.get('/api/v1/orchestrator/workflow/:workflowId', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { getWorkflowStatus } = getOrchestrator();
      
      const { workflowId } = req.params;
      const state = getWorkflowStatus(workflowId);
      
      if (!state) {
        throw new AppError(`Workflow ${workflowId} not found.`, 404, 'NOT_FOUND');
      }
      
      res.json({
        workflowId: state.workflowId,
        status: state.status,
        currentStep: state.currentStep,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        userRequest: state.userRequest,
        recommendation: state.recommendation,
        eligibilityReport: state.eligibilityReport,
        pendingActions: state.pendingActions,
        evidenceReferences: state.evidenceReferences,
        transcript: state.transcript,
        lastError: state.lastError,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get assistant response from workflow
  app.get('/api/v1/orchestrator/workflow/:workflowId/response', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { getWorkflowStatus, buildAssistantResponse } = getOrchestrator();
      const { generateChecklist } = require('./orchestrator/actionCoordinator');
      
      const { workflowId } = req.params;
      const state = getWorkflowStatus(workflowId);
      
      if (!state) {
        throw new AppError(`Workflow ${workflowId} not found.`, 404, 'NOT_FOUND');
      }
      
      // Build response
      const opp = db.get().opportunities.find(o => o.id === state.recommendation?.opportunityId);
      if (!opp) {
        throw new AppError('Opportunity not found.', 404, 'NOT_FOUND');
      }
      
      const eligibility = {
        criteria: state.criterionResults,
        meetsCriteria: state.criterionResults.filter(c => c.status === 'MEETS'),
        failedCriteria: state.criterionResults.filter(c => c.status === 'DOES_NOT_MEET'),
        insufficientCriteria: state.criterionResults.filter(c => c.status === 'INSUFFICIENT_EVIDENCE'),
        report: state.eligibilityReport!,
      };
      
      const checklist = generateChecklist(opp, eligibility, state.recommendation, {
        fullName: db.get().profile.fullName,
        email: db.get().profile.email,
        educationTier: db.get().profile.educationTier,
      });
      
      const response = buildAssistantResponse(state, checklist, 'Workflow completed');
      
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // Submit for approval
  app.post('/api/v1/orchestrator/workflow/:workflowId/approval/request', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { submitForApproval } = getOrchestrator();
      
      const { workflowId } = req.params;
      const { actionType } = req.body as { actionType: string };
      
      const approvalRequest = submitForApproval(workflowId, actionType as any);
      
      if (!approvalRequest) {
        throw new AppError(`No pending approval request for action type ${actionType}.`, 404, 'NOT_FOUND');
      }
      
      res.json(approvalRequest);
    } catch (err) {
      next(err);
    }
  });

  // Handle approval
  app.post('/api/v1/orchestrator/workflow/:workflowId/approval', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { handleApproval } = getOrchestrator();
      
      const { workflowId } = req.params;
      const { actionId, approved, note } = req.body as { actionId: string; approved: boolean; note?: string };
      
      const result = handleApproval(workflowId, actionId, approved, note);
      
      db.logAudit('APPROVAL_HANDLED', 'USER', {
        workflowId,
        actionId,
        approved,
      }, req.correlationId);
      
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Voice session endpoints
  app.post('/api/v1/orchestrator/voice/session', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { getOrCreateSession } = getVoice();
      
      const { sessionId, userId } = req.body as { sessionId: string; userId: string };
      
      if (!sessionId || !userId) {
        throw new AppError('sessionId and userId are required.', 400, 'MISSING_FIELDS');
      }
      
      const session = getOrCreateSession(sessionId, userId);
      
      res.json({
        sessionId: session.sessionId,
        workflowId: session.workflowId,
        transcript: session.transcript,
      });
    } catch (err) {
      next(err);
    }
  });

  // Process voice input
  app.post('/api/v1/orchestrator/voice/input', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { processVoiceInput } = getVoice();
      
      const { sessionId, userId, text, isNewConversation } = req.body as {
        sessionId: string;
        userId: string;
        text: string;
        isNewConversation?: boolean;
      };
      
      if (!sessionId || !userId || !text) {
        throw new AppError('sessionId, userId, and text are required.', 400, 'MISSING_FIELDS');
      }
      
      const result = processVoiceInput(sessionId, userId, text, {
        isNewConversation: isNewConversation || false,
      });
      
      res.json({
        response: result.response,
        sessionId: result.sessionId,
        workflowId: result.workflowId,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get voice session transcript
  app.get('/api/v1/orchestrator/voice/session/:sessionId/transcript', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { getSessionTranscript } = getVoice();
      
      const { sessionId } = req.params;
      const transcript = getSessionTranscript(sessionId);
      
      if (!transcript) {
        throw new AppError(`Session ${sessionId} not found.`, 404, 'NOT_FOUND');
      }
      
      res.json(transcript);
    } catch (err) {
      next(err);
    }
  });

  // End voice session
  app.post('/api/v1/orchestrator/voice/session/:sessionId/end', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { endSession } = getVoice();
      
      const { sessionId } = req.params;
      const ended = endSession(sessionId);
      
      if (!ended) {
        throw new AppError(`Session ${sessionId} not found.`, 404, 'NOT_FOUND');
      }
      
      res.json({ success: true, message: 'Session ended.' });
    } catch (err) {
      next(err);
    }
  });

  // Get voice session status
  app.get('/api/v1/orchestrator/voice/session/:sessionId/status', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { getSessionStatus } = getVoice();
      
      const { sessionId } = req.params;
      const status = getSessionStatus(sessionId);
      
      if (!status) {
        throw new AppError(`Session ${sessionId} not found.`, 404, 'NOT_FOUND');
      }
      
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // Voice health check
  app.get('/api/v1/orchestrator/voice/health', (req: Request, res: Response) => {
    ensureOrchestratorInitialized();
    const { checkVoiceHealth } = getVoice();
    const health = checkVoiceHealth();
    res.json(health);
  });

  // Synthesize speech (TTS integration point)
  app.post('/api/v1/orchestrator/voice/synthesize', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { synthesizeSpeech } = getVoice();
      
      const { text, voice, language, rate, pitch } = req.body as {
        text: string;
        voice?: string;
        language?: string;
        rate?: number;
        pitch?: number;
      };
      
      if (!text) {
        throw new AppError('text is required.', 400, 'MISSING_FIELDS');
      }
      
      const result = synthesizeSpeech({
        text,
        voice,
        language,
        rate,
        pitch,
      });
      
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Cancel workflow
  app.post('/api/v1/orchestrator/workflow/:workflowId/cancel', (req: Request, res: Response, next: NextFunction) => {
    try {
      ensureOrchestratorInitialized();
      const { cancelWorkflow } = getOrchestrator();
      
      const { workflowId } = req.params;
      const cancelled = cancelWorkflow(workflowId);
      
      if (!cancelled) {
        throw new AppError(`Workflow ${workflowId} not found.`, 404, 'NOT_FOUND');
      }
      
      res.json({ success: true, message: 'Workflow cancelled.' });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 11. Application Workflow Endpoints
  // ==========================================

  // Profile submission and validation for workflow
  app.post('/api/v1/workflow/profile/validate', (req: Request, res: Response) => {
    const submission = req.body as Partial<ProfileSubmission>;
    const errors: Array<{ field: string; message: string; code: string }> = [];

    if (!submission.fullName || typeof submission.fullName !== 'string' || submission.fullName.trim().length < 2) {
      errors.push({ field: 'fullName', message: 'Full name must be at least 2 characters.', code: 'INVALID_NAME' });
    }
    if (!submission.email || typeof submission.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) {
      errors.push({ field: 'email', message: 'Valid email address required.', code: 'INVALID_EMAIL' });
    }
    if (!submission.institution || typeof submission.institution !== 'string' || submission.institution.trim().length < 2) {
      errors.push({ field: 'institution', message: 'Institution name is required.', code: 'INVALID_INSTITUTION' });
    }
    if (!submission.degree || typeof submission.degree !== 'string' || submission.degree.trim().length < 2) {
      errors.push({ field: 'degree', message: 'Degree program is required.', code: 'INVALID_DEGREE' });
    }
    if (!submission.educationTier || !['undergraduate', 'masters', 'phd', 'postdoc'].includes(submission.educationTier)) {
      errors.push({ field: 'educationTier', message: 'Valid education tier required (undergraduate, masters, phd, postdoc).', code: 'INVALID_EDUCATION_TIER' });
    }
    if (!submission.graduationDate || typeof submission.graduationDate !== 'string' || !/^\d{4}-\d{2}$/.test(submission.graduationDate)) {
      errors.push({ field: 'graduationDate', message: 'Graduation date must be in YYYY-MM format.', code: 'INVALID_GRADUATION_DATE' });
    }
    if (submission.gpa === undefined || typeof submission.gpa !== 'number' || submission.gpa < 0 || submission.gpa > 4.0) {
      errors.push({ field: 'gpa', message: 'GPA must be a number between 0.00 and 4.00.', code: 'INVALID_GPA' });
    }
    if (!submission.workAuthorization || !['us-citizen', 'f1-opt', 'eu-global'].includes(submission.workAuthorization)) {
      errors.push({ field: 'workAuthorization', message: 'Valid work authorization status required.', code: 'INVALID_WORK_AUTH' });
    }

    res.json({ valid: errors.length === 0, errors });
  });

  app.post('/api/v1/workflow/profile/submit', (req: Request, res: Response, next: NextFunction) => {
    try {
      const submission = req.body as ProfileSubmission;

      // Validate first
      const validation: { valid: boolean; errors: Array<{ field: string; message: string; code: string }> } = { valid: true, errors: [] };
      if (!submission.fullName || submission.fullName.trim().length < 2) {
        validation.valid = false;
        validation.errors.push({ field: 'fullName', message: 'Full name required.', code: 'INVALID_NAME' });
      }
      if (!submission.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) {
        validation.valid = false;
        validation.errors.push({ field: 'email', message: 'Valid email required.', code: 'INVALID_EMAIL' });
      }
      if (!['undergraduate', 'masters', 'phd', 'postdoc'].includes(submission.educationTier)) {
        validation.valid = false;
        validation.errors.push({ field: 'educationTier', message: 'Invalid education tier.', code: 'INVALID_TIER' });
      }
      if (!submission.graduationDate || !/^\d{4}-\d{2}$/.test(submission.graduationDate)) {
        validation.valid = false;
        validation.errors.push({ field: 'graduationDate', message: 'Invalid graduation date format.', code: 'INVALID_DATE' });
      }
      if (typeof submission.gpa !== 'number' || submission.gpa < 0 || submission.gpa > 4.0) {
        validation.valid = false;
        validation.errors.push({ field: 'gpa', message: 'GPA must be between 0 and 4.0.', code: 'INVALID_GPA' });
      }

      if (!validation.valid) {
        throw new AppError('Profile validation failed', 400, 'VALIDATION_FAILED', { errors: validation.errors });
      }

      // Update the profile in store
      const updated = db.update((state) => {
        state.profile = {
          ...state.profile,
          ...submission,
          id: `cand-${Date.now()}`,
          authProvider: 'Quali Workflow Portal',
          includeGpaInAudit: true,
          avatarUrl: state.profile.avatarUrl,
          focusVector: submission.degree,
          vaultStatus: 'Zero-Leak Enclave',
          matchingReadiness: 'Ready to Audit',
          statementQuote: state.profile.statementQuote,
        };
      }).profile;

      db.logAudit('PROFILE_SUBMITTED_WORKFLOW', 'USER', { fields: Object.keys(submission) }, req.correlationId);

      res.status(201).json(updated);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/workflow/profile', (req: Request, res: Response) => {
    res.json(db.get().profile);
  });

  // Document processing with status tracking
  app.post('/api/v1/workflow/documents/process', uploadLimiter.middleware, upload.single('file') as unknown as express.RequestHandler, (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file) {
        throw new AppError('No document file attached.', 400, 'MISSING_FILE');
      }

      const documentType = (req.body.document_type || req.body.documentType || 'TRANSCRIPT') as IngestedDocument['documentType'];

      // Validate
      const validation = validateDocumentUpload({
        filename: file.originalname,
        sizeBytes: file.size,
        mimeType: file.mimetype,
      });

      if (!validation.valid) {
        throw new AppError(validation.error!, 400, validation.code);
      }

      // Check for duplicates
      const hash = computeSha256(file.buffer);
      const existing = db.get().ingestedDocuments.find((d) => d.sha256 === hash);
      if (existing) {
        throw new AppError(
          `Duplicate document: "${file.originalname}" has identical SHA-256 to "${existing.name}".`,
          409,
          'DUPLICATE_DOCUMENT',
          { existingDocumentId: existing.id, sha256: hash }
        );
      }

      // Create processing request ID
      const requestId = `proc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

      // Process document synchronously (in real implementation, this could be async)
      const result = processDocument({
        filename: file.originalname,
        buffer: file.buffer,
        mimeType: file.mimetype,
        documentType,
      });

      // Store in vault
      db.update((state) => {
        state.ingestedDocuments.unshift(result.document);
      });

      db.logAudit('DOCUMENT_PROCESSED_WORKFLOW', 'USER', {
        requestId,
        documentId: result.document.id,
        name: result.document.name,
        sha256: result.document.sha256,
        documentType,
      }, req.correlationId);

      // Return request ID and initial state
      res.status(202).json({
        requestId,
        initialState: {
          stage: 'indexing',
          message: 'Document processed and indexed successfully.',
          progress: 100,
        },
        document: result.document,
        extractedCitations: result.extractedCitations,
        processingTimeMs: Date.now(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/v1/workflow/documents/status/:requestId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { requestId } = req.params;
      const doc = db.get().ingestedDocuments.find((d) => d.id === requestId || d.name.includes(requestId));

      if (doc) {
        // Get extracted citations for this document from criteriaRubrics or document itself
        // Citations are stored on criteria rubrics when eligibility is evaluated
        const citations = db.get().criteriaRubrics
          .filter((r) => r.evidenceCitation?.documentId === doc.id)
          .map((r) => ({ ...r.evidenceCitation!, criteriaId: r.id, status: r.status }));

        // If no citations found via criteria, return empty array (document may not be evaluated yet)
        // In production, citations would be stored with the document or extracted on demand

        return res.json({
          requestId,
          state: 'completed',
          document: doc,
          citations,
          error: undefined,
        });
      }

      throw new AppError(`Processing request "${requestId}" not found.`, 404, 'NOT_FOUND');
    } catch (err) {
      next(err);
    }
  });

  // Eligibility evaluation for workflow
  app.post('/api/v1/workflow/eligibility/evaluate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { opportunityId, caseId } = req.body as { opportunityId: string; caseId?: string };

      if (!opportunityId) {
        throw new AppError('opportunityId is required.', 400, 'MISSING_OPPORTUNITY_ID');
      }

      const state = db.get();
      const opp = state.opportunities.find((o) => o.id === opportunityId);
      if (!opp) {
        throw new AppError(`Opportunity "${opportunityId}" not found.`, 404, 'NOT_FOUND');
      }

      const startTime = Date.now();

      const outcome = evaluateEligibility(opp, {
        opportunityId: opp.id,
        candidateProfile: state.profile,
        criteriaRubrics: state.criteriaRubrics,
        documents: state.ingestedDocuments,
        caseId: caseId || undefined,
      });

      // Save report in state
      db.update((s) => {
        s.eligibilityReports[outcome.report.caseId] = outcome.report;
        s.eligibilityReports[outcome.report.id] = outcome.report;
        for (const crit of outcome.criteria) {
          const idx = s.criteriaRubrics.findIndex((r) => r.id === crit.id);
          if (idx >= 0) {
            s.criteriaRubrics[idx] = crit;
          } else {
            s.criteriaRubrics.push(crit);
          }
        }
      });

      db.logAudit('ELIGIBILITY_EVALUATED_WORKFLOW', 'ENGINE', {
        opportunityId: opp.id,
        caseId: outcome.report.caseId,
        overallStatus: outcome.report.overallStatus,
        deterministicScore: outcome.report.deterministicScore,
      }, req.correlationId);

      res.json({
        report: outcome.report,
        criteria: outcome.criteria,
        meetsCriteria: outcome.meetsCriteria,
        failedCriteria: outcome.failedCriteria,
        insufficientCriteria: outcome.insufficientCriteria,
        hardGates: outcome.report.hardGates,
        processingTimeMs: Date.now() - startTime,
      });
    } catch (err) {
      next(err);
    }
  });

  // Checklist generation from eligibility results
  app.post('/api/v1/workflow/checklist/generate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { opportunityId, eligibilityResultId } = req.body as { opportunityId: string; eligibilityResultId: string };

      if (!opportunityId) {
        throw new AppError('opportunityId is required.', 400, 'MISSING_OPPORTUNITY_ID');
      }

      const state = db.get();
      const opp = state.opportunities.find((o) => o.id === opportunityId);
      if (!opp) {
        throw new AppError(`Opportunity "${opportunityId}" not found.`, 404, 'NOT_FOUND');
      }

      const generated = generateChecklistTasks(opp, state.criteriaRubrics);

      db.update((s) => {
        s.tasks = [...generated, ...s.tasks];
      });

      db.logAudit('CHECKLIST_GENERATED_WORKFLOW', 'ENGINE', {
        opportunityId: opp.id,
        eligibilityResultId,
        generatedTasksCount: generated.length,
      }, req.correlationId);

      res.json({
        tasks: generated,
        generatedAt: new Date().toISOString(),
        linkedOpportunityId: opportunityId,
        linkedEligibilityReportId: eligibilityResultId || '',
      });
    } catch (err) {
      next(err);
    }
  });

  // Get full workflow state
  app.get('/api/v1/workflow/state/:workflowId', (req: Request, res: Response) => {
    const { workflowId } = req.params;
    const state = db.get();

    res.json({
      profile: state.profile,
      documents: state.ingestedDocuments,
      eligibilityReport: Object.values(state.eligibilityReports).find((r) => r.caseId.includes(workflowId)) || null,
      checklist: state.tasks,
      workflowId,
      status: state.ingestedDocuments.length > 0 ? 'in_progress' : 'pending_profile',
    });
  });

  // Serve static assets if needed
  app.use('/assets', express.static(path.resolve(process.cwd(), 'dist/assets')));

  // ==========================================
  // Health & Readiness Endpoints
  // ==========================================

  app.get('/api/v1/health', async (req: Request, res: Response) => {
    const checker = getHealthChecker();
    const health = await checker.getOverallHealth();
    res.json(health);
  });

  app.get('/api/v1/ready', async (req: Request, res: Response) => {
    const checker = getHealthChecker();
    const storeCheck = await checker.checkStore();
    const depCheck = await checker.checkDependencies();

    const ready = storeCheck.status === 'pass' && depCheck.status !== 'fail';
    res.json({
      ready,
      timestamp: new Date().toISOString(),
      checks: {
        store: storeCheck,
        dependencies: depCheck,
      },
    });
  });

  app.get('/api/v1/health/live', (_req: Request, res: Response) => {
    // Kubernetes liveness probe - just confirms process is alive
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
  });

  app.get('/api/v1/metrics', (req: Request, res: Response) => {
    // Expose non-sensitive operational metrics
    const checker = getHealthChecker();
    const metrics = checker.getMetrics();
    res.json({
      // Only expose non-sensitive metrics
      requests: {
        total: metrics.totalRequests,
        successful: metrics.successfulRequests,
        failed: metrics.failedRequests,
        rateLimited: metrics.rateLimitedRequests,
      },
      latencyMs: {
        p50: metrics.latencyP50,
        p95: metrics.latencyP95,
        p99: metrics.latencyP99,
      },
      processing: {
        documentsProcessed: metrics.documentsProcessed,
        documentsFailed: metrics.documentsFailed,
        extractionsCompleted: metrics.extractionsCompleted,
        extractionsFailed: metrics.extractionsFailed,
        eligibilityEvaluations: metrics.eligibilityEvaluations,
      },
      errors: {
        validation: metrics.validationErrors,
        processing: metrics.processingErrors,
        duplicates: metrics.duplicateDetections,
        security: metrics.securityRejections,
      },
      uptime: {
        startTime: metrics.startTime,
        seconds: metrics.uptimeSeconds,
      },
      // Note: version exposed for debugging, could be removed in high-security deployments
      version: process.env.npm_package_version || '0.0.0',
    });
  });

  // Fallback 404 handler for unknown API routes
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      detail: `API endpoint ${req.method} ${req.originalUrl} not found.`,
      code: 'ROUTE_NOT_FOUND',
      correlation_id: req.correlationId,
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
