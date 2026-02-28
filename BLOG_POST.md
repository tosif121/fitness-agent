# Building FitAgent: A Real-Time AI Personal Trainer with Stream Vision Agents & Gemini

**Vision Possible Hackathon Submission**

Have you ever tried working out at home and thought, _“Am I actually doing this right, or am I just hurting my back?”_

We’ve all been there. Traditional fitness apps are just glorified stopwatches with pre-recorded videos. You watch them, but they don't watch you. For the **Vision Possible Hackathon**, we decided to flip the script.

What if your webcam could see your posture, count your reps, and literally speak to you in real-time to correct your form?

Meet **FitAgent**: a real-time AI fitness coach that lives in your browser. No extra apps, no wearable sensors, and no gym equipment. Just you, your webcam, and state-of-the-art vision AI.

---

## 🛠️ The Tech Stack: Standing on the Shoulders of Giants

To make a real-time, interactive, visually-aware AI, we needed ultra-low latency and highly capable models. Here is the magic triangle that powers FitAgent:

1. **Stream Vision Agents SDK**: This was the absolute game-changer. Processing high-resolution video frames in real-time and sending them to an AI model usually requires a nightmare of WebRTC plumbing. Stream’s SDK handled the edge network infrastructure, allowing us to easily capture the user's webcam, process the frames seamlessly, and broadcast audio back.
2. **YOLO11n-pose (Ultralytics)**: We used YOLO’s blazing-fast pose estimation model to extract a 17-keypoint human skeleton from the video feed. This gives us the exact X/Y coordinates of the user's nose, shoulders, wrists, hips, and knees at 30 frames per second.
3. **Google Gemini Realtime API**: We needed the AI to actually talk. Gemini Realtime handles Speech-to-Text (understanding user commands like _"Let's do squats"_), LLM reasoning (figuring out if the user needs motivation), and Text-to-Speech (audibly coaching the user).
4. **Next.js & Tailwind CSS**: We wrapped it all in a sleek, Dark Mode, cyberpunk-inspired React frontend, complete with an animated HUD (Heads-Up Display) overlaying the video feed.

---

## 🏗️ The Build Journey: How We Put It Together

### 1. The Real-Time Video Pipeline

Using the `Stream Video SDK` on the frontend and the `vision-agents` Python library on the backend, we spun up a session. The user joins a Stream Call on the web, and our Python Agent silently joins the exact same call. Every frame from the user's webcam is instantly forwarded to our backend processor.

### 2. Seeing the User: YOLO Pose Tracking

Instead of just sending raw images to a heavy Multimodal LLM (which is too slow for 30fps fitness tracking), we run the frames through `YOLOPoseProcessor`. It overlays a neon skeleton on the user and passes the data forward.

### 3. The "Aha!" Moment: Deterministic Logic vs. LLM Tool Calling

Initially, we tried giving Gemini the raw coordinates and told it to call a `count_rep` tool whenever it saw a squat. **This failed.** LLMs are brilliant, but they are not fast or consistent enough to calculate real-time trig-based physics on a continuous stream of 30fps data. Gemini would get distracted, talk too much, or miss reps entirely.

**The Solution:** We built a hybrid approach. We subclassed the `YOLOPoseProcessor` to inject **deterministic physics math** directly into the vision loop.

- _Squat Detection_: If `Hip.Y` drops below `Knee.Y - 30px`, state = DOWN. If it goes back up, state = UP → Instantly count a rep!
- _Jumping Jacks_: If `Wrist.Y` goes above `Nose.Y`, state = UP.

When the deterministic logic detects a completed rep, it _forces_ a state update to the frontend and provides context to Gemini. We let the deterministic code handle the counting, and we let Gemini handle the human connection (cheering the user on, commenting on form, and guiding the workout).

### 4. The Interactive HUD

To make the experience feel premium, we built a React front-end that polls the agent's progress. As the user moves, the UI updates instantly with rep counters, set trackers, a radial form-score arc, and custom visual overlays. We even added an **Auto-Detect** mode. You don't even have to press a button; just step back from the camera, start doing push-ups, and the AI will auto-select the exercise and start counting.

---

## 💡 Key Learnings

1. **Hybrids are King**: Don't use LLMs for things that simple math can do better. Using YOLO for rigid skeletal math and Gemini for conversational coaching resulted in an incredibly resilient and fast application.
2. **Infrastructure Matters**: Dealing with WebRTC audio/video sync is notoriously difficult. Stream Vision Agents abstracted away the hardest parts of real-time computer vision, letting us focus entirely on the product logic.
3. **Latency is Make-or-Break**: In fitness, if you finish a heavy squat and the app takes 4 seconds to say "Good job," you're already out of breath and annoyed. Stream + Gemini Realtime brought the latency down to a level that feels like an actual conversation with a human trainer.

---

## 🔮 What’s Next for FitAgent?

This hackathon was just the beginning.
In the future, we want to add:

- **Historical Analysis**: Saving form data over time to track your physiological improvement.
- **Physical Therapy**: Specialized routines for injury rehabilitation, ensuring patients don't overextend specific joints.
- **Multiplayer Mode**: Working out with a friend in the same Stream Call, while the AI coaches both of you simultaneously.

Building FitAgent challenged us to rethink how humans interact with video. We aren't just broadcasting pixels anymore; we are streaming context, intelligence, and environment. And thanks to Stream and Gemini, the future of computer vision looks stronger than ever. 💪
