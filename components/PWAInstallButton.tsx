'use client';

import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running in standalone mode, do not show install CTA
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {isInstallable && (
        <button
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-medium transition-all shadow-md shadow-indigo-900/30 active:scale-95"
          title="Install Antigravity Prompt Compiler as an App"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install PWA</span>
        </button>
      )}

      {isIOS && !isInstallable && (
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-900/80 text-slate-300 hover:text-white text-xs font-medium transition-all"
        >
          <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
          <span>Install on iOS</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl glass-panel p-6 shadow-2xl border border-slate-700/80 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-400" />
                Install on iPhone / iPad
              </h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 text-xs font-bold border border-indigo-500/30">
                  1
                </span>
                <p>
                  Tap the <strong className="text-white">Share</strong> button in the Safari toolbar.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 text-xs font-bold border border-indigo-500/30">
                  2
                </span>
                <p>
                  Scroll down the share sheet and tap <strong className="text-white">Add to Home Screen</strong>.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 text-xs font-bold border border-indigo-500/30">
                  3
                </span>
                <p>
                  Confirm <strong className="text-white">Add</strong> to launch in dedicated standalone dark mode!
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-semibold text-slate-200 transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
