#!/usr/bin/env python3
"""Render the PACT demo edit from the real Playwright capture."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
PROD = ROOT / "production"
OVER = PROD / "overlays"
SUB = ROOT / "submission"
RAW = next((PROD / "raw").glob("*.webm"))
VOICE = SUB / "PACT_Voiceover.mp3"
AMBIENT = PROD / "ambient.wav"
INTRO = OVER / "intro.png"
OUTRO = OVER / "outro.png"
FINAL = SUB / "PACT_Hackathon_Demo.mp4"

MAIN_START = 1.199
MAIN_DUR = 180.1
INTRO_DUR = 2.0
OUTRO_DUR = 2.4
TOTAL = INTRO_DUR + MAIN_DUR + OUTRO_DUR

LOWERS = [
    (33.928, "lower_01.png"),
    (44.972, "lower_02.png"),
    (61.488, "lower_03.png"),
    (74.188, "lower_04.png"),
    (92.792, "lower_05.png"),
    (103.068, "lower_06.png"),
    (116.680, "lower_07.png"),
    (129.260, "lower_08.png"),
    (141.024, "lower_09.png"),
    (153.652, "lower_10.png"),
]


def run(args, label):
    print(f"\n=== {label} ===", flush=True)
    print(" ".join(str(x) for x in args), flush=True)
    p = subprocess.run([str(x) for x in args])
    if p.returncode != 0:
        print(f"FAILED: {label} ({p.returncode})", file=sys.stderr)
        sys.exit(p.returncode)


def main():
    if not RAW.exists():
        sys.exit(f"missing raw recording: {RAW}")
    if not VOICE.exists():
        sys.exit(f"missing voiceover: {VOICE}")
    for _, name in LOWERS:
        if not (OVER / name).exists():
            sys.exit(f"missing overlay: {OVER / name}")

    # 1. Intro title card.
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-loop", "1", "-t", str(INTRO_DUR), "-i", INTRO,
        "-vf",
        "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p,"
        f"fade=t=in:st=0:d=0.40,fade=t=out:st={INTRO_DUR - 0.35:.2f}:d=0.35",
        "-t", str(INTRO_DUR), "-r", "30", "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        PROD / "edit_intro.mp4",
    ], "intro")

    # 2. Main footage with lower-thirds.
    inputs = ["-ss", str(MAIN_START), "-t", str(MAIN_DUR), "-i", RAW]
    for _, name in LOWERS:
        inputs += ["-loop", "1", "-t", "4.2", "-i", OVER / name]

    parts = [
        "[0:v]scale=1920:1080:flags=lanczos,"
        "unsharp=3:3:0.35:3:3:0,"
        "eq=contrast=1.01:saturation=1.02,"
        "fps=30,setsar=1,format=yuv420p,"
        f"fade=t=in:st=0:d=0.35,fade=t=out:st={MAIN_DUR - 0.6:.2f}:d=0.60[base]"
    ]
    prev = "base"
    for i, (start, _) in enumerate(LOWERS, 1):
        s = start + 0.25
        e = s + 4.2
        parts.append(
            f"[{i}:v]format=rgba,"
            "fade=t=in:st=0:d=0.35:alpha=1,"
            "fade=t=out:st=3.85:d=0.35:alpha=1,"
            f"setpts=PTS-STARTPTS+{s:.3f}/TB[o{i}]"
        )
        out = f"v{i}"
        parts.append(
            f"[{prev}][o{i}]overlay=0:0:eof_action=pass:repeatlast=0:"
            f"enable='between(t,{s:.3f},{e:.3f})'[{out}]"
        )
        prev = out

    filter_script = PROD / "main_filter.txt"
    filter_script.write_text(";\n".join(parts), encoding="utf-8")

    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        *inputs,
        "-filter_complex", filter_script.read_text(encoding="utf-8"),
        "-map", f"[{prev}]",
        "-t", str(MAIN_DUR), "-r", "30", "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        PROD / "edit_main.mp4",
    ], "main with lower-thirds")

    # 3. Closing card.
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-loop", "1", "-t", str(OUTRO_DUR), "-i", OUTRO,
        "-vf",
        "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p,"
        f"fade=t=in:st=0:d=0.40,fade=t=out:st={OUTRO_DUR - 0.4:.2f}:d=0.40",
        "-t", str(OUTRO_DUR), "-r", "30", "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        PROD / "edit_outro.mp4",
    ], "outro")

    # 4. Concatenate the three video-only segments.
    concat = PROD / "concat.txt"
    concat.write_text(
        "\n".join([
            "file 'edit_intro.mp4'",
            "file 'edit_main.mp4'",
            "file 'edit_outro.mp4'",
        ]) + "\n",
        encoding="utf-8",
    )
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-f", "concat", "-safe", "0", "-i", concat,
        "-c", "copy", "-movflags", "+faststart",
        PROD / "edit_concat.mp4",
    ], "concat")

    # 5. Deliberately quiet, synthesized ambient bed. No licensed music.
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-f", "lavfi", "-i", f"sine=frequency=55:sample_rate=48000:duration={TOTAL}",
        "-f", "lavfi", "-i", f"sine=frequency=82.41:sample_rate=48000:duration={TOTAL}",
        "-f", "lavfi", "-i", f"sine=frequency=110:sample_rate=48000:duration={TOTAL}",
        "-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.25:sample_rate=48000:duration={TOTAL}",
        "-filter_complex",
        "[0:a]volume=0.030[a];"
        "[1:a]volume=0.016[b];"
        "[2:a]volume=0.009[c];"
        "[3:a]lowpass=f=600,highpass=f=80,volume=0.010[d];"
        "[a][b][c][d]amix=inputs=4:duration=longest:normalize=0,"
        "volume=0.55,"
        f"afade=t=in:st=0:d=4,afade=t=out:st={TOTAL - 2.4:.2f}:d=2.4[amb]",
        "-map", "[amb]", "-t", str(TOTAL),
        "-ar", "48000", "-ac", "2",
        AMBIENT,
    ], "ambient bed")

    # 6. Mux the voiceover and ambient bed onto the finished picture.
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", PROD / "edit_concat.mp4",
        "-i", VOICE,
        "-i", AMBIENT,
        "-filter_complex",
        f"[1:a]adelay=2000|2000,volume=1.0,apad=whole_dur={TOTAL},atrim=0:{TOTAL}[vo];"
        f"[2:a]volume=8.0,atrim=0:{TOTAL}[bed];"
        "[vo][bed]amix=inputs=2:duration=longest:normalize=0,"
        "afade=t=in:st=0:d=0.8,"
        f"afade=t=out:st={TOTAL - 2.3:.2f}:d=2.3,"
        "alimiter=limit=0.95[a]",
        "-map", "0:v:0", "-map", "[a]",
        "-t", str(TOTAL),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart",
        FINAL,
    ], "final mux")

    print(f"\nFINAL: {FINAL}")
    print(f"TOTAL: {TOTAL}")


if __name__ == "__main__":
    main()
