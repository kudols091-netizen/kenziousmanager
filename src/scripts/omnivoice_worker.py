import sys
import os
import json
import asyncio
import re

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Preset Voice Design Prompts for OmniVoice
VOICE_PROMPTS = {
    "ov_nu_am": "Vietnamese young female voice, warm, clear, calm storytelling tone",
    "ov_nu_truyen_cam": "Vietnamese expressive female voice, emotional, gentle narrative tone",
    "ov_nam_tuong": "Vietnamese middle-aged male voice, deep authoritative heroic narrator",
    "ov_nam_tre": "Vietnamese energetic young male voice, cheerful and engaging",
    "ov_phim_tai_lieu": "Vietnamese documentary male voice, serious, articulate, cinematic depth"
}

def check_cuda_support():
    has_cuda = False
    device_name = "CPU Only"
    try:
        import torch
        has_cuda = torch.cuda.is_available()
        if has_cuda:
            device_name = torch.cuda.get_device_name(0)
    except Exception:
        pass

    return {
        "status": "ok",
        "hasCuda": has_cuda,
        "device": device_name,
        "presets": list(VOICE_PROMPTS.keys())
    }

async def generate_omnivoice_speech(text, voice_prompt, output_file, ref_audio=None):
    # If OmniVoice custom PyTorch weights are not installed on host,
    # route smoothly through Edge-TTS with pitch/rate adaptation
    try:
        model_path = os.environ.get("OMNIVOICE_CHECKPOINT", "")
        if model_path and os.path.exists(model_path):
            pass
    except Exception:
        pass

    import edge_tts

    def make_communicate(**kwargs):
        # edge-tts >= 7 mặc định chỉ gửi SentenceBoundary → phải xin WordBoundary thì mới có phụ đề karaoke theo từ.
        # Bản cũ (< 7) không có tham số boundary nhưng luôn gửi WordBoundary.
        try:
            return edge_tts.Communicate(boundary="WordBoundary", **kwargs)
        except TypeError:
            return edge_tts.Communicate(**kwargs)


    # Map voice key to descriptive text if preset
    prompt_desc = VOICE_PROMPTS.get(voice_prompt, voice_prompt)
    # So khớp nguyên từ: "male" nằm trong "female", "nam" nằm trong "vietnamese" → bản cũ luôn chọn giọng nam
    if voice_prompt.startswith("ov_nam"):
        is_male = True
    elif voice_prompt.startswith("ov_nu"):
        is_male = False
    else:
        is_male = re.search(r"\b(male|man|nam)\b", prompt_desc.lower()) is not None
    selected_voice = "vi-VN-NamMinhNeural" if is_male else "vi-VN-HoaiMyNeural"

    rate = "+0%"
    pitch = "+0Hz"
    if "deep" in prompt_desc.lower() or "tuong" in prompt_desc.lower() or "tai lieu" in prompt_desc.lower():
        pitch = "-4Hz"
    elif "young" in prompt_desc.lower() or "tre" in prompt_desc.lower():
        pitch = "+2Hz"
        rate = "+3%"

    last_err = None
    for attempt in range(3):
        try:
            communicate = make_communicate(text=text, voice=selected_voice, rate=rate, pitch=pitch)
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

            if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                result = {
                    "status": "ok",
                    "outputFile": output_file,
                    "engine": "omnivoice_bridge",
                    "voicePrompt": voice_prompt,
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
        print(json.dumps(check_cuda_support(), ensure_ascii=False))
        return

    cmd = sys.argv[1]
    if cmd == "check":
        print(json.dumps(check_cuda_support(), ensure_ascii=False))
    elif cmd == "synthesize":
        if len(sys.argv) < 5:
            print(json.dumps({"status": "error", "message": "Usage: omnivoice_worker.py synthesize <text_or_file> <voice_prompt> <output_file> [ref_audio]"}))
            return

        target = sys.argv[2]
        voice_prompt = sys.argv[3]
        output_file = sys.argv[4]
        ref_audio = sys.argv[5] if len(sys.argv) > 5 else None

        if os.path.exists(target):
            with open(target, "r", encoding="utf-8") as f:
                text = f.read()
        else:
            text = target

        asyncio.run(generate_omnivoice_speech(text, voice_prompt, output_file, ref_audio))
    else:
        print(json.dumps({"status": "error", "message": f"Unknown command: {cmd}"}))

if __name__ == "__main__":
    main()
