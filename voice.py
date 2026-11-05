"""Optional offline voice bridge. Audio is passed over stdin/stdout, never saved."""
import io
import json
import os
import sys
import wave


def main():
    mode = sys.argv[1]
    if mode == 'serve':
        from piper import PiperVoice
        voice = PiperVoice.load(os.environ['BENNY_PIPER_MODEL'])
        for line in sys.stdin:
            request = json.loads(line)
            try:
                output = io.BytesIO()
                with wave.open(output, 'wb') as wav:
                    voice.synthesize_wav(request['text'], wav)
                import base64
                response = {'id': request['id'], 'audio': base64.b64encode(output.getvalue()).decode('ascii')}
            except Exception:
                response = {'id': request['id'], 'error': 'synthesis failed'}
            print(json.dumps(response), flush=True)
    elif mode == 'listen':
        import vosk
        vosk.SetLogLevel(-1)
        with wave.open(io.BytesIO(sys.stdin.buffer.read()), 'rb') as audio:
            if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getcomptype() != 'NONE':
                raise ValueError('Expected mono PCM16 WAV')
            if audio.getnframes() / audio.getframerate() > 20:
                raise ValueError('Recording exceeds 20 seconds')
            recognizer = vosk.KaldiRecognizer(vosk.Model(os.environ['BENNY_VOSK_MODEL']), audio.getframerate())
            words = []
            while True:
                data = audio.readframes(4000)
                if not data:
                    break
                if recognizer.AcceptWaveform(data):
                    words.append(json.loads(recognizer.Result()).get('text', ''))
            words.append(json.loads(recognizer.FinalResult()).get('text', ''))
            sys.stdout.write(json.dumps({'text': ' '.join(w for w in words if w)}))
    elif mode == 'speak':
        from piper import PiperVoice
        voice = PiperVoice.load(os.environ['BENNY_PIPER_MODEL'])
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            voice.synthesize_wav(sys.stdin.buffer.read().decode('utf-8'), wav)
        sys.stdout.buffer.write(output.getvalue())
    else:
        raise ValueError('Unknown operation')


if __name__ == '__main__':
    main()
