import { apiClient, isMockModeEnabled } from './client';
import { VoiceAssistantMessage } from './types';
import { MOCK_VOICE_CONVERSATION } from './mockAdapter';

let localConversation: VoiceAssistantMessage[] = [...MOCK_VOICE_CONVERSATION];

export async function getAssistantConversation(): Promise<VoiceAssistantMessage[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...localConversation]);
  }
  return apiClient<VoiceAssistantMessage[]>('/api/v1/assistant/messages');
}

export async function sendAssistantQuery(prompt: string): Promise<VoiceAssistantMessage> {
  const userMsg: VoiceAssistantMessage = {
    id: `msg-${Date.now()}-u`,
    sender: 'USER',
    text: prompt,
    timestamp: new Date().toISOString(),
  };
  localConversation.push(userMsg);

  if (isMockModeEnabled()) {
    // Generate grounded response from mock index
    let responseText = 'Your query has been audited against your verified Stanford transcript and NeurIPS pre-print records.';
    let citations = [
      {
        documentName: 'Official_Academic_Transcript_Stanford_Spring2024.pdf',
        page: 1,
        quote: 'Degree: M.S. Computer Science. Cumulative GPA: 3.92.',
      },
    ];

    const lower = prompt.toLowerCase();
    if (lower.includes('nsf') || lower.includes('grfp') || lower.includes('citizen')) {
      responseText = 'You are currently ineligible for the NSF GRFP due to the statutory U.S. citizenship requirement (NSF Solicitation Section II.B). Your verified SEVIS I-20 denotes F-1 Student status.';
      citations = [
        {
          documentName: 'NSF_GRFP_Solicitation_2026.pdf',
          page: 4,
          quote: 'Applicants must be United States citizens, nationals, or permanent residents.',
        },
        {
          documentName: 'Form_I20_F1_STEM_OPT_Signed.pdf',
          page: 1,
          quote: 'Student Status: F-1 Student.',
        },
      ];
    } else if (lower.includes('bio-x') || lower.includes('stanford') || lower.includes('fellowship')) {
      responseText = 'The Stanford Bio-X Fellowship is your highest confidence match (94%). All hard eligibility gates are satisfied (Conferral May 2026, GPA 3.92 vs 3.75, F-1 visa allowed). Your NeurIPS paper demonstrates the interdisciplinary computing requirement.';
      citations = [
        {
          documentName: 'NeurIPS2024_Latent_Graph_Alignments_Preprint.pdf',
          page: 3,
          quote: 'Latent Graph Alignments in Single-Cell RNA Sequencing, NeurIPS 2024.',
        },
      ];
    }

    const assistantMsg: VoiceAssistantMessage = {
      id: `msg-${Date.now()}-a`,
      sender: 'QUALI_ASSISTANT',
      text: responseText,
      timestamp: new Date().toISOString(),
      citations,
    };
    localConversation.push(assistantMsg);
    return Promise.resolve(assistantMsg);
  }

  return apiClient<VoiceAssistantMessage>('/api/v1/assistant/query', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}
