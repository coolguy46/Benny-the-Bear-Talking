#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ -x .venv/bin/python ]; then export BENNY_PYTHON="$PWD/.venv/bin/python"; fi
if [ -d models/vosk-model-small-en-us-0.15 ]; then export BENNY_VOSK_MODEL="$PWD/models/vosk-model-small-en-us-0.15"; fi
if [ -f models/en_US-lessac-medium.onnx ]; then export BENNY_PIPER_MODEL="$PWD/models/en_US-lessac-medium.onnx"; fi
exec node server.mjs
