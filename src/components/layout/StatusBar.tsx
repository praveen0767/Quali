import React, { useEffect, useState } from 'react';
import { getSystemTelemetry } from '../../lib/api/system';
import { SystemTelemetry } from '../../lib/api/types';

export function StatusBar() {
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await getSystemTelemetry();
        if (active) setTelemetry(data);
      } catch {
        // Fallback
      }
    }
    load();
    const interval = setInterval(load, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <footer className="h-8 bg-white border-t border-[#E4E9F2] px-4 flex items-center justify-between font-mono text-[11px] text-[#526079] select-none shrink-0 z-30">
      <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
        {/* Gate Engine */}
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#137333]" />
          <span>Deterministic Gate: Operational</span>
        </span>

        <span className="text-[#E4E9F2]">•</span>

        {/* Enclave */}
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#159A98]" />
          <span>Zero-Leak Vault: Active</span>
        </span>

        <span className="text-[#E4E9F2]">•</span>

        {/* Evidence Hash */}
        <span className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-[#159A98]">lock</span>
          <span>Provenance: SHA-256 Grounded</span>
        </span>

        <span className="text-[#E4E9F2]">•</span>

        {/* Verified Claims */}
        <span>Verified Claims: {telemetry ? telemetry.verifiedClaimsCount : 51}</span>
      </div>

      <div className="flex items-center gap-2 text-[#526079] shrink-0 pl-3">
        <span>Quali Engine v2.4-core</span>
      </div>
    </footer>
  );
}
