# Place platform binaries here before packaging.

Windows (resources/bin/win/):
  - yt-dlp.exe
  - ffmpeg.exe
  - (optional) ffprobe.exe
  - msvc/ — VC++ CRT DLLs copied at `ensure-binaries` (ZooMa/torch)

macOS (resources/bin/mac/):
  - yt-dlp
  - ffmpeg

Dev mode falls back to PATH if files are missing.
