# Optional offline voice models

Models are downloaded separately and excluded from Git.

## Vosk speech recognition

Download `vosk-model-small-en-us-0.15.zip` from https://alphacephei.com/vosk/models and extract it here. The expected path is `models/vosk-model-small-en-us-0.15/am/final.mdl`.

## Piper speech synthesis

From this `models` directory, run the download command using your virtual environment:

Windows PowerShell:

```powershell
..\.venv\Scripts\python.exe -m piper.download_voices en_US-lessac-medium
```

Pi/Linux:

```sh
../.venv/bin/python -m piper.download_voices en_US-lessac-medium
```

Keep `en_US-lessac-medium.onnx` and `en_US-lessac-medium.onnx.json` together in this directory. Restart the app. Both launchers detect these standard names. For other locations, set `BENNY_VOSK_MODEL` and `BENNY_PIPER_MODEL`.

Check your selected voice's model card and dataset license before using or redistributing it: https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium. Piper documentation: https://github.com/OHF-Voice/piper1-gpl.
