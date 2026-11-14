import { ApplicationTask, CriteriaRubric, Opportunity } from '../../lib/api/types';

export function generateChecklistTasks(
  opportunity: Opportunity,
  rubrics: CriteriaRubric[]
): ApplicationTask[] {
  const tasks: ApplicationTask[] = [];
  const now = new Date();

  // Helper to compute offset deadline relative to opportunity deadline
  const computeOffsetDeadline = (daysBefore: number): string => {
    try {
      const oppDate = new Date(opportunity.deadline);
      if (isNaN(oppDate.getTime())) return opportunity.deadline;
      oppDate.setDate(oppDate.getDate() - daysBefore);
      return oppDate.toISOString().split('T')[0];
    } catch {
      return opportunity.deadline;
    }
  };

  // Inspect rubrics for missing/insufficient criteria
  for (const rubric of rubrics) {
    if (rubric.status === 'INSUFFICIENT') {
      if (rubric.clauseCategory === 'DOMAIN_EXPERTISE' && rubric.criterionTitle.toLowerCase().includes('faculty')) {
        tasks.push({
          id: `task-gen-${Date.now()}-1`,
          title: 'Obtain Lab Host Commitment Letter from Faculty PI',
          opportunityTitle: opportunity.title,
          deadline: computeOffsetDeadline(25),
          status: 'PENDING',
          priority: 'HIGH',
          category: 'LOR',
        });
      } else if (rubric.clauseCategory === 'DOMAIN_EXPERTISE') {
        tasks.push({
          id: `task-gen-${Date.now()}-2`,
          title: `Upload Supplemental Research Artifact for ${rubric.criterionTitle}`,
          opportunityTitle: opportunity.title,
          deadline: computeOffsetDeadline(20),
          status: 'PENDING',
          priority: 'MEDIUM',
          category: 'DOCUMENT',
        });
      } else {
        tasks.push({
          id: `task-gen-${Date.now()}-3`,
          title: `Resolve Evidence Gap for ${rubric.criterionTitle}`,
          opportunityTitle: opportunity.title,
          deadline: computeOffsetDeadline(15),
          status: 'PENDING',
          priority: 'HIGH',
          category: 'DOCUMENT',
        });
      }
    } else if (rubric.status === 'FAILED' || rubric.status === 'FAIL') {
      tasks.push({
        id: `task-gen-${Date.now()}-4`,
        title: `CRITICAL: Disqualifying Gate Detected (${rubric.criterionTitle}) - Review Standing`,
        opportunityTitle: opportunity.title,
        deadline: computeOffsetDeadline(30),
        status: 'PENDING',
        priority: 'HIGH',
        category: 'DOCUMENT',
      });
    }
  }

  // Always add Research Statement task if applicable
  if (opportunity.category === 'Fellowship' || opportunity.category === 'Grant') {
    tasks.push({
      id: `task-gen-${Date.now()}-essay`,
      title: `Draft 2-Page Research Statement tailored to ${opportunity.sponsor}`,
      opportunityTitle: opportunity.title,
      deadline: computeOffsetDeadline(14),
      status: 'PENDING',
      priority: 'HIGH',
      category: 'ESSAY',
    });
  }

  // Final dossier submission
  tasks.push({
    id: `task-gen-${Date.now()}-sub`,
    title: `Submit Final Application Dossier & Certified Proof Bundle`,
    opportunityTitle: opportunity.title,
    deadline: opportunity.deadline,
    status: 'PENDING',
    priority: 'HIGH',
    category: 'SUBMISSION',
  });

  return tasks;
}
