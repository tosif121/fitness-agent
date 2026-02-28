'use client';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  SpeakerLayout,
  useCallStateHooks,
  useCall,
} from '@stream-io/video-react-sdk';
import { Mic, MicOff, Video, VideoOff, MonitorUp, Settings, PhoneOff, ScreenShare, ScreenShareOff } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   FitAgent — Real-Time AI Fitness Coach
   Stream Video SDK · Tailwind v4 · Real backend integration
───────────────────────────────────────────────────────────── */

const STREAM_API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY || '';
const AGENT_BACKEND_URL = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || 'http://localhost:8000';
const REP_SERVER_URL = 'http://localhost:8001';

type Screen = 'connect' | 'workout' | 'summary';
type AgentState = 'idle' | 'summoning' | 'active' | 'failed';

interface ExerciseInfo {
  id: string;
  name: string;
  icon: string;
  targetReps: number;
  tips: string;
}

interface ExerciseTracker {
  exercise: ExerciseInfo;
  reps: number;
  sets: number;
  formScore: number;
  startedAt: number;
}

interface SessionSummary {
  duration: number;
  callId: string;
  agentWasActive: boolean;
  exercises: {
    name: string;
    reps: number;
    sets: number;
    formScore: number;
    feedback: string;
  }[];
}

const EXERCISE_CATALOG: ExerciseInfo[] = [
  { id: 'squats', name: 'Squats', icon: '🦵', targetReps: 12, tips: 'Keep knees tracking over toes, chest up.' },
  { id: 'pushups', name: 'Push-Ups', icon: '💪', targetReps: 15, tips: 'Lower chest close to ground, full ROM.' },
  { id: 'lunges', name: 'Lunges', icon: '🏃', targetReps: 10, tips: 'Maintain upright torso, 90° knee angle.' },
  {
    id: 'jumping_jacks',
    name: 'Jumping Jacks',
    icon: '🤸',
    targetReps: 20,
    tips: 'Full extension, keep a steady tempo.',
  },
  { id: 'plank', name: 'Plank Hold', icon: '🧘', targetReps: 30, tips: 'Keep hips level, engage core throughout.' },
  { id: 'burpees', name: 'Burpees', icon: '🔥', targetReps: 8, tips: 'Explosive jump, chest to floor each rep.' },
  {
    id: 'mountain_climbers',
    name: 'Mountain Climbers',
    icon: '⛰️',
    targetReps: 20,
    tips: 'Keep hips low, alternate knees to chest.',
  },
  { id: 'bicep_curls', name: 'Bicep Curls', icon: '🏋️', targetReps: 12, tips: 'Control the negative, no swinging.' },
];

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

// ── Session Timer ─────────────────────────────────────────────
function SessionTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  const mins = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0');
  const secs = (elapsed % 60).toString().padStart(2, '0');
  return (
    <span className="font-mono text-[11px] text-neon tabular-nums">
      {mins}:{secs}
    </span>
  );
}

// ── Custom Call Controls (Lucide icons) ───────────────────────
function CustomCallControls({ onEndSession }: { onEndSession: () => void }) {
  const { useMicrophoneState, useCameraState, useScreenShareState } = useCallStateHooks();
  const { microphone, isMute: micMuted } = useMicrophoneState();
  const { camera, isMute: camMuted } = useCameraState();
  const { screenShare, isMute: screenMuted } = useScreenShareState();

  const btnBase =
    'w-12 h-12 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 border';
  const btnNormal = `${btnBase} bg-bg3 border-border text-text-bright hover:border-neon/50 hover:text-neon hover:shadow-[0_0_12px_rgba(0,255,135,0.15)]`;
  const btnMuted = `${btnBase} bg-red/10 border-red/40 text-red hover:bg-red/20`;
  const btnEnd = `${btnBase} bg-red/20 border-red/50 text-red hover:bg-red hover:text-white hover:shadow-[0_0_20px_rgba(255,0,0,0.3)] w-14`;

  return (
    <div className="rounded-xl bg-bg2 border border-border p-3 flex items-center justify-center gap-2.5">
      {/* Mic toggle */}
      <button
        onClick={() => microphone.toggle()}
        className={micMuted ? btnMuted : btnNormal}
        title={micMuted ? 'Unmute Mic' : 'Mute Mic'}
      >
        {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>

      {/* Camera toggle */}
      <button
        onClick={() => camera.toggle()}
        className={camMuted ? btnMuted : btnNormal}
        title={camMuted ? 'Turn On Camera' : 'Turn Off Camera'}
      >
        {camMuted ? <VideoOff size={20} /> : <Video size={20} />}
      </button>

      {/* Screen share */}
      <button
        onClick={() => screenShare.toggle()}
        className={!screenMuted ? `${btnBase} bg-neon/10 border-neon/40 text-neon` : btnNormal}
        title={!screenMuted ? 'Stop Sharing' : 'Share Screen'}
      >
        {!screenMuted ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
      </button>

      {/* Settings placeholder */}
      <button className={btnNormal} title="Settings">
        <Settings size={20} />
      </button>

      {/* Divider */}
      <div className="w-px h-8 bg-border mx-1" />

      {/* End call */}
      <button onClick={onEndSession} className={btnEnd} title="End Session">
        <PhoneOff size={20} />
      </button>
    </div>
  );
}

// ── Summary Modal ─────────────────────────────────────────────
function SummaryModal({ summary, onClose }: { summary: SessionSummary; onClose: () => void }) {
  const mins = Math.floor(summary.duration / 60);
  const secs = summary.duration % 60;
  const totalReps = summary.exercises.reduce((s, e) => s + e.reps, 0);
  const totalSets = summary.exercises.reduce((s, e) => s + e.sets, 0);
  const avgForm = summary.exercises.length
    ? Math.round(summary.exercises.reduce((s, e) => s + e.formScore, 0) / summary.exercises.length)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-up">
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-bg2 border border-border shadow-[0_0_80px_rgba(0,255,135,0.1)] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border text-center">
          <div className="text-4xl mb-2">🏆</div>
          <h2 className="font-display text-3xl tracking-[0.1em] text-neon">SESSION COMPLETE</h2>
          <p className="mt-1 font-mono text-[11px] text-text-dim tracking-[0.2em]">
            {mins}m {secs}s · {summary.callId}
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 border-b border-border">
          {[
            { label: 'TOTAL REPS', value: totalReps, icon: '🔢' },
            { label: 'TOTAL SETS', value: totalSets, icon: '📊' },
            { label: 'FORM SCORE', value: `${avgForm}%`, icon: '⚡' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex flex-col items-center py-5 border-r border-border last:border-r-0">
              <span className="text-xl mb-1">{icon}</span>
              <span className="font-display text-2xl text-neon">{value}</span>
              <span className="font-mono text-[9px] tracking-[0.15em] text-text-dim mt-1">{label}</span>
            </div>
          ))}
        </div>

        {/* Exercise Breakdown */}
        <div className="p-5 max-h-[280px] overflow-y-auto">
          <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-text-dim">EXERCISE BREAKDOWN</p>
          <div className="flex flex-col gap-2.5">
            {summary.exercises.map((ex, i) => (
              <div key={i} className="rounded-lg p-3.5 bg-bg3 border border-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-sm font-bold text-text-bright">{ex.name}</span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      ex.formScore >= 80 ? 'text-neon' : ex.formScore >= 60 ? 'text-yellow' : 'text-red'
                    }`}
                  >
                    {ex.formScore}% form
                  </span>
                </div>
                <div className="flex gap-4 mb-1.5">
                  <span className="font-mono text-[11px] text-text-dim">
                    <span className="text-neon">{ex.reps}</span> reps
                  </span>
                  <span className="font-mono text-[11px] text-text-dim">
                    <span className="text-neon">{ex.sets}</span> sets
                  </span>
                </div>
                {/* Form score bar */}
                <div className="w-full h-1.5 rounded-full bg-bg overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      ex.formScore >= 80 ? 'bg-neon' : ex.formScore >= 60 ? 'bg-yellow' : 'bg-red'
                    }`}
                    style={{ width: `${ex.formScore}%` }}
                  />
                </div>
                <p className="mt-2 font-mono text-[10px] text-text-dim leading-relaxed">💡 {ex.feedback}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border">
          <button
            onClick={onClose}
            className="w-full rounded-lg cursor-pointer transition-all duration-200 py-3.5 font-display text-lg tracking-[0.1em] bg-neon text-black shadow-[0_0_20px_rgba(0,255,135,0.4)] hover:scale-[1.02] active:scale-[0.98]"
          >
            NEW SESSION
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rep Counter HUD (overlaid on video) ───────────────────
function RepCounterHUD({
  tracker,
  onAddRep,
  onRemoveRep,
  onNextSet,
}: {
  tracker: ExerciseTracker;
  onAddRep: () => void;
  onRemoveRep: () => void;
  onNextSet: () => void;
}) {
  const progress = Math.min((tracker.reps / tracker.exercise.targetReps) * 100, 100);
  return (
    <div className="absolute bottom-14 left-3.5 right-3.5 z-[6] flex items-end justify-between gap-3 pointer-events-auto">
      {/* Rep counter card */}
      <div className="rounded-lg bg-black/85 backdrop-blur-sm border border-neon/40 px-4 py-3 shadow-[0_0_20px_rgba(0,255,135,0.2)]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-lg">{tracker.exercise.icon}</span>
          <span className="font-mono text-xs font-bold text-neon tracking-wide">
            {tracker.exercise.name.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRemoveRep}
            className="w-7 h-7 rounded bg-bg3 border border-border text-text-dim font-mono text-sm flex items-center justify-center cursor-pointer hover:border-neon/50 hover:text-neon transition-colors"
          >
            −
          </button>
          <div className="text-center">
            <span className="font-display text-4xl text-neon tabular-nums leading-none">{tracker.reps}</span>
            <span className="font-mono text-[10px] text-text-dim block">/{tracker.exercise.targetReps} reps</span>
          </div>
          <button
            onClick={onAddRep}
            className="w-7 h-7 rounded bg-neon/20 border border-neon/50 text-neon font-mono text-sm flex items-center justify-center cursor-pointer hover:bg-neon/30 transition-colors"
          >
            +
          </button>
        </div>
        {/* Progress bar */}
        <div className="mt-2 w-full h-1 rounded-full bg-bg overflow-hidden">
          <div className="h-full rounded-full bg-neon transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Set & form info */}
      <div className="flex flex-col items-end gap-2">
        <div className="rounded-lg bg-black/85 backdrop-blur-sm border border-border px-3 py-2 text-center">
          <span className="font-display text-2xl text-neon tabular-nums leading-none">{tracker.sets}</span>
          <span className="font-mono text-[9px] text-text-dim block mt-0.5">SETS</span>
        </div>
        <button
          onClick={onNextSet}
          className="rounded bg-neon/20 border border-neon/50 text-neon font-mono text-[10px] tracking-wide px-2.5 py-1 cursor-pointer hover:bg-neon/30 transition-colors"
        >
          NEXT SET ↵
        </button>
        <div className="rounded-lg bg-black/85 backdrop-blur-sm border border-border px-3 py-2 text-center">
          <span
            className={`font-display text-lg tabular-nums leading-none ${tracker.formScore >= 80 ? 'text-neon' : tracker.formScore >= 60 ? 'text-yellow' : 'text-red'}`}
          >
            {tracker.formScore}%
          </span>
          <span className="font-mono text-[9px] text-text-dim block mt-0.5">FORM</span>
        </div>
      </div>
    </div>
  );
}

// ── Exercise Selector (sidebar panel) ─────────────────────
function ExerciseSelector({
  selectedExercises,
  activeExerciseId,
  trackers,
  onToggleExercise,
  onSetActive,
}: {
  selectedExercises: string[];
  activeExerciseId: string | null;
  trackers: Map<string, ExerciseTracker>;
  onToggleExercise: (id: string) => void;
  onSetActive: (id: string) => void;
}) {
  return (
    <div className="rounded-xl p-4 bg-bg2 border border-border">
      <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-text-dim">SELECT EXERCISES</p>
      <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
        {EXERCISE_CATALOG.map((ex) => {
          const isSelected = selectedExercises.includes(ex.id);
          const isActive = activeExerciseId === ex.id;
          const tracker = trackers.get(ex.id);
          return (
            <div
              key={ex.id}
              className={`flex items-center gap-2.5 rounded-lg p-2.5 cursor-pointer transition-all duration-200 border ${
                isActive
                  ? 'bg-neon/10 border-neon/50'
                  : isSelected
                    ? 'bg-bg3 border-neon/20'
                    : 'bg-bg3 border-transparent hover:border-border'
              }`}
              onClick={() => {
                if (!isSelected) {
                  onToggleExercise(ex.id);
                }
                onSetActive(ex.id);
              }}
            >
              <span className="text-lg shrink-0">{ex.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono text-[11px] font-bold ${isActive ? 'text-neon' : isSelected ? 'text-text-bright' : 'text-text-dim'}`}
                  >
                    {ex.name}
                  </span>
                  {tracker && tracker.reps > 0 && (
                    <span className="font-mono text-[10px] text-neon">
                      {tracker.reps}r · {tracker.sets}s
                    </span>
                  )}
                </div>
                <span className="font-mono text-[9px] text-text-dim">{ex.targetReps} reps target</span>
              </div>
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'border-neon bg-neon/20' : 'border-border'
                }`}
              >
                {isSelected && <span className="text-neon text-[10px]">✓</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Exercise Countdown Overlay ────────────────────────────────
function ExerciseCountdown({
  exercise,
  onComplete,
  onCancel,
}: {
  exercise: ExerciseInfo;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState(3);
  const [phase, setPhase] = useState<'countdown' | 'go'>('countdown');

  useEffect(() => {
    if (phase === 'countdown') {
      if (count > 0) {
        const timer = setTimeout(() => setCount(count - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setPhase('go');
      }
    } else {
      const timer = setTimeout(onComplete, 1000);
      return () => clearTimeout(timer);
    }
  }, [count, phase, onComplete]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-xl">
      <div className="text-center">
        {/* Exercise icon */}
        <div className="text-[64px] mb-3 animate-float">{exercise.icon}</div>

        {/* Exercise name */}
        <h2 className="font-display text-3xl tracking-[0.12em] text-neon mb-1">{exercise.name.toUpperCase()}</h2>

        {/* Instructions */}
        <p className="font-mono text-[12px] text-text-dim mb-2">
          Target: <span className="text-neon">{exercise.targetReps} reps</span>
        </p>
        <p className="font-mono text-[11px] text-text-dim/80 max-w-[260px] mx-auto mb-8">💡 {exercise.tips}</p>

        {/* Countdown / GO */}
        {phase === 'countdown' ? (
          <div className="relative">
            <div
              key={count}
              className="text-[140px] font-display text-neon leading-none drop-shadow-[0_0_60px_rgba(0,255,135,0.6)] animate-countdown-pop"
            >
              {count}
            </div>
            <p className="font-mono text-[11px] text-text-dim mt-4 tracking-[0.2em]">GET IN POSITION</p>
          </div>
        ) : (
          <div className="text-[100px] font-display text-neon leading-none drop-shadow-[0_0_80px_rgba(0,255,135,0.8)] animate-countdown-pop">
            GO!
          </div>
        )}

        {/* Cancel button */}
        {phase === 'countdown' && (
          <button
            onClick={onCancel}
            className="mt-8 font-mono text-[11px] text-text-dim/60 hover:text-red cursor-pointer transition-colors tracking-wider"
          >
            CANCEL
          </button>
        )}
      </div>
    </div>
  );
}

// ── Workout Screen (inside StreamCall) ────────────────────
function WorkoutView({
  agentState,
  feedback,
  onSummonAgent,
  onEndSession,
  callId,
  sessionStart,
  selectedExercises,
  activeExerciseId,
  trackers,
  onToggleExercise,
  onSetActiveExercise,
  onAddRep,
  onRemoveRep,
  onNextSet,
  countdownExercise,
  onCountdownComplete,
  onCountdownCancel,
}: {
  agentState: AgentState;
  feedback: string;
  onSummonAgent: () => void;
  onEndSession: () => void;
  callId: string;
  sessionStart: number;
  selectedExercises: string[];
  activeExerciseId: string | null;
  trackers: Map<string, ExerciseTracker>;
  onToggleExercise: (id: string) => void;
  onSetActiveExercise: (id: string) => void;
  onAddRep: () => void;
  onRemoveRep: () => void;
  onNextSet: () => void;
  countdownExercise: ExerciseInfo | null;
  onCountdownComplete: () => void;
  onCountdownCancel: () => void;
}) {
  const activeTracker = activeExerciseId ? trackers.get(activeExerciseId) : null;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg2">
        <span className="font-display text-2xl tracking-widest text-neon">FITAGENT</span>
        <div className="flex items-center gap-4">
          <ParticipantInfo />
          <SessionTimer startTime={sessionStart} />
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-dim">
            <div
              className={`w-2 h-2 rounded-full ${agentState === 'active' ? 'bg-neon animate-blink-fast' : 'bg-yellow'}`}
            />
            {agentState === 'active' ? 'AGENT ACTIVE' : agentState === 'summoning' ? 'CONNECTING...' : 'AGENT IDLE'}
          </div>
          <button
            onClick={onEndSession}
            className="rounded cursor-pointer transition-colors duration-200 font-mono text-[11px] bg-bg3 border border-border text-text-dim px-3.5 py-1.5 hover:border-red/50 hover:text-red"
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
            className={`relative w-full aspect-4/3 rounded-xl overflow-hidden bg-bg2 border border-border ${agentState === 'active' ? 'animate-glow-pulse' : ''}`}
          >
            <div className="absolute inset-0">
              <SpeakerLayout />
            </div>
            <HUDCorners />
            <ScanLine />

            {/* Exercise tag */}
            <div className="absolute top-3.5 left-3.5 rounded bg-black/75 border border-neon px-2.5 py-1 font-display text-[13px] tracking-[0.15em] text-neon z-[5]">
              {activeTracker
                ? `${activeTracker.exercise.icon} ${activeTracker.exercise.name.toUpperCase()}`
                : agentState === 'active'
                  ? 'AI COACHING'
                  : 'CAMERA FEED'}
            </div>

            {/* LIVE badge */}
            <div className="absolute top-3.5 right-3.5 rounded-sm bg-red font-bold text-white px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] z-[5] animate-blink">
              ● LIVE
            </div>

            {/* Exercise Countdown Overlay */}
            {countdownExercise && (
              <ExerciseCountdown
                exercise={countdownExercise}
                onComplete={onCountdownComplete}
                onCancel={onCountdownCancel}
              />
            )}

            {/* Rep Counter HUD */}
            {activeTracker && !countdownExercise && (
              <RepCounterHUD
                tracker={activeTracker}
                onAddRep={onAddRep}
                onRemoveRep={onRemoveRep}
                onNextSet={onNextSet}
              />
            )}

            <FeedbackToast message={feedback} />
          </div>

          {/* Call Controls */}
          <CustomCallControls onEndSession={onEndSession} />

          {/* Summon Agent */}
          <button
            onClick={onSummonAgent}
            disabled={agentState === 'summoning' || agentState === 'active'}
            className={`w-full rounded-lg transition-all duration-200 p-3.5 font-display text-lg tracking-widest flex items-center justify-center gap-2.5 ${
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
        <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-80px)]">
          {/* Session Info */}
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
                <span className="font-mono text-[11px] text-text-dim">Duration</span>
                <SessionTimer startTime={sessionStart} />
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[11px] text-text-dim">Exercises</span>
                <span className="font-mono text-[11px] text-neon">{selectedExercises.length} selected</span>
              </div>
            </div>
          </div>

          {/* Exercise Selector */}
          <ExerciseSelector
            selectedExercises={selectedExercises}
            activeExerciseId={activeExerciseId}
            trackers={trackers}
            onToggleExercise={onToggleExercise}
            onSetActive={onSetActiveExercise}
          />

          {/* Agent Status */}
          <AgentStatusPanel agentState={agentState} />
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
  const [sessionStart, setSessionStart] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Exercise tracking state
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [trackers, setTrackers] = useState<Map<string, ExerciseTracker>>(new Map());
  const [countdownExercise, setCountdownExercise] = useState<ExerciseInfo | null>(null);
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (feedbackRef.current) clearTimeout(feedbackRef.current);
    feedbackRef.current = setTimeout(() => setFeedback(''), 4000);
  }, []);

  // Reset all session data for a fresh start
  const resetSession = useCallback(() => {
    setSelectedExercises([]);
    setActiveExerciseId(null);
    setTrackers(new Map());
    setSummary(null);
    setAgentState('idle');
    setCountdownExercise(null);
    setPendingExerciseId(null);
    setFeedback('');
    setCallId('');
    setSessionStart(0);
  }, []);

  const handleToggleExercise = useCallback(
    (exerciseId: string) => {
      setSelectedExercises((prev) => {
        if (prev.includes(exerciseId)) {
          // Deselect: remove tracker too
          setTrackers((t) => {
            const next = new Map(t);
            next.delete(exerciseId);
            return next;
          });
          if (activeExerciseId === exerciseId) setActiveExerciseId(null);
          return prev.filter((id) => id !== exerciseId);
        }
        // Select: create tracker
        const info = EXERCISE_CATALOG.find((e) => e.id === exerciseId)!;
        setTrackers((t) => {
          const next = new Map(t);
          if (!next.has(exerciseId)) {
            next.set(exerciseId, { exercise: info, reps: 0, sets: 1, formScore: 0, startedAt: Date.now() });
          }
          return next;
        });
        return [...prev, exerciseId];
      });
    },
    [activeExerciseId],
  );

  const handleSetActiveExercise = useCallback(
    (exerciseId: string) => {
      // If already active, skip countdown
      if (activeExerciseId === exerciseId) return;

      // Ensure it's selected first
      setSelectedExercises((prev) => {
        if (!prev.includes(exerciseId)) {
          const info = EXERCISE_CATALOG.find((e) => e.id === exerciseId)!;
          setTrackers((t) => {
            const next = new Map(t);
            if (!next.has(exerciseId)) {
              next.set(exerciseId, { exercise: info, reps: 0, sets: 1, formScore: 0, startedAt: Date.now() });
            }
            return next;
          });
          return [...prev, exerciseId];
        }
        return prev;
      });

      // Start countdown
      const info = EXERCISE_CATALOG.find((e) => e.id === exerciseId)!;
      setPendingExerciseId(exerciseId);
      setCountdownExercise(info);
    },
    [activeExerciseId],
  );

  const handleCountdownComplete = useCallback(() => {
    if (pendingExerciseId) {
      setActiveExerciseId(pendingExerciseId);
      showFeedback('GO! Start your reps! 💪');
    }
    setCountdownExercise(null);
    setPendingExerciseId(null);
  }, [pendingExerciseId, showFeedback]);

  const handleCountdownCancel = useCallback(() => {
    setCountdownExercise(null);
    setPendingExerciseId(null);
  }, []);

  const handleAddRep = useCallback(() => {
    if (!activeExerciseId) return;
    setTrackers((prev) => {
      const next = new Map(prev);
      const t = next.get(activeExerciseId);
      if (t) {
        // Simulate form score fluctuation (70-98%)
        const newScore = Math.min(98, Math.max(70, t.formScore + Math.floor(Math.random() * 11) - 3));
        next.set(activeExerciseId, {
          ...t,
          reps: t.reps + 1,
          formScore: t.formScore === 0 ? 82 + Math.floor(Math.random() * 15) : newScore,
        });
      }
      return next;
    });
  }, [activeExerciseId]);

  const handleRemoveRep = useCallback(() => {
    if (!activeExerciseId) return;
    setTrackers((prev) => {
      const next = new Map(prev);
      const t = next.get(activeExerciseId);
      if (t && t.reps > 0) next.set(activeExerciseId, { ...t, reps: t.reps - 1 });
      return next;
    });
  }, [activeExerciseId]);

  const handleNextSet = useCallback(() => {
    if (!activeExerciseId) return;
    setTrackers((prev) => {
      const next = new Map(prev);
      const t = next.get(activeExerciseId);
      if (t) next.set(activeExerciseId, { ...t, sets: t.sets + 1, reps: 0 });
      return next;
    });
    showFeedback('New set started! 💪');
  }, [activeExerciseId, showFeedback]);

  const handleConnect = useCallback(
    async (id: string) => {
      if (connecting) return;
      setConnecting(true);

      // Reset old session data
      resetSession();

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
        setSessionStart(Date.now());
        setScreen('workout');
        showFeedback('Connected! Select exercises & summon your AI coach 💪');
      } catch (err) {
        console.error('Connection error:', err);
        showFeedback('Connection failed — check your API keys');
      } finally {
        setConnecting(false);
      }
    },
    [connecting, showFeedback, resetSession],
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
        showFeedback('AI Coach joined! Select an exercise & start training 🏋️');
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
    const duration = Math.floor((Date.now() - sessionStart) / 1000);

    // Build summary from real tracked exercise data
    const exerciseSummaries = Array.from(trackers.values())
      .filter((t) => t.reps > 0 || t.sets > 1)
      .map((t) => ({
        name: `${t.exercise.icon} ${t.exercise.name}`,
        reps: t.reps,
        sets: t.sets,
        formScore: t.formScore,
        feedback: t.exercise.tips,
      }));

    const sessionSummary: SessionSummary = {
      duration,
      callId,
      agentWasActive: agentState === 'active',
      exercises:
        exerciseSummaries.length > 0
          ? exerciseSummaries
          : [
              {
                name: 'No exercises tracked',
                reps: 0,
                sets: 0,
                formScore: 0,
                feedback: 'Select exercises and start working out next time.',
              },
            ],
    };

    // Notify backend to stop the agent (prevents Gemini memory overflow)
    if (callId) {
      fetch(`${AGENT_BACKEND_URL}/sessions/${callId}`, { method: 'DELETE' }).catch(() => {});
    }

    // Leave the call
    call?.leave().catch(() => {});
    client?.disconnectUser().catch(() => {});
    setCall(null);
    setClient(null);

    setSummary(sessionSummary);
    setScreen('summary');
    setAgentState('idle');
    setFeedback('');
  }, [call, client, sessionStart, agentState, callId, trackers]);

  const handleCloseSummary = useCallback(() => {
    resetSession();
    setScreen('connect');
  }, [resetSession]);

  // Poll backend for rep updates from Gemini tool calls
  useEffect(() => {
    if (agentState !== 'active' || !callId) return;

    let mounted = true;

    const pollReps = async () => {
      try {
        const res = await fetch(`${REP_SERVER_URL}/${callId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!mounted) return;

        if (data && data.exercise) {
          const exerciseId = data.exercise.replace('_', '-');

          setTrackers((prev) => {
            const next = new Map(prev);
            const currentTracker = next.get(exerciseId);

            // Only update if the rep/set counts actually changed
            if (currentTracker) {
              if (
                currentTracker.reps !== data.reps ||
                currentTracker.sets !== data.sets ||
                currentTracker.formScore !== data.form_score
              ) {
                next.set(exerciseId, {
                  ...currentTracker,
                  reps: data.reps,
                  sets: data.sets,
                  formScore: data.form_score || currentTracker.formScore,
                });

                // Show feedback if provided on new rep
                if (data.feedback && data.reps > currentTracker.reps) {
                  showFeedback(data.feedback);
                } else if (data.sets > currentTracker.sets) {
                  showFeedback(`Set ${currentTracker.sets} complete! Great job!`);
                }

                return next;
              }
            } else if (data.reps > 0 || data.sets > 1) {
              // Auto-detect: if AI detects an exercise we never selected!
              const info = EXERCISE_CATALOG.find((e) => e.id === exerciseId);
              if (info) {
                next.set(exerciseId, {
                  exercise: info,
                  reps: data.reps,
                  sets: data.sets,
                  formScore: data.form_score || 85,
                  startedAt: Date.now(),
                });

                // Auto-select and auto-activate
                setSelectedExercises((prevSel) => (prevSel.includes(exerciseId) ? prevSel : [...prevSel, exerciseId]));
                setActiveExerciseId(exerciseId);

                // Show detection feedback
                setTimeout(() => showFeedback(`AI found you doing ${info.name}! 🙌`), 0);

                return next;
              }
            }
            return prev;
          });
        }
      } catch (e) {
        // Silently ignore connection errors during polling
      }
    };

    const intervalId = setInterval(pollReps, 1500); // Check every 1.5 seconds

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [agentState, callId, showFeedback]);

  useEffect(
    () => () => {
      if (feedbackRef.current) clearTimeout(feedbackRef.current);
    },
    [],
  );

  if (screen === 'summary' && summary) {
    return (
      <div className="min-h-screen bg-bg">
        <SummaryModal summary={summary} onClose={handleCloseSummary} />
      </div>
    );
  }

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
          sessionStart={sessionStart}
          selectedExercises={selectedExercises}
          activeExerciseId={activeExerciseId}
          trackers={trackers}
          onToggleExercise={handleToggleExercise}
          onSetActiveExercise={handleSetActiveExercise}
          onAddRep={handleAddRep}
          onRemoveRep={handleRemoveRep}
          onNextSet={handleNextSet}
          countdownExercise={countdownExercise}
          onCountdownComplete={handleCountdownComplete}
          onCountdownCancel={handleCountdownCancel}
        />
      </StreamCall>
    </StreamVideo>
  );
}
