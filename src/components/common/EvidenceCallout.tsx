import React from 'react';
import { Badge, BadgeVariant } from './Badge';

interface EvidenceCalloutProps {
  quote: string;
  documentName: string;
  pageNumber: number;
  lineNumber?: number;
  confidence?: number;
  status?: BadgeVariant;
  sha256?: string;
  className?: string;
}

export function EvidenceCallout({
  quote,
  documentName,
  pageNumber,
  lineNumber,
  confidence,
  status = 'VERIFIED',
  sha256,
  className = '',
}: EvidenceCalloutProps) {
  const isGood = status === 'MEETS' || status === 'PASS' || status === 'MATCH' || status === 'VERIFIED';
  const isBad = status === 'FAILED' || status === 'FAIL' || status === 'MISMATCH';

  const borderColor = isGood
    ? 'border-l-[#159A98]'
    : isBad
    ? 'border-l-[#C5221F]'
    : 'border-l-[#B06000]';

  return (
    <div
      className={`p-3.5 rounded-r-xl rounded-l-xs bg-[#F6F8FC] border border-[#E4E9F2] border-l-4 ${borderColor} space-y-2 ${className}`}
    >
      <div className="flex items-center justify-between text-xs text-[#526079] gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 font-medium truncate min-w-0">
          <span className="material-symbols-outlined text-[16px] text-[#159A98]">description</span>
          <span className="truncate text-[#0C1946]">{documentName}</span>
          <span className="text-[#526079]">• Page {pageNumber}{lineNumber ? `, Line ${lineNumber}` : ''}</span>
        </div>
        {confidence !== undefined && (
          <Badge variant={status} size="sm" icon="verified">
            {(confidence * 100).toFixed(1)}% Confidence
          </Badge>
        )}
      </div>

      <p className="text-xs italic text-[#0C1946] leading-relaxed bg-white p-2.5 rounded-lg border border-[#E4E9F2]">
        “{quote}”
      </p>

      {sha256 && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#526079] truncate">
          <span className="material-symbols-outlined text-[13px] text-[#159A98]">lock</span>
          <span className="truncate">Provenance: {sha256.substring(0, 16)}...</span>
        </div>
      )}
    </div>
  );
}
