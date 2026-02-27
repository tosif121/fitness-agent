'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  StreamVideo,
  StreamCall,
  StreamVideoClient,
  useCallStateHooks,
  ParticipantView,
  useCall,
} from '@stream-io/video-react-sdk';

/* ─────────────────────────────────────────────────────────────
   DESIGN: Dark industrial gym aesthetic
   - Deep black backgrounds with neon green accents (#00ff87)
   - Bebas Neue for display, JetBrains Mono for data
   - HUD-style overlays (military/sports broadcast feel)
   - Animated skeleton overlay on video feed
   - Live rep counter with pulse animation on each rep
───────────────────────────────────────────────────────────── */

// ── Google Fonts ──────────────────────────────────────────────
const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=Inter:wght@300;400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --neon: #00ff87;
      --neon-dim: rgba(0,255,135,0.15);
      --neon-glow: 0 0 20px rgba(0,255,135,0.5);
      --red: #ff3b5c;
      --yellow: #ffd60a;
      --bg: #0a0a0a;
      --bg2: #111111;
      --bg3: #1a1a1a;
      --border: rgba(255,255,255,0.08);
      --text: #f0f0f0;
      --text-dim: rgba(240,240,240,0.4);
      --font-display: 'Bebas Neue', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
      --font-body: 'Inter', sans-serif;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      overflow-x: hidden;
    }

    @keyframes repPulse {
      0%   { transform: scale(1); }
      30%  { transform: scale(1.35); color: var(--neon); text-shadow: var(--neon-glow); }
      100% { transform: scale(1); }
    }
    @keyframes scanLine {
      0%   { top: -2px; }
      100% { top: 100%; }
    }
    @keyframes blink {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.3; }
    }
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes skeletonDraw {
      from { stroke-dashoffset: 200; }
      to   { stroke-dashoffset: 0; }
    }
    @keyframes glowPulse {
      0%,100% { box-shadow: 0 0 12px rgba(0,255,135,0.3); }
      50%      { box-shadow: 0 0 28px rgba(0,255,135,0.7); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes errorFeedIn {
      from { opacity:0; transform: translateX(-8px); }
      to   { opacity:1; transform: translateX(0); }
    }
  `}</style>
);

// ── Constants ─────────────────────────────────────────────────
const EXERCISES = ['Squat', 'Push-Up', 'Lunge', 'Jumping Jack', 'Plank'];

const EXERCISE_ICONS: Record<string, string> = {
  Squat: '🦵',
  'Push-Up': '💪',
  Lunge: '🏃',
  'Jumping Jack': '🤸',
  Plank: '🪑',
};

// Skeleton keypoint connections (COCO format)
const SKELETON_CONNECTIONS = [
  [5, 6], // shoulders
  [5, 7],
  [7, 9], // left arm
  [6, 8],
  [8, 10], // right arm
  [5, 11],
  [6, 12], // torso sides
  [11, 12], // hips
  [11, 13],
  [13, 15], // left leg
  [12, 14],
  [14, 16], // right leg
];

// ── Mock pose keypoints (for demo without live YOLO) ──────────
function generateMockKeypoints(exercise: string, frame: number): number[][] {
  const t = frame * 0.05;
  const squat = Math.sin(t) * 0.5 + 0.5; // 0..1 squat depth

  const base = [
    [0.5, 0.12], // 0 nose
    [0.48, 0.1], // 1 left eye
    [0.52, 0.1], // 2 right eye
    [0.46, 0.11], // 3 left ear
    [0.54, 0.11], // 4 right ear
    [0.43, 0.22], // 5 left shoulder
    [0.57, 0.22], // 6 right shoulder
    [0.4, 0.34], // 7 left elbow
    [0.6, 0.34], // 8 right elbow
    [0.38, 0.45], // 9 left wrist
    [0.62, 0.45], // 10 right wrist
    [0.44, 0.45], // 11 left hip
    [0.56, 0.45], // 12 right hip
    [0.43, 0.62 + squat * 0.08], // 13 left knee
    [0.57, 0.62 + squat * 0.08], // 14 right knee
    [0.42, 0.82], // 15 left ankle
    [0.58, 0.82], // 16 right ankle
  ];

  // Exercise-specific modifications
  if (exercise === 'Push-Up') {
    return base.map(([x, y]) => [x, y * 0.5 + 0.25]);
  }
  if (exercise === 'Jumping Jack') {
    const spread = Math.abs(Math.sin(t)) * 0.12;
    return base.map(([x, y], i) => {
      if (i >= 15) return [x + (x > 0.5 ? spread : -spread), y];
      if (i >= 9 && i <= 10) return [x + (x > 0.5 ? spread : -spread), y - spread];
      return [x, y];
    });
  }
  return base;
}

// ── Skeleton SVG Overlay ──────────────────────────────────────
function SkeletonOverlay({ keypoints, width, height }: { keypoints: number[][]; width: number; height: number }) {
  if (!keypoints || keypoints.length === 0) return null;

  const pts = keypoints.map(([x, y]) => ({
    px: x * width,
    py: y * height,
  }));

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Connections */}
      {SKELETON_CONNECTIONS.map(([a, b], i) => {
        const pa = pts[a];
        const pb = pts[b];
        if (!pa || !pb) return null;
        return (
          <line
            key={i}
            x1={pa.px}
            y1={pa.py}
            x2={pb.px}
            y2={pb.py}
            stroke="rgba(0,255,135,0.75)"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ strokeDasharray: 200, animation: `skeletonDraw 0.4s ease forwards` }}
          />
        );
      })}
      {/* Keypoints */}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.px}
          cy={p.py}
          r={i === 0 ? 5 : 3.5}
          fill={i === 0 ? '#ffffff' : 'var(--neon)'}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

// ── Rep Counter Display ───────────────────────────────────────
function RepCounter({ reps, lastRep }: { reps: number; lastRep: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
      }}
    >
      <div
        key={reps}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(56px, 8vw, 96px)',
          color: 'var(--neon)',
          letterSpacing: '0.02em',
          animation: lastRep ? 'repPulse 0.4s ease' : 'none',
          textShadow: '0 0 30px rgba(0,255,135,0.4)',
        }}
      >
        {String(reps).padStart(2, '0')}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          letterSpacing: '0.2em',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          marginTop: '4px',
        }}
      >
        REPS
      </div>
    </div>
  );
}

// ── Form Score Arc ────────────────────────────────────────────
function FormScoreArc({ score }: { score: number }) {
  const r = 28;
  const cx = 36;
  const cy = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 80 ? 'var(--neon)' : score >= 60 ? 'var(--yellow)' : 'var(--red)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            transform: 'rotate(90deg)',
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          {score}
        </text>
      </svg>
      <span
        style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--text-dim)' }}
      >
        FORM
      </span>
    </div>
  );
}

// ── Live Feedback Toast ───────────────────────────────────────
function FeedbackToast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid var(--neon)',
        borderRadius: '6px',
        padding: '10px 20px',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        color: 'var(--neon)',
        whiteSpace: 'nowrap',
        zIndex: 10,
        animation: 'fadeSlideUp 0.3s ease',
        boxShadow: 'var(--neon-glow)',
      }}
    >
      ⚡ {message}
    </div>
  );
}

// ── Scan Line Effect ──────────────────────────────────────────
function ScanLine() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 3,
        borderRadius: 'inherit',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(transparent, rgba(0,255,135,0.15), transparent)',
          animation: 'scanLine 4s linear infinite',
        }}
      />
    </div>
  );
}

// ── HUD Corner Brackets ───────────────────────────────────────
function HUDCorners() {
  const corner = (pos: string) => {
    const [v, h] = pos.split('-');
    return (
      <div
        key={pos}
        style={{
          position: 'absolute',
          [v]: '8px',
          [h]: '8px',
          width: '20px',
          height: '20px',
          borderTop: v === 'top' ? '2px solid var(--neon)' : 'none',
          borderBottom: v === 'bottom' ? '2px solid var(--neon)' : 'none',
          borderLeft: h === 'left' ? '2px solid var(--neon)' : 'none',
          borderRight: h === 'right' ? '2px solid var(--neon)' : 'none',
          opacity: 0.7,
        }}
      />
    );
  };
  return <>{['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner)}</>;
}

// ── Exercise Pill Selector ─────────────────────────────────────
function ExerciseSelector({ current, onSelect }: { current: string; onSelect: (ex: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      {EXERCISES.map((ex) => (
        <button
          key={ex}
          onClick={() => onSelect(ex)}
          style={{
            background: current === ex ? 'var(--neon)' : 'var(--bg3)',
            color: current === ex ? '#000' : 'var(--text-dim)',
            border: `1px solid ${current === ex ? 'var(--neon)' : 'var(--border)'}`,
            borderRadius: '20px',
            padding: '6px 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: current === ex ? 700 : 400,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: current === ex ? 'var(--neon-glow)' : 'none',
          }}
        >
          {EXERCISE_ICONS[ex]} {ex.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ── Stats Row ─────────────────────────────────────────────────
function StatsRow({ sets, duration, totalReps }: { sets: number; duration: number; totalReps: number }) {
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const items = [
    { label: 'SETS', value: sets },
    { label: 'TIME', value: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` },
    { label: 'TOTAL', value: totalReps },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: '1px',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      {items.map(({ label, value }) => (
        <div
          key={label}
          style={{
            flex: 1,
            background: 'var(--bg3)',
            padding: '10px 8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '24px',
              color: 'var(--text)',
              letterSpacing: '0.03em',
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.2em',
              color: 'var(--text-dim)',
            }}
          >
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Form Errors Feed ──────────────────────────────────────────
function ErrorFeed({ errors }: { errors: string[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        maxHeight: '120px',
        overflowY: 'auto',
      }}
    >
      {errors.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--neon)', opacity: 0.6 }}>
          ✓ Form looks good
        </div>
      ) : (
        errors.slice(-4).map((err, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--yellow)',
              animation: 'errorFeedIn 0.3s ease',
            }}
          >
            <span style={{ color: 'var(--red)', fontSize: '8px' }}>▶</span>
            {err}
          </div>
        ))
      )}
    </div>
  );
}

// ── Video Panel (mock webcam feed) ───────────────────────────
function VideoPanel({ keypoints, exercise, isActive }: { keypoints: number[][]; exercise: string; isActive: boolean }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Request webcam
  useEffect(() => {
    if (!isActive) return;
    const constraints = { video: { width: 640, height: 480, facingMode: 'user' }, audio: false };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {}); // fallback to mock
  }, [isActive]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4/3',
        background: '#0d1117',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        animation: 'glowPulse 3s ease infinite',
      }}
    >
      {/* Webcam video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)', // mirror
          opacity: isActive ? 1 : 0,
        }}
      />

      {/* Placeholder when no camera */}
      {!isActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #0d1117 0%, #111820 100%)',
          }}
        >
          <div style={{ fontSize: '48px' }}>{EXERCISE_ICONS[exercise]}</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-dim)',
              letterSpacing: '0.1em',
            }}
          >
            CAMERA OFFLINE
          </div>
        </div>
      )}

      {/* Skeleton overlay */}
      <SkeletonOverlay keypoints={keypoints} width={640} height={480} />

      {/* HUD elements */}
      <HUDCorners />
      <ScanLine />

      {/* Exercise label top-left */}
      <div
        style={{
          position: 'absolute',
          top: '14px',
          left: '14px',
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid var(--neon)',
          borderRadius: '4px',
          padding: '4px 10px',
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          letterSpacing: '0.15em',
          color: 'var(--neon)',
          zIndex: 5,
        }}
      >
        {exercise.toUpperCase()}
      </div>

      {/* LIVE badge top-right */}
      <div
        style={{
          position: 'absolute',
          top: '14px',
          right: '14px',
          background: 'var(--red)',
          borderRadius: '3px',
          padding: '3px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.15em',
          zIndex: 5,
          animation: 'blink 2s ease infinite',
        }}
      >
        ● LIVE
      </div>
    </div>
  );
}

// ── Connect Screen ────────────────────────────────────────────
function ConnectScreen({ onConnect }: { onConnect: (id: string) => void }) {
  const [callId, setCallId] = useState('');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(0,255,135,0.06) 0%, var(--bg) 60%)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          animation: 'fadeSlideUp 0.6s ease',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(48px, 10vw, 72px)',
              letterSpacing: '0.08em',
              color: 'var(--neon)',
              textShadow: '0 0 40px rgba(0,255,135,0.3)',
              lineHeight: 1,
            }}
          >
            FITAGENT
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.3em',
              color: 'var(--text-dim)',
              marginTop: '8px',
            }}
          >
            REAL-TIME AI PERSONAL TRAINER
          </div>
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['YOLO Pose', 'Gemini Live', '<30ms Latency'].map((f) => (
            <span
              key={f}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                border: '1px solid var(--border)',
                borderRadius: '20px',
                padding: '4px 12px',
                color: 'var(--text-dim)',
                letterSpacing: '0.05em',
              }}
            >
              {f}
            </span>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            value={callId}
            onChange={(e) => setCallId(e.target.value)}
            placeholder="Enter Call ID (or leave blank for demo)"
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--text)',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--neon)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--border)';
            }}
          />
          <button
            onClick={() => onConnect(callId || 'demo-session')}
            style={{
              background: 'var(--neon)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '14px',
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: 'var(--neon-glow)',
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
              (e.target as HTMLButtonElement).style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
              (e.target as HTMLButtonElement).style.transform = 'scale(1)';
            }}
          >
            START TRAINING
          </button>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-dim)',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          Powered by Stream Vision Agents SDK
        </div>
      </div>
    </div>
  );
}

// ── Main App (with mock session for demo) ─────────────────────
export default function App() {
  const [screen, setScreen] = useState('connect'); // connect | workout | summary
  const [callId, setCallId] = useState('');

  // Workout state
  const [exercise, setExercise] = useState('Squat');
  const [reps, setReps] = useState(0);
  const [sets, setSets] = useState(0);
  const [totalReps, setTotalReps] = useState(0);
  const [formScore, setFormScore] = useState(100);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [isResting, setIsResting] = useState(false);
  const [restTimer, setRestTimer] = useState(60);
  const [duration, setDuration] = useState(0);
  const [lastRep, setLastRep] = useState(false);
  const [frame, setFrame] = useState(0);
  const [keypoints, setKeypoints] = useState<number[][]>([]);
  const [isActive, setIsActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const frameRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackTimer = useRef<NodeJS.Timeout | null>(null);

  // Simulate real-time pose + rep counting (replace with real SDK data)
  const simulateRep = useCallback(() => {
    setReps((r) => {
      const next = r + 1;
      setTotalReps((t) => t + 1);
      setLastRep(true);
      setTimeout(() => setLastRep(false), 500);

      // Milestone feedback
      if (next % 10 === 0) {
        showFeedback(`${next} reps — you're on fire! 🔥`);
      } else if (next % 5 === 0) {
        showFeedback(`That's ${next} — keep going!`);
      } else {
        const cues = ['Perfect depth!', 'Lock it out!', 'Beautiful form!', 'Stay tight!'];
        if (Math.random() < 0.4) showFeedback(cues[Math.floor(Math.random() * cues.length)]);
      }

      // Complete set at 10 reps
      if (next >= 10) {
        setSets((s) => s + 1);
        setIsResting(true);
        setRestTimer(60);
        showFeedback('Set complete! Rest 60 seconds 💪');
        return 0;
      }
      return next;
    });

    // Occasionally inject form error
    if (Math.random() < 0.25) {
      const errors: Record<string, string[]> = {
        Squat: ['Knees caving in — push them out!', 'Go deeper — hit parallel!'],
        'Push-Up': ["Don't sag your hips!", 'Full range — chest to floor!'],
        Lunge: ['Front knee over your toes!', 'Lower — back knee down!'],
        'Jumping Jack': ['Arms all the way up!', 'Feet wider on the jump!'],
        Plank: ['Squeeze your core!', "Don't hold your breath!"],
      };
      const pool = errors[exercise] || [];
      const err = pool[Math.floor(Math.random() * pool.length)];
      if (err) {
        setFormErrors((fe) => [...fe.slice(-8), err]);
        setFormScore((s) => Math.max(40, s - 5));
        showFeedback(err);
      }
    } else {
      setFormScore((s) => Math.min(100, s + 1));
    }
  }, [exercise]);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(''), 3000);
  };

  // Start session
  const handleConnect = (id: string) => {
    setCallId(id);
    setScreen('workout');
    setIsActive(true);

    // Duration timer
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

    // Animate skeleton frames
    frameRef.current = setInterval(() => setFrame((f) => f + 1), 80);

    showFeedback('FitAgent ready! Get into position 💪');
  };

  // Update keypoints from mock data
  useEffect(() => {
    setKeypoints(generateMockKeypoints(exercise, frame));
  }, [frame, exercise]);

  // Rest countdown
  useEffect(() => {
    if (!isResting) return;
    const t = setInterval(() => {
      setRestTimer((r) => {
        if (r <= 1) {
          setIsResting(false);
          clearInterval(t);
          showFeedback("Rest over — let's go again!");
          return 60;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isResting]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (frameRef.current) clearInterval(frameRef.current);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  if (screen === 'connect')
    return (
      <>
        <FontLoader />
        <ConnectScreen onConnect={handleConnect} />
      </>
    );

  const repsPerSet = 10;
  const progressPct = (reps / repsPerSet) * 100;

  return (
    <>
      <FontLoader />
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '24px',
              letterSpacing: '0.1em',
              color: 'var(--neon)',
            }}
          >
            FITAGENT
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-dim)',
              }}
            >
              <div
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: isActive ? 'var(--neon)' : 'var(--red)',
                  animation: isActive ? 'blink 1.5s infinite' : 'none',
                }}
              />
              {isActive ? 'AGENT ACTIVE' : 'DISCONNECTED'}
            </div>
            <button
              onClick={() => {
                setScreen('connect');
                setIsActive(false);
                if (timerRef.current) clearInterval(timerRef.current);
                if (frameRef.current) clearInterval(frameRef.current);
              }}
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '6px 14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >
              END SESSION
            </button>
          </div>
        </header>

        {/* Main Layout */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: '0',
            maxWidth: '1200px',
            width: '100%',
            margin: '0 auto',
            padding: '20px',
          }}
        >
          {/* Left: Video + Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Video */}
            <div style={{ position: 'relative' }}>
              <VideoPanel keypoints={keypoints} exercise={exercise} isActive={cameraOn} />
              <FeedbackToast message={feedback} />
            </div>

            {/* Rep progress bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.15em',
                  }}
                >
                  SET PROGRESS
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--neon)' }}>
                  {reps}/{repsPerSet}
                </span>
              </div>
              <div
                style={{
                  height: '4px',
                  background: 'var(--bg3)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPct}%`,
                    background: 'var(--neon)',
                    borderRadius: '2px',
                    boxShadow: '0 0 8px rgba(0,255,135,0.6)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            {/* Exercise Selector */}
            <ExerciseSelector
              current={exercise}
              onSelect={(ex) => {
                setExercise(ex);
                setReps(0);
                showFeedback(`Switching to ${ex} — get into position!`);
              }}
            />

            {/* Camera toggle + simulate rep (demo) */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setCameraOn((c) => !c)}
                style={{
                  flex: 1,
                  background: cameraOn ? 'rgba(0,255,135,0.1)' : 'var(--bg3)',
                  border: `1px solid ${cameraOn ? 'var(--neon)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  padding: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: cameraOn ? 'var(--neon)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                }}
              >
                📷 {cameraOn ? 'CAMERA ON' : 'ENABLE CAMERA'}
              </button>
              <button
                onClick={simulateRep}
                disabled={isResting}
                style={{
                  flex: 1,
                  background: isResting ? 'var(--bg3)' : 'var(--neon)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px',
                  fontFamily: 'var(--font-display)',
                  fontSize: '15px',
                  letterSpacing: '0.1em',
                  color: isResting ? 'var(--text-dim)' : '#000',
                  cursor: isResting ? 'not-allowed' : 'pointer',
                  boxShadow: isResting ? 'none' : 'var(--neon-glow)',
                }}
              >
                {isResting ? `⏱ REST ${restTimer}s` : '+ SIMULATE REP'}
              </button>
            </div>
          </div>

          {/* Right: Stats Panel */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              paddingLeft: '20px',
            }}
          >
            {/* Rep counter + form score */}
            <div
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
              }}
            >
              <RepCounter reps={reps} lastRep={lastRep} />
              <div style={{ width: '1px', height: '60px', background: 'var(--border)' }} />
              <FormScoreArc score={Math.round(formScore)} />
            </div>

            {/* Stats row */}
            <StatsRow sets={sets} duration={duration} totalReps={totalReps} />

            {/* Form feedback */}
            <div
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px',
                flex: 1,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.2em',
                  color: 'var(--text-dim)',
                  marginBottom: '12px',
                }}
              >
                FORM FEEDBACK
              </div>
              <ErrorFeed errors={formErrors} />
            </div>

            {/* Agent status */}
            <div
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.2em',
                  color: 'var(--text-dim)',
                  marginBottom: '12px',
                }}
              >
                AGENT STATUS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'YOLO Pose', status: 'RUNNING', ok: true },
                  { label: 'Gemini Live', status: 'LISTENING', ok: true },
                  { label: 'Deepgram STT', status: 'ACTIVE', ok: true },
                  { label: 'ElevenLabs TTS', status: 'READY', ok: true },
                ].map(({ label, status, ok }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                      {label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: ok ? 'var(--neon)' : 'var(--red)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span style={{ fontSize: '6px', animation: ok ? 'blink 2s infinite' : 'none' }}>●</span>
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* End + Summary */}
            <button
              onClick={() => setScreen('summary')}
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px',
                fontFamily: 'var(--font-display)',
                fontSize: '16px',
                letterSpacing: '0.1em',
                color: 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >
              VIEW SUMMARY
            </button>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      {screen === 'summary' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(8px)',
            padding: '24px',
          }}
        >
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--neon)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: 'var(--neon-glow)',
              animation: 'fadeSlideUp 0.4s ease',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '28px',
                letterSpacing: '0.1em',
                color: 'var(--neon)',
                marginBottom: '24px',
                textAlign: 'center',
              }}
            >
              SESSION COMPLETE 💪
            </div>

            {[
              { label: 'Exercise', value: exercise },
              { label: 'Total Reps', value: totalReps },
              { label: 'Sets', value: sets },
              { label: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s` },
              { label: 'Form Score', value: `${Math.round(formScore)}/100` },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.1em',
                  }}
                >
                  {label}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--text)' }}>
                  {value}
                </span>
              </div>
            ))}

            <button
              onClick={() => setScreen('workout')}
              style={{
                marginTop: '24px',
                width: '100%',
                background: 'var(--neon)',
                border: 'none',
                borderRadius: '8px',
                padding: '14px',
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                letterSpacing: '0.1em',
                color: '#000',
                cursor: 'pointer',
                boxShadow: 'var(--neon-glow)',
              }}
            >
              KEEP TRAINING
            </button>
          </div>
        </div>
      )}
    </>
  );
}
