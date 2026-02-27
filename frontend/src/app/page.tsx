'use client';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  SpeakerLayout,
  CallControls,
  useCallStateHooks,
} from '@stream-io/video-react-sdk';

/* ─────────────────────────────────────────────────────────────
   FitAgent — Real-Time AI Fitness Coach
   Stream Video SDK · Tailwind v4 · Real backend integration
───────────────────────────────────────────────────────────── */

const STREAM_API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY || '';
const AGENT_BACKEND_URL = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || 'http://localhost:8000';

type Screen = 'connect' | 'workout';
type AgentState = 'idle' | 'summoning' | 'active' | 'failed';

const FEATURES = [
  { icon: '🦴', label: 'YOLO11 Pose', desc: '17-keypoint skeleton tracking at 30fps' },
  { icon: '🧠', label: 'Gemini Live', desc: 'Real-time voice coaching & analysis' },
  { icon: '⚡', label: '< 30ms', desc: 'Ultra-low latency via Stream Edge' },
  { icon: '🔢', label: 'Rep Counter', desc: 'Auto rep counting & set tracking' },
];

// ── Scan Line ─────────────────────────────────────────────────
function ScanLine() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[inherit] z-[3]">
      <div className="absolute left-0 right-0 h-px bg-linear-to-b from-transparent via-neon/20 to-transparent animate-scan-line" />
    </div>
  );
}

// ── HUD Corners ───────────────────────────────────────────────
function HUDCorners() {
  return (
    <>
      {/* Top-left */}
      <div className="absolute w-5 h-5 opacity-70 top-2 left-2 border-t-2 border-l-2 border-neon" />
      {/* Top-right */}
      <div className="absolute w-5 h-5 opacity-70 top-2 right-2 border-t-2 border-r-2 border-neon" />
      {/* Bottom-left */}
      <div className="absolute w-5 h-5 opacity-70 bottom-2 left-2 border-b-2 border-l-2 border-neon" />
      {/* Bottom-right */}
      <div className="absolute w-5 h-5 opacity-70 bottom-2 right-2 border-b-2 border-r-2 border-neon" />
    </>
  );
}

// ── Feedback Toast ────────────────────────────────────────────
function FeedbackToast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/90 border border-neon px-5 py-2.5 font-mono text-[13px] text-neon whitespace-nowrap z-10 shadow-[0_0_20px_rgba(0,255,135,0.4)] animate-fade-slide-up">
      ⚡ {message}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────
function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div
      className="inline-block rounded-full border-2 border-neon/20 border-t-neon animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

// ── Agent Status Panel ────────────────────────────────────────
function AgentStatusPanel({ agentState }: { agentState: AgentState }) {
  const services = [
    { label: 'Stream Edge', status: 'CONNECTED', ok: true },
    { label: 'YOLO Pose', status: agentState === 'active' ? 'RUNNING' : 'WAITING', ok: agentState === 'active' },
    { label: 'Gemini Live', status: agentState === 'active' ? 'LISTENING' : 'WAITING', ok: agentState === 'active' },
    { label: 'Rep Counter', status: agentState === 'active' ? 'ACTIVE' : 'WAITING', ok: agentState === 'active' },
  ];

  return (
    <div className="rounded-xl p-4 bg-bg2 border border-border">
      <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-text-dim">AGENT STATUS</p>
      <div className="flex flex-col gap-2">
        {services.map(({ label, status, ok }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="font-mono text-[11px] text-text-dim">{label}</span>
            <span className={`flex items-center gap-1 font-mono text-[10px] ${ok ? 'text-neon' : 'text-text-dim'}`}>
              <span className={`text-[6px] ${ok ? 'animate-blink' : ''}`}>●</span>
              {ok ? status : 'OFFLINE'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Participant Count ─────────────────────────────────────────
function ParticipantInfo() {
  const { useParticipantCount } = useCallStateHooks();
  const count = useParticipantCount();
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-text-dim">
      <span className="text-neon">{count}</span>
      <span>{count === 1 ? 'Participant' : 'Participants'}</span>
    </div>
  );
}

// ── Workout Screen (inside StreamCall) ────────────────────────
function WorkoutView({
  agentState,
  feedback,
  onSummonAgent,
  onEndSession,
  callId,
}: {
  agentState: AgentState;
  feedback: string;
  onSummonAgent: () => void;
  onEndSession: () => void;
  callId: string;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg2">
        <span className="font-display text-2xl tracking-[0.1em] text-neon">FITAGENT</span>
        <div className="flex items-center gap-4">
          <ParticipantInfo />
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-dim">
            <div
              className={`w-2 h-2 rounded-full ${agentState === 'active' ? 'bg-neon animate-blink-fast' : 'bg-yellow'}`}
            />
            {agentState === 'active' ? 'AGENT ACTIVE' : agentState === 'summoning' ? 'CONNECTING...' : 'AGENT IDLE'}
          </div>
          <button
            onClick={onEndSession}
            className="rounded cursor-pointer transition-colors duration-200 font-mono text-[11px] bg-bg3 border border-border text-text-dim px-3.5 py-1.5 hover:text-text-bright"
          >
            END SESSION
          </button>
        </div>
      </header>

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-[1fr_320px] gap-5 p-5 mx-auto w-full max-w-[1200px]">
        {/* Left: Video */}
        <div className="flex flex-col gap-4">
          {/* Stream Video Layout */}
          <div
            className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-bg2 border border-border ${agentState === 'active' ? 'animate-glow-pulse' : ''}`}
          >
            <div className="absolute inset-0">
              <SpeakerLayout />
            </div>
            <HUDCorners />
            <ScanLine />

            {/* Exercise tag */}
            <div className="absolute top-3.5 left-3.5 rounded bg-black/75 border border-neon px-2.5 py-1 font-display text-[13px] tracking-[0.15em] text-neon z-[5]">
              {agentState === 'active' ? 'AI COACHING' : 'CAMERA FEED'}
            </div>

            {/* LIVE badge */}
            <div className="absolute top-3.5 right-3.5 rounded-sm bg-red font-bold text-white px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] z-[5] animate-blink">
              ● LIVE
            </div>

            <FeedbackToast message={feedback} />
          </div>

          {/* Call Controls */}
          <div className="rounded-xl overflow-hidden bg-bg2 border border-border">
            <CallControls />
          </div>

          {/* Summon Agent */}
          <button
            onClick={onSummonAgent}
            disabled={agentState === 'summoning' || agentState === 'active'}
            className={`w-full rounded-lg transition-all duration-200 p-3.5 font-display text-lg tracking-[0.1em] flex items-center justify-center gap-2.5 ${
              agentState === 'active'
                ? 'bg-neon/10 border border-neon text-neon cursor-default'
                : agentState === 'summoning'
                  ? 'bg-bg3 border border-border text-text-dim cursor-default'
                  : 'bg-neon border border-neon text-black cursor-pointer shadow-[0_0_20px_rgba(0,255,135,0.5)] hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {agentState === 'summoning' && <Spinner />}
            {agentState === 'idle' && '🏋️ SUMMON AI COACH'}
            {agentState === 'summoning' && 'AGENT JOINING...'}
            {agentState === 'active' && '✅ AI COACH ACTIVE'}
            {agentState === 'failed' && '⚠️ RETRY — SUMMON AI COACH'}
          </button>
        </div>

        {/* Right: Info Panel */}
        <div className="flex flex-col gap-4">
          {/* Call Info */}
          <div className="rounded-xl p-5 bg-bg2 border border-border">
            <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-text-dim">SESSION INFO</p>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-mono text-[11px] text-text-dim">Call ID</span>
                <span className="font-mono text-[11px] text-neon max-w-[180px] overflow-hidden text-ellipsis">
                  {callId}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[11px] text-text-dim">Quality</span>
                <span className="font-mono text-[11px] text-neon">720p</span>
              </div>
            </div>
          </div>

          {/* Agent Status */}
          <AgentStatusPanel agentState={agentState} />

          {/* How It Works */}
          <div className="flex-1 rounded-xl p-4 bg-bg2 border border-border">
            <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-text-dim">HOW IT WORKS</p>
            <div className="flex flex-col gap-2.5">
              {[
                'Join the call & allow camera + mic',
                'Click "Summon AI Coach" to connect the agent',
                'Get into position — FitAgent sees you',
                'Exercise! Get real-time voice coaching',
                'Say "summary" to hear your stats',
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-neon-dim font-mono text-[10px] text-neon font-bold">
                    {i + 1}
                  </span>
                  <span className="font-mono text-[11px] text-text-dim leading-relaxed">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Connect Screen ────────────────────────────────────────────
function ConnectScreen({ onConnect, loading }: { onConnect: (id: string) => void; loading: boolean }) {
  const [callId, setCallId] = useState('');
  const [focused, setFocused] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden bg-bg">
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none animate-grid-fade"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,255,135,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,135,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Radial glow */}
      <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none bg-[radial-gradient(ellipse,rgba(0,255,135,0.08)_0%,transparent_70%)]" />

      <div className="w-full max-w-md flex flex-col gap-10 relative z-10 animate-fade-up">
        {/* Logo */}
        <div className="text-center">
          <div className="mb-2 text-[40px] animate-float">🏋️</div>
          <h1 className="font-display text-neon leading-none tracking-[0.08em] text-[clamp(56px,14vw,88px)] drop-shadow-[0_0_48px_rgba(0,255,135,0.35)]">
            FITAGENT
          </h1>
          <p className="mt-2 font-mono text-[11px] tracking-[0.3em] text-text-dim">REAL-TIME AI PERSONAL TRAINER</p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(({ icon, label, desc }) => (
            <div
              key={label}
              className="rounded-lg p-4 bg-bg2 border border-border transition-all duration-300 hover:border-neon/30"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{icon}</span>
                <span className="font-mono text-sm font-bold tracking-[0.06em] text-neon">{label}</span>
              </div>
              <p className="font-mono text-xs leading-relaxed text-text-dim">{desc}</p>
            </div>
          ))}
        </div>

        {/* Input + CTA */}
        <div className="flex flex-col gap-3">
          <input
            value={callId}
            onChange={(e) => setCallId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && onConnect(callId || `fit-${Date.now()}`)}
            placeholder="Enter Session ID (or leave blank)"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`w-full rounded-lg outline-none transition-all duration-200 bg-bg2 py-4 px-5 font-mono text-[13px] text-text-bright ${
              focused ? 'border border-neon shadow-[0_0_0_3px_rgba(0,255,135,0.08)]' : 'border border-border'
            }`}
          />
          <button
            onClick={() => !loading && onConnect(callId || `fit-${Date.now()}`)}
            disabled={loading}
            className={`w-full rounded-lg cursor-pointer transition-all duration-200 py-4 px-6 font-display text-xl tracking-[0.1em] flex items-center justify-center gap-2.5 ${
              loading
                ? 'bg-bg3 text-text-dim border-none'
                : 'bg-neon text-black border-none shadow-[0_0_24px_rgba(0,255,135,0.5)] hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {loading ? (
              <>
                <Spinner size={18} /> CONNECTING...
              </>
            ) : (
              'START TRAINING'
            )}
          </button>
        </div>

        <p className="text-center font-mono text-[10px] text-text-dim leading-relaxed">
          Powered by Stream Vision Agents SDK · Gemini · YOLO11
        </p>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>('connect');
  const [callId, setCallId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [feedback, setFeedback] = useState('');
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<ReturnType<StreamVideoClient['call']> | null>(null);
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (feedbackRef.current) clearTimeout(feedbackRef.current);
    feedbackRef.current = setTimeout(() => setFeedback(''), 4000);
  }, []);

  const handleConnect = useCallback(
    async (id: string) => {
      if (connecting) return;
      setConnecting(true);
      try {
        const userId = 'athlete_' + Math.floor(Math.random() * 1000000);
        const tokenRes = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.token) throw new Error('Failed to get auth token');

        const videoClient = new StreamVideoClient({
          apiKey: STREAM_API_KEY,
          user: { id: userId, name: 'Athlete', image: '' },
          token: tokenData.token,
        });

        const myCall = videoClient.call('default', id);
        await myCall.join({ create: true });

        // Enable camera and microphone
        await myCall.camera.enable();
        await myCall.microphone.enable();

        setClient(videoClient);
        setCall(myCall);
        setCallId(id);
        setScreen('workout');
        showFeedback('Connected! Now summon your AI coach 💪');
      } catch (err) {
        console.error('Connection error:', err);
        showFeedback('Connection failed — check your API keys');
      } finally {
        setConnecting(false);
      }
    },
    [connecting, showFeedback],
  );

  const handleSummonAgent = useCallback(async () => {
    if (agentState === 'summoning' || agentState === 'active') return;
    setAgentState('summoning');
    showFeedback('Summoning AI coach...');
    try {
      const res = await fetch(`${AGENT_BACKEND_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId, call_type: 'default' }),
      });
      if (res.ok) {
        setAgentState('active');
        showFeedback('AI Coach joined! Get into position 🏋️');
      } else {
        setAgentState('failed');
        showFeedback('Agent failed — is backend running?');
      }
    } catch {
      setAgentState('failed');
      showFeedback(`Cannot reach backend at ${AGENT_BACKEND_URL}`);
    }
  }, [agentState, callId, showFeedback]);

  const handleEndSession = useCallback(() => {
    call?.leave().catch(() => {});
    client?.disconnectUser().catch(() => {});
    setCall(null);
    setClient(null);
    setScreen('connect');
    setAgentState('idle');
    setFeedback('');
  }, [call, client]);

  useEffect(
    () => () => {
      if (feedbackRef.current) clearTimeout(feedbackRef.current);
    },
    [],
  );

  if (screen === 'connect') return <ConnectScreen onConnect={handleConnect} loading={connecting} />;

  if (!client || !call) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <WorkoutView
          agentState={agentState}
          feedback={feedback}
          onSummonAgent={handleSummonAgent}
          onEndSession={handleEndSession}
          callId={callId}
        />
      </StreamCall>
    </StreamVideo>
  );
}
