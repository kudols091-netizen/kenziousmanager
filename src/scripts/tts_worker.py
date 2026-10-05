import sys
import asyncio
import json
import os
import edge_tts

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

def make_communicate(**kwargs):
    # edge-tts >= 7 mặc định chỉ gửi SentenceBoundary → phải xin WordBoundary thì mới có phụ đề karaoke theo từ.
    # Bản cũ (< 7) không có tham số boundary nhưng luôn gửi WordBoundary.
    try:
        return edge_tts.Communicate(boundary="WordBoundary", **kwargs)
    except TypeError:
        return edge_tts.Communicate(**kwargs)

def normalize_rate(val):
    if not val:
        return "+0%"
    s = str(val).strip()
    if s in ["0", "0%", "+0", "-0"]:
        return "+0%"
    if not s.endswith("%"):
        s += "%"
    if not (s.startswith("+") or s.startswith("-")):
        s = "+" + s
    return s

def normalize_pitch(val):
    if not val:
        return "+0Hz"
    s = str(val).strip()
    if s in ["0", "0Hz", "+0", "-0", "+0Hz", "-0Hz"]:
        return "+0Hz"
    if not s.lower().endswith("hz"):
        s += "Hz"
    if not (s.startswith("+") or s.startswith("-")):
        s = "+" + s
    return s

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
    norm_rate = normalize_rate(rate)
    norm_pitch = normalize_pitch(pitch)
    
    last_err = None
    for attempt in range(3):
        try:
            communicate = make_communicate(text=text, voice=voice, rate=norm_rate, pitch=norm_pitch)
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
                        
            if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                result = {
                    "status": "ok",
                    "outputFile": output_file,
                    "cues": cues
                }
                print(json.dumps(result, ensure_ascii=False))
                return
        except Exception as e:
            last_err = e
            await asyncio.sleep(1.0)
            
    if last_err:
        raise last_err
    raise RuntimeError("Edge-TTS không trả về dữ liệu âm thanh sau 3 lần thử")

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
        rate = normalize_rate(sys.argv[5] if len(sys.argv) > 5 else "+0%")
        pitch = normalize_pitch(sys.argv[6] if len(sys.argv) > 6 else "+0Hz")

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
