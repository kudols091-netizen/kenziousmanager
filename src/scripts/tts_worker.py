import sys
import asyncio
import json
import os
import edge_tts

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

async def list_voices():
    voices = await edge_tts.list_voices()
    formatted = []
    for v in voices:
        formatted.append({
            "name": v["ShortName"],
            "gender": v["Gender"],
            "locale": v["Locale"],
            "friendlyName": v.get("FriendlyName", v["ShortName"])
        })
    print(json.dumps({"status": "ok", "voices": formatted}, ensure_ascii=False))

async def generate_speech(text, voice, output_file, rate="+0%", pitch="+0Hz"):
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
    cues = []
    
    with open(output_file, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                cues.append({
                    "type": "word",
                    "offset": chunk["offset"],
                    "duration": chunk["duration"],
                    "text": chunk["text"]
                })
            elif chunk["type"] == "SentenceBoundary":
                cues.append({
                    "type": "sentence",
                    "offset": chunk["offset"],
                    "duration": chunk["duration"],
                    "text": chunk["text"]
                })
                
    result = {
        "status": "ok",
        "outputFile": output_file,
        "cues": cues
    }
    print(json.dumps(result, ensure_ascii=False))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "No command provided"}))
        return

    cmd = sys.argv[1]
    if cmd == "list-voices":
        asyncio.run(list_voices())
    elif cmd == "synthesize":
        if len(sys.argv) < 5:
            print(json.dumps({"status": "error", "message": "Usage: tts_worker.py synthesize <text_or_file> <voice> <output_file> [rate] [pitch]"}))
            return
        
        target = sys.argv[2]
        voice = sys.argv[3]
        output_file = sys.argv[4]
        rate = sys.argv[5] if len(sys.argv) > 5 else "+0%"
        pitch = sys.argv[6] if len(sys.argv) > 6 else "+0Hz"

        # Check if target is a file path
        if os.path.exists(target):
            with open(target, "r", encoding="utf-8") as f:
                text = f.read()
        else:
            text = target

        asyncio.run(generate_speech(text, voice, output_file, rate, pitch))
    else:
        print(json.dumps({"status": "error", "message": f"Unknown command: {cmd}"}))

if __name__ == "__main__":
    main()
