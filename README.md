# Benny — Gemini-only adult testing

Refresh http://127.0.0.1:8787 after an update. Open Gemini settings below the chat to save your key and model. Start the app later with Start Benny.cmd (Windows) or sh start.sh (Pi).

Gemini is the only conversation provider. The Benny system prompt and exact opening greeting are in dialogue.mjs. Replies display and speak directly, without an approval step. There are no canned replies, local language model, provider selector or dialogue fallback. API errors are shown as errors. Google safety settings remain enabled.

Vosk microphone recognition and Piper speech output remain local and independent of the conversation provider. Record, click Finish, review the transcript, then Send. Stop / mute halts playback and recording. New chat clears the session. Conversation text and recent history are sent to Google; recordings are not. No transcripts or recordings are deliberately saved by this app. Gemini needs internet and uses your project's quotas and pricing.

Keys are saved in the local plaintext .benny-settings.json file, excluded by .gitignore and never returned in API responses. Do not share this file. Leave key blank to keep it or click Remove saved key to clear it. GEMINI_API_KEY and GEMINI_MODEL environment values override saved settings on startup and must be removed separately if set.

This is adult testing only. Google's API terms exclude applications directed toward or likely accessed by under-18s: https://aistudio.google.com/docs/terms. The prompt and provider filters do not guarantee safe or accurate answers.

For optional local voice, install Python 3.11 or 3.12, create a virtual environment, and download the models as described below. The launchers detect the virtual environment and models automatically. Live microphone/speaker quality needs a hands-on check. There is no physical mouth driver because hardware has not been chosen; the screen animation is a simulation.

For Raspberry Pi 4, use 64-bit Raspberry Pi OS, Node.js 22+, Python, a USB microphone and speakers. Copy this folder without the key settings file or Windows runtimes. Create a fresh Pi virtual environment:

```sh
sudo apt install python3-venv
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-voice.txt
sh start.sh
```

Open localhost:8787 in Chromium on the Pi. The launcher detects .venv and models/. For different locations, set BENNY_PYTHON, BENNY_VOSK_MODEL and BENNY_PIPER_MODEL. Pi performance and package compatibility require testing on your hardware. No local language model is needed in this version.

Run node --test for mocked integration tests of Gemini-only routing, original prompt, errors, authorization and key handling.

Temporary Gemini 500/502/503/504 and connection failures are retried up to two times with increasing delays, within a 45-second request deadline. Authentication, quota and safety-block errors are not retried. Failed questions are restored to the input for manual retry. No alternate provider or canned reply is used.

Speech latency: Piper now stays loaded in a persistent process, started with the server. Replies are revealed when playback begins rather than before synthesis. Gemini/network time and synthesis time still exist; this is not zero-latency streaming. The prompt includes occasional elementary-appropriate healthy habits, inclusive movement, teamwork and fair play.

## Fresh Windows setup

Install Node.js 22+ from https://nodejs.org and Python 3.11 or 3.12 from https://www.python.org. Clone this repository, then double-click `Start Benny.cmd`. Typed chat and an installed local English browser voice work without Python models. Enter your Gemini key through Gemini settings in the app.

For offline microphone recognition and Piper speech, open PowerShell in this repository:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-voice.txt
```

Then download voice models following [models/README.md](models/README.md). Restart the launcher after adding them. The launchers set `BENNY_PYTHON` to the virtual environment if present. No npm packages are needed. The server listens only on this device, at http://127.0.0.1:8787.

The repository contains source code and tests. API keys, Python runtimes, virtual environments, recordings, and downloaded voice models are excluded. Each machine needs its own local setup. Voice dependencies and models have their own licenses; review them before redistribution.
