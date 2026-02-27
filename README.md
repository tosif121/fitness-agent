# 🏋️ FitAgent — Real-Time AI Fitness Coach

> **Vision Possible: Agent Protocol Hackathon Submission**  
> Built with [Stream Vision Agents SDK](https://visionagents.ai) · Powered by YOLO11 + Gemini Live

[![Vision Agents](https://img.shields.io/badge/Built%20With-Vision%20Agents-00ff87?style=flat-square)](https://visionagents.ai)
[![Gemini](https://img.shields.io/badge/LLM-Gemini%20Realtime-4285F4?style=flat-square)](https://deepmind.google/gemini)
[![YOLO](https://img.shields.io/badge/Vision-YOLO11%20Pose-FF6B35?style=flat-square)](https://ultralytics.com)
[![Hackathon](https://img.shields.io/badge/Hackathon-%23VisionPossible-blueviolet?style=flat-square)](https://wemakedevs.org/hackathons/vision)

---

## 📽️ Demo Video

[![FitAgent Demo](https://img.shields.io/badge/▶%20Watch%20Demo-YouTube-FF0000?style=flat-square&logo=youtube)](https://youtube.com/YOUR_DEMO_LINK)

> _Replace this link with your actual demo video before submission_

---

## 🔗 Links

| Resource       | Link                                                                           |
| -------------- | ------------------------------------------------------------------------------ |
| 🐙 GitHub Repo | [github.com/YOUR_USERNAME/fitagent](https://github.com/YOUR_USERNAME/fitagent) |
| 🎥 Demo Video  | [youtube.com/watch?v=YOUR_ID](https://youtube.com/YOUR_DEMO_LINK)              |
| 🌐 Live Demo   | [fitagent.vercel.app](https://fitagent.vercel.app) _(optional)_                |
| 🐦 Twitter/X   | [@YOUR_HANDLE](https://x.com/YOUR_HANDLE)                                      |

---

## 🎯 What Is FitAgent?

FitAgent is a **real-time AI personal trainer** that uses your webcam to:

- 🦴 **Detect your body pose** using YOLO11's 17-keypoint skeleton model
- 🔢 **Count your reps automatically** — squats, push-ups, lunges, deadlifts, jumping jacks
- ⚡ **Correct your form instantly** via live voice coaching from Gemini
- 🗣️ **Understand voice commands** — say "switch to push-ups" or "how many reps?"
- 📊 **Deliver a post-workout summary** with form score, reps, sets, and feedback

No gym equipment needed. No app to install. Just your camera and your body.

---

## ✨ Features

| Feature                     | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| 🦴 Real-Time Pose Detection | YOLO11n-pose tracks 17 keypoints at 30fps             |
| 🔢 Automatic Rep Counting   | Phase-based state machine (UP/DOWN) per exercise      |
| ⚠️ Form Error Detection     | Joint angle analysis flags errors in real-time        |
| 🗣️ Voice Coaching           | Gemini Realtime speaks corrections & motivation       |
| 🎙️ Voice Commands           | Say exercise names to switch mid-session              |
| 📊 Form Score               | 0–100 score tracking form quality across the session  |
| 🏁 Set & Rest Tracking      | Auto rest timer after each completed set              |
| 📋 Workout Summary          | Full breakdown at session end                         |
| 🛡️ Safety Monitoring        | Stops user if dangerous form or injury signs detected |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      USER (Webcam)                       │
└─────────────────────┬───────────────────────────────────┘
                      │ Video + Audio
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Stream Edge Network (<30ms)                 │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐      ┌───────────────────────────────┐
│  YOLOPoseProcessor│      │        Gemini Realtime         │
│  (17 keypoints)  │      │  (STT + LLM + TTS native)     │
└────────┬─────────┘      └───────────────────────────────┘
         │
         ▼
┌──────────────────┐
│ RepCounterProcessor│
│ - Detect exercise │
│ - Count reps      │
│ - Detect errors   │
│ - Track sets      │
└────────┬─────────┘
         │ Structured state
         ▼
┌──────────────────┐
│  React Frontend  │
│ - Skeleton overlay│
│ - Live rep counter│
│ - Form score arc  │
│ - Feedback toast  │
└──────────────────┘
```

---

## 🛠️ Tech Stack

| Layer           | Technology                                            |
| --------------- | ----------------------------------------------------- |
| Video Transport | [Stream Vision Agents](https://visionagents.ai)       |
| Pose Detection  | [YOLO11n-pose](https://ultralytics.com) (Ultralytics) |
| LLM + Voice     | [Gemini Realtime API](https://deepmind.google/gemini) |
| Frontend        | React + Tailwind CSS                                  |
| Backend         | Python 3.12 + uv                                      |
| Package Manager | [uv](https://astral.sh/uv)                            |

---

## 📋 Prerequisites

Before you begin, make sure you have:

- **Python 3.12+** with CPython installed
- **Node.js 18+** (for React frontend)
- **uv** package manager
- **Webcam** (built-in or USB)
- API keys for: Stream, Gemini _(see below)_

---

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/fitagent.git
cd fitagent
```

### 2. Install uv (if not already installed)

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 3. Install Python Dependencies

```bash
# Install Vision Agents + required plugins
uv add "vision-agents[getstream,gemini,ultralytics]" python-dotenv
```

### 4. Download YOLO Pose Model

```bash
# Auto-downloads yolo11n-pose.pt on first run, or manually:
uv run python -c "from ultralytics import YOLO; YOLO('yolo11n-pose.pt')"
```

### 5. Set Up Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your API keys:

```env
# ── Stream (free tier: 333k minutes/month) ──────────────
# Get keys at: https://getstream.io/try-for-free
STREAM_API_KEY=your_stream_api_key
STREAM_API_SECRET=your_stream_api_secret

# ── Gemini (handles STT + LLM + TTS natively) ───────────
# Get key at: https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_api_key
```

### 6. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

---

## ▶️ Running FitAgent

### Start the Backend Agent

```bash
# Development mode — join with a specific call ID
uv run python main.py run --call-id my-fitness-session

# Production mode — run as HTTP server
uv run python main.py serve
```

### Start the Frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Connect to a Session

1. Enter the same **Call ID** you used when starting the backend (`my-fitness-session`)
2. Click **START TRAINING**
3. Allow camera + microphone access
4. Get into position — FitAgent will greet you and start coaching!

---

## 📁 Project Structure

```
fitagent/
├── main.py                 # Agent entry point (backend)
├── rep_counter.py          # Custom processor: rep counting + form detection
├── fitness_coach.md        # AI instructions: form rules, voice style, exercises
├── .env.example            # API key template
├── pyproject.toml          # Python dependencies (uv)
│
└── frontend/
    ├── src/
    │   └── App.jsx         # React UI: skeleton overlay + HUD + rep counter
    ├── package.json
    └── vite.config.js
```

---

## 🎮 How to Use

### Basic Workout

1. Start backend + frontend
2. Enter a call ID → click **START TRAINING**
3. Allow camera access
4. Say **"Let's do squats"** or just get into squat position
5. FitAgent detects your exercise and starts coaching
6. Complete your set — FitAgent counts reps and corrects form
7. Rest when prompted, then continue
8. Say **"I'm done"** to get your workout summary

### Voice Commands

| Say                    | Action                         |
| ---------------------- | ------------------------------ |
| `"Switch to push-ups"` | Changes exercise               |
| `"How many reps?"`     | Agent tells you current count  |
| `"Give me my summary"` | Triggers post-workout summary  |
| `"Rest"`               | Starts rest timer              |
| `"I'm a beginner"`     | Agent suggests starter circuit |

### Supported Exercises

| Exercise        | Rep Counted When                  |
| --------------- | --------------------------------- |
| 🦵 Squat        | Hip at parallel + full stand      |
| 💪 Push-Up      | Chest to floor + arms extended    |
| 🏃 Lunge        | Back knee down + return to stand  |
| 🏋️ Deadlift     | Hip hinge to floor + full lockout |
| 🤸 Jumping Jack | Full out + full in = 1 rep        |
| 🪑 Plank        | Timed hold (no reps)              |

---

## 🔧 Configuration

### Change Reps Per Set

In `main.py`:

```python
RepCounterProcessor(
    reps_per_set=12,    # default: 10
    rest_duration=90,   # default: 60 seconds
)
```

### Enable GPU Acceleration

In `main.py`:

```python
ultralytics.YOLOPoseProcessor(
    model_path="yolo11n-pose.pt",
    device="cuda",   # change from "cpu" to "cuda"
)
```

### Increase Analysis FPS

In `main.py`:

```python
llm=gemini.Realtime(fps=10),   # default: 5 — increase for faster feedback
```

---

## 🤝 How It Was Built

FitAgent is built on top of the **Stream Vision Agents SDK** — an open-source framework for building real-time video AI agents.

The key insight: by chaining `YOLOPoseProcessor` → `RepCounterProcessor` in the Vision Agents pipeline, we get structured rep/form data injected directly into Gemini's context window every frame. Gemini then makes intelligent coaching decisions based on both the visual keypoints AND the structured state — without us having to write any complex prompt engineering for vision.

The `fitness_coach.md` instruction file acts as the "brain" of the agent, defining all the coaching rules, form cues, and voice style in plain English that Gemini understands and follows reliably.

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Stream](https://getstream.io) for the Vision Agents SDK and hackathon sponsorship
- [WeMakeDevs](https://wemakedevs.org) for organizing Vision Possible
- [Ultralytics](https://ultralytics.com) for YOLO11 pose estimation
- [Google DeepMind](https://deepmind.google) for Gemini Realtime API

---

<div align="center">

**Built for the [Vision Possible: Agent Protocol](https://wemakedevs.org/hackathons/vision) Hackathon**

[@WeMakeDevs](https://twitter.com/WeMakeDevs) · [@visionagents_ai](https://twitter.com/visionagents_ai) · [#VisionPossible](https://twitter.com/hashtag/VisionPossible)

</div>
