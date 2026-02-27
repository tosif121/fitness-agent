import logging
from dotenv import load_dotenv
from vision_agents.core import User, Agent, AgentLauncher, Runner
from vision_agents.plugins import gemini, getstream, ultralytics
from rep_counter import RepCounterProcessor

# ─────────────────────────────────────────────
# Load environment variables from .env
# ─────────────────────────────────────────────
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Agent User
# ─────────────────────────────────────────────
agent_user = User(
    name="FitAgent 💪",
    id="fitagent",
)

# ─────────────────────────────────────────────
# Tool: Workout Summary
# Called when user says "How did I do?" / "Give me my summary"
# ─────────────────────────────────────────────
async def get_workout_summary() -> dict:
    """Returns a post-workout performance summary."""
    return {
        "exercises_done": ["Squats", "Push-ups", "Lunges"],
        "total_reps": 47,
        "sets": 6,
        "form_score": 82,
        "top_tip": "Focus on keeping knees tracking over toes during squats.",
    }

# ─────────────────────────────────────────────
# Create Agent
# ─────────────────────────────────────────────
async def create_agent(**kwargs) -> Agent:
    """
    FitAgent stack:
    - YOLO11 Pose   → 17-keypoint skeleton tracking
    - RepCounter    → rep counting + form error detection  
    - Gemini Realtime → live voice coaching (handles STT + TTS natively)
    """
    logger.info("🏋️  Initializing FitAgent...")

    agent = Agent(
        # Infrastructure
        edge=getstream.Edge(),

        # Identity
        agent_user=agent_user,

        # Coaching instructions (all form rules, rep logic, voice style)
        instructions="Read @fitness_coach.md",

        # LLM: Gemini Realtime handles audio I/O natively
        # fps=5 → 5 frames/sec sent to Gemini for analysis
        llm=gemini.Realtime(fps=5),

        # Vision pipeline: YOLO detects keypoints → RepCounter processes them
        processors=[
            ultralytics.YOLOPoseProcessor(
                model_path="yolo11n-pose.pt",
                device="cpu",           # change to "cuda" if GPU available
            ),
            RepCounterProcessor(
                reps_per_set=10,        # reps before triggering rest
                rest_duration=60,       # seconds of rest between sets
            ),
        ],

        # Tools the agent can call during a session
        tools=[get_workout_summary],

        **kwargs,
    )

    logger.info("✅ FitAgent ready!")
    return agent

# ─────────────────────────────────────────────
# Join Call Handler
# ─────────────────────────────────────────────
async def join_call(agent: Agent, call_type: str, call_id: str):
    """Join a Stream call and run the agent until the session ends."""
    call = agent.edge.call(call_type, call_id)

    async with agent.join(call):
        # Greet the user as soon as they join
        await agent.llm.simple_response(
            text=(
                "Introduce yourself as FitAgent, their AI personal trainer. "
                "Ask what exercise they want to start with today."
            )
        )
        await agent.finish()

# ─────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────
if __name__ == "__main__":
    """
    Dev mode  → uv run python main.py run  --call-id my-session
    Prod mode → uv run python main.py serve
    """
    launcher = AgentLauncher(create_agent=create_agent, join_call=join_call)
    runner = Runner(launcher=launcher)
    runner.cli()