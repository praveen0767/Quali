/**
 * Quali — Eligibility, with Proof.
 * Authoritative Application Router
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { DocumentIntakePage } from './pages/DocumentIntakePage';
import { CriteriaInspectorPage } from './pages/CriteriaInspectorPage';
import { EligibilityReportPage } from './pages/EligibilityReportPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { ApplicationPlannerPage } from './pages/ApplicationPlannerPage';
import { WorkflowPage } from './pages/WorkflowPage';
import { VoiceAssistantPage } from './pages/VoiceAssistantPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          {/* 1. Dashboard / My Day */}
          <Route path="/" element={<DashboardPage />} />

          {/* 2. Opportunity Workspace */}
          <Route path="/opportunities" element={<OpportunitiesPage />} />

          {/* 3. Document Ingestion */}
          <Route path="/documents" element={<DocumentIntakePage />} />

          {/* 4. Criteria Review and Evidence Inspector */}
          <Route path="/criteria" element={<CriteriaInspectorPage />} />

          {/* 5. Eligibility Report */}
          <Route path="/report" element={<EligibilityReportPage />} />

          {/* 6. Personalized Recommendations */}
          <Route path="/recommendations" element={<RecommendationsPage />} />

          {/* 7. Application Task Planner */}
          <Route path="/planner" element={<ApplicationPlannerPage />} />

          {/* 8. End-to-End Workflow */}
          <Route path="/workflow" element={<WorkflowPage />} />

          {/* 8. Voice Assistant */}
          <Route path="/assistant" element={<VoiceAssistantPage />} />

          {/* 9. End-to-End Workflow */}
          <Route path="/workflow" element={<WorkflowPage />} />

          {/* 9. Profile and Privacy Settings */}
          <Route path="/profile" element={<ProfileSettingsPage />} />

          {/* 10. End-to-End Workflow */}
          <Route path="/workflow" element={<WorkflowPage />} />

          {/* Legacy / Catch-all redirects */}
          <Route path="/my-day" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
