import React, { useState } from 'react';
import { VoiceHistoryItem } from '../types';
import { generateSpeech, decodeBase64Audio } from '../geminiService';

const VoiceView: React.FC = () => {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('Kore');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<VoiceHistoryItem[]>([]);

  const voices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

  const handleSpeak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const base64 = await generateSpeech(text, voice);
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const buffer = await decodeBase64Audio(base64, audioCtx);
      
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start();

      setHistory(prev => [{ text, voiceName: voice, timestamp: new Date() }, ...prev]);
    } catch (error) {
      console.error(error);
      alert("Speech generation failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      <header className="px-6 py-4 border-b border-slate-800 glass z-10">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-rose-400">
          Voice Synthesis
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="glass p-8 rounded-3xl border border-slate-800 shadow-2xl mb-12">
            <form onSubmit={handleSpeak} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Text to Speak</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter text to convert to speech..."
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all text-slate-100 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Select Voice</label>
                  <div className="flex flex-wrap gap-2">
                    {voices.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVoice(v)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                          voice === v ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!text.trim() || isLoading}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-2xl font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-3"
                >
                  {isLoading ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                  Synthesize Speech
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Recent Creations</h3>
            {history.map((item, idx) => (
              <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex-1 overflow-hidden">
                  <p className="text-slate-200 text-sm truncate">{item.text}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full">{item.voiceName}</span>
                    <span className="text-[10px] text-slate-500">{item.timestamp.toLocaleTimeString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setText(item.text);
                    setVoice(item.voiceName);
                  }}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceView;