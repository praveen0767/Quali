import React, { useEffect, useState, useRef } from 'react';
import { getAssistantConversation, sendAssistantQuery } from '../lib/api/assistant';
import { VoiceAssistantMessage } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';

export function VoiceAssistantPage() {
  const [messages, setMessages] = useState<VoiceAssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAssistantConversation();
      setMessages(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve conversation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || inputPrompt;
    if (!textToSend.trim()) return;

    setIsSubmitting(true);
    setInputPrompt('');
    try {
      const resp = await sendAssistantQuery(textToSend);
      setMessages((prev) => [...prev, resp]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get answer from assistant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleVoice = () => {
    if (!isRecording) {
      setIsRecording(true);
      // Simulate speech recognition input after 2.5 seconds
      setTimeout(() => {
        setIsRecording(false);
        setInputPrompt('What is my strongest match right now?');
      }, 2500);
    } else {
      setIsRecording(false);
    }
  };

  const presetQueries = [
    'Am I eligible for the NSF GRFP with an F-1 visa?',
    'What is my strongest match right now?',
    'Explain how my NeurIPS pre-print proves my computational biology qualification.',
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[450px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E4E9F2]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#0C1946]">Quali Voice Assistant</h1>
            <Badge variant="VERIFIED" size="sm">
              Grounded Retrieval
            </Badge>
          </div>
          <p className="text-xs text-[#526079] mt-0.5">
            Ask natural language or voice queries. Every answer is backed by verbatim page-and-line receipts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="COBALT" size="sm" icon="lock">
            Zero-Leak Enclave Active
          </Badge>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={loadData} />}

      {/* Main Conversation Container */}
      <Card className="flex flex-col h-[520px] bg-white border border-[#E4E9F2] shadow-sm overflow-hidden">
        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.sender === 'USER';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                    isUser
                      ? 'bg-[#245FD2] text-white shadow-2xs'
                      : 'bg-[#0C1946] text-[#87f4f1] shadow-2xs'
                  }`}
                >
                  {isUser ? 'ER' : 'Q'}
                </div>

                <div className="space-y-2">
                  <div
                    className={`p-4 rounded-2xl text-xs leading-relaxed ${
                      isUser
                        ? 'bg-[#245FD2] text-white rounded-tr-xs'
                        : 'bg-[#F6F8FC] text-[#0C1946] border border-[#E4E9F2] rounded-tl-xs'
                    }`}
                  >
                    <p>{msg.text}</p>
                  </div>

                  {/* Verbatim Citations Attached to Assistant Output */}
                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="space-y-1.5 pl-2">
                      <span className="text-[10px] font-bold text-[#159A98] uppercase tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">verified</span>
                        Grounded Proof Receipts ({msg.citations.length}):
                      </span>
                      {msg.citations.map((c, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg bg-white border border-[#E4E9F2] border-l-2 border-l-[#159A98] text-[11px] text-[#0C1946]"
                        >
                          <div className="flex items-center justify-between text-[#526079] text-[10px]">
                            <span className="font-semibold text-[#0C1946] truncate max-w-[200px]">
                              {c.documentName}
                            </span>
                            <span>Page {c.page}</span>
                          </div>
                          <p className="italic text-[#0C1946] mt-1 bg-[#F6F8FC] p-1.5 rounded">
                            “{c.quote}”
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <span className="text-[10px] text-[#526079] block px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}

          {isSubmitting && (
            <div className="flex gap-3 max-w-[85%] mr-auto">
              <div className="w-8 h-8 rounded-full bg-[#0C1946] text-[#87f4f1] flex items-center justify-center shrink-0 text-xs font-bold">
                Q
              </div>
              <div className="p-3 bg-[#F6F8FC] rounded-2xl text-xs text-[#526079] flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] animate-spin text-[#245FD2]">
                  progress_activity
                </span>
                <span>Auditing document vault and citing exact clauses...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Audio Waveform Visualization Indicator when Recording */}
        {isRecording && (
          <div className="bg-[#E7EEFF] px-4 py-2 border-t border-[#245FD2]/20 flex items-center justify-between text-xs text-[#245FD2]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#245FD2] animate-ping" />
              <span className="font-bold">Listening to audio input...</span>
            </div>
            {/* Visual audio bars */}
            <div className="flex items-center gap-1 h-4">
              <span className="w-1 bg-[#245FD2] h-2 animate-bounce" />
              <span className="w-1 bg-[#245FD2] h-4 animate-pulse" />
              <span className="w-1 bg-[#245FD2] h-3 animate-bounce" />
              <span className="w-1 bg-[#245FD2] h-4 animate-pulse" />
              <span className="w-1 bg-[#245FD2] h-1 animate-bounce" />
            </div>
          </div>
        )}

        {/* Preset Prompt Suggestions */}
        <div className="px-4 py-2 bg-[#F6F8FC] border-t border-[#E4E9F2] flex items-center gap-2 overflow-x-auto text-[11px] select-none">
          <span className="text-[#526079] shrink-0 font-medium">Try asking:</span>
          {presetQueries.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              className="bg-white border border-[#E4E9F2] hover:border-[#245FD2] px-2.5 py-1 rounded-full text-[#0C1946] whitespace-nowrap transition-colors cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-[#E4E9F2] flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleVoice}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              isRecording
                ? 'bg-[#C5221F] text-white shadow-md animate-pulse'
                : 'bg-[#F6F8FC] hover:bg-[#E7EEFF] text-[#245FD2] border border-[#E4E9F2]'
            }`}
            title={isRecording ? 'Stop Recording' : 'Start Voice Input'}
            aria-label="Toggle Voice Input"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isRecording ? 'mic' : 'mic_none'}
            </span>
          </button>

          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about grants, eligibility rules, or proof citations..."
            className="flex-1 p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-xl text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2] focus:bg-white"
          />

          <Button
            variant="primary"
            size="md"
            icon="send"
            onClick={() => handleSend()}
            disabled={!inputPrompt.trim() || isSubmitting}
          >
            Ask
          </Button>
        </div>
      </Card>
    </div>
  );
}
