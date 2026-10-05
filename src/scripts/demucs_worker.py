import sys
import os
import json
import subprocess

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

def check_environment():
    status = {"installed": False, "torch": False, "cuda": False}
    try:
        import torch
        status["torch"] = True
        status["cuda"] = torch.cuda.is_available()
    except ImportError:
        pass

    try:
        import demucs
        status["installed"] = True
    except ImportError:
        pass

    print(json.dumps(status))

def separate(input_file, output_dir, model="htdemucs"):
    cmd = [
        sys.executable, "-m", "demucs.separate",
        "-n", model,
        "--two-stems", "vocals",
        "-o", output_dir,
        input_file
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode == 0:
        print(json.dumps({"status": "ok", "message": "Separation completed"}))
    else:
        print(json.dumps({"status": "error", "message": proc.stderr}))

def main():
    if len(sys.argv) < 2:
        check_environment()
        return

    cmd = sys.argv[1]
    if cmd == "check":
        check_environment()
    elif cmd == "separate":
        if len(sys.argv) < 4:
            print(json.dumps({"status": "error", "message": "Usage: demucs_worker.py separate <input> <output_dir> [model]"}))
            return
        model = sys.argv[4] if len(sys.argv) > 4 else "htdemucs"
        separate(sys.argv[2], sys.argv[3], model)

if __name__ == "__main__":
    main()
