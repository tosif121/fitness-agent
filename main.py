import logging
import asyncio
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv
from vision_agents.core import User, Agent, AgentLauncher, Runner
from vision_agents.plugins import gemini, getstream, ultralytics

# ─────────────────────────────────────────────
# Load environment variables from .env
# ─────────────────────────────────────────────
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Active Session Tracking
# Prevents Gemini memory overflow by tracking
# and cleaning up sessions properly
# ─────────────────────────────────────────────
active_sessions: dict[str, asyncio.Task] = {}

# ─────────────────────────────────────────────
# Rep Counter State (shared between agent + HTTP)
# ─────────────────────────────────────────────
rep_data: dict[str, dict] = {}
# Format: { "call_id": { "exercise": "push_ups", "reps": 5, "sets": 1, "form_score": 85, "feedback": "Good form!" } }

# ─────────────────────────────────────────────
# Agent User
# ─────────────────────────────────────────────
agent_user = User(
    name="FitAgent 💪",
    id="fitagent",
)

# ─────────────────────────────────────────────
# Tool: Count Rep (Gemini calls this when it
# detects a completed rep with good form)
# ─────────────────────────────────────────────
def count_rep(exercise: str, form_quality: str = "good", feedback: str = "") -> dict:
    """Call this function every time you detect the user has completed one full rep of their exercise.
    Only call this when you see a COMPLETE rep (full range of motion - both down AND up phases).
    Do NOT call this for partial reps or when the user is just standing/sitting.

    Args:
        exercise: The exercise being performed (e.g., "squats", "push_ups", "lunges", "jumping_jacks", "burpees", "bicep_curls", "mountain_climbers")
        form_quality: Rate the form quality as "good", "okay", or "poor"
        feedback: Brief form feedback for this rep (e.g., "Great depth!", "Go deeper next time")

    Returns:
        dict with updated rep count
    """
    # Find the active session (use the first one for simplicity)
    call_id = next(iter(active_sessions.keys()), "default")

    if call_id not in rep_data:
        rep_data[call_id] = {
            "exercise": exercise,
            "reps": 0,
            "sets": 1,
            "form_score": 0,
            "feedback": "",
            "total_good": 0,
            "total_reps": 0,
        }

    data = rep_data[call_id]

    # Update exercise if changed
    if data["exercise"] != exercise:
        data["exercise"] = exercise
        data["reps"] = 0
        data["sets"] = data["sets"] + 1

    # Increment rep
    data["reps"] += 1
    data["total_reps"] += 1
    data["feedback"] = feedback

    # Calculate form score
    if form_quality == "good":
        data["total_good"] += 1
    score = int((data["total_good"] / max(data["total_reps"], 1)) * 100)
    data["form_score"] = max(score, 60)  # minimum 60%

    logger.info(f"🔢 Rep counted: {exercise} #{data['reps']} (form: {form_quality}) - {feedback}")

    return {
        "status": "counted",
        "exercise": exercise,
        "rep_number": data["reps"],
        "form_score": data["form_score"],
    }


def next_set(exercise: str) -> dict:
    """Call this when the user has completed a full set and is ready for the next one.

    Args:
        exercise: The exercise that was just completed
    Returns:
        dict with updated set count
    """
    call_id = next(iter(active_sessions.keys()), "default")
    if call_id in rep_data:
        rep_data[call_id]["sets"] += 1
        rep_data[call_id]["reps"] = 0
        logger.info(f"📊 New set: {exercise} - Set #{rep_data[call_id]['sets']}")
        return {"status": "new_set", "set_number": rep_data[call_id]["sets"]}
    return {"status": "no_session"}


# ─────────────────────────────────────────────
# Tiny HTTP Server for Rep Data (port 8001)
# Frontend polls this to get real-time rep counts
# ─────────────────────────────────────────────
class RepDataHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # CORS headers
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        # Return rep data for the first active session
        call_id = self.path.strip("/").replace("reps/", "")
        if call_id in rep_data:
            self.wfile.write(json.dumps(rep_data[call_id]).encode())
        else:
            # Return all data
            self.wfile.write(json.dumps(rep_data).encode())

    def do_DELETE(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        call_id = self.path.strip("/").replace("reps/", "")
        rep_data.pop(call_id, None)
        self.wfile.write(json.dumps({"status": "cleared"}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress noisy HTTP logs


def start_rep_server():
    """Start the rep data HTTP server on port 8001."""
    server = HTTPServer(("0.0.0.0", 8001), RepDataHandler)
    logger.info("📊 Rep data server running on http://localhost:8001")
    server.serve_forever()


# ─────────────────────────────────────────────
# Create Agent
# ─────────────────────────────────────────────
async def create_agent(**kwargs) -> Agent:
    """
    FitAgent stack:
    - YOLO11 Pose   → 17-keypoint skeleton tracking
    - Gemini Realtime → live voice coaching with rep counting tools
    """
    logger.info("🏋️  Initializing FitAgent...")

    agent = Agent(
        # Infrastructure
        edge=getstream.Edge(),

        # Identity
        agent_user=agent_user,

        # Coaching instructions (all form rules, rep logic, voice style)
        instructions="Read @fitness_coach.md",

        # LLM: Gemini Realtime with rep counting tools
        llm=gemini.Realtime(
            fps=5,
            config={
                "tools": [count_rep, next_set],
            },
        ),

        # Vision pipeline: YOLO detects keypoints
        processors=[
            ultralytics.YOLOPoseProcessor(
                model_path="yolo11n-pose.pt",
                device="cpu",
            ),
        ],

        **kwargs,
    )

    logger.info("✅ FitAgent ready with rep counting tools!")
    return agent

# ─────────────────────────────────────────────
# Join Call Handler
# ─────────────────────────────────────────────
async def join_call(agent: Agent, call_type: str, call_id: str):
    """Join a Stream call and run the agent until the session ends."""
    logger.info(f"📞 Joining call: {call_id}")

    # Track session for rep counting
    active_sessions[call_id] = None
    rep_data[call_id] = {
        "exercise": "",
        "reps": 0,
        "sets": 1,
        "form_score": 0,
        "feedback": "",
        "total_good": 0,
        "total_reps": 0,
    }

    await agent.create_user()
    call = await agent.create_call(call_type, call_id)

    try:
        async with agent.join(call):
            logger.info(f"✅ Session active: {call_id}")

            # Greet the user
            await agent.simple_response(
                text=(
                    "Introduce yourself as FitAgent, their AI personal trainer. "
                    "Ask what they want to start with today. "
                    "CRITICAL: Watch their video feed! If they start doing an exercise, "
                    "you MUST immediately process their movement and call the count_rep tool "
                    "for EVERY SINGLE REP. It is absolutely mandatory that you use the count_rep "
                    "tool continuously to keep the UI in sync. NEVER forget to call count_rep when they exercise!"
                )
            )
            await agent.finish()
    except asyncio.CancelledError:
        logger.info(f"🛑 Session cancelled: {call_id}")
    except Exception as e:
        logger.error(f"❌ Session error for {call_id}: {e}")
    finally:
        active_sessions.pop(call_id, None)
        rep_data.pop(call_id, None)
        logger.info(f"🧹 Session cleaned up: {call_id}")

# ─────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────
if __name__ == "__main__":
    """
    Dev mode  → uv run python main.py run  --call-id my-session
    Prod mode → uv run python main.py serve
    """
    # Start rep data server in background thread
    rep_thread = threading.Thread(target=start_rep_server, daemon=True)
    rep_thread.start()

    launcher = AgentLauncher(create_agent=create_agent, join_call=join_call)
    runner = Runner(launcher=launcher)
    runner.cli()