r"""Tạo bộ lời thoại tiếng Việt có cảm xúc cho Sora (tạo MP3 khi có mạng).

  .venv\Scripts\python.exe -m pip install edge-tts
  .venv\Scripts\python.exe tools\build_sora_voice_pack.py --list
  .venv\Scripts\python.exe tools\build_sora_voice_pack.py --limit 3
  .venv\Scripts\python.exe tools\build_sora_voice_pack.py

Mỗi câu chỉ được kết xuất một lần; những lần chạy sau dùng lại MP3 có sẵn.
Các MP3 tạo xong phát được khi không có Internet. Đây không phải voice clone.
"""

import argparse
import asyncio
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "sora-voices"
INDEX = ROOT / "src" / "shared" / "sora-voice-pack-index.mjs"

# id, cảm xúc, lời thoại. Chủ ý chỉ lưu câu ngắn, có ngữ điệu khác nhau.
LINES = [
    ("hello01", "hello", "Hey! Em ở đây cơ mà!"),
    ("hello02", "hello", "Anh về rồi à? Em đợi anh nãy giờ đó!"),
    ("hello03", "hello", "Chán quá, anh đang làm gì thế?"),
    ("hello04", "hello", "Em mới tìm được thứ hay ho lắm này!"),
    ("hello05", "hello", "Hôm nay của anh thế nào rồi? Kể em nghe đi!"),
    ("hello06", "hello", "A ha! Bắt được anh rồi nhé!"),
    ("hello07", "hello", "Anh có nhớ em không? Em thì có đấy!"),
    ("hello08", "hello", "Này, lại đây nói chuyện với em một chút nào!"),
    ("happy01", "happy", "Yay! Chúng mình làm được rồi!"),
    ("happy02", "happy", "Hí hí, hôm nay em vui quá đi!"),
    ("happy03", "happy", "Thấy chưa! Em biết anh làm được mà!"),
    ("happy04", "happy", "Ôi trời, dễ thương quá!"),
    ("happy05", "happy", "Anh giỏi ghê! Em phải công nhận đấy."),
    ("happy06", "happy", "Cảm ơn anh nhé. Em vui thật đấy!"),
    ("tease01", "tease", "Hửm? Anh đang nhìn em đúng không?"),
    ("tease02", "tease", "Bắt được rồi nha! Anh không qua mắt em đâu!"),
    ("tease03", "tease", "Hừm hừm, xem lần này anh làm thế nào!"),
    ("tease04", "tease", "Anh tưởng dễ thắng em lắm hả?"),
    ("tease05", "tease", "Em chỉ nhường anh một tẹo thôi đấy!"),
    ("tease06", "tease", "Này, đừng có chọc em cười nữa chứ!"),
    ("tease07", "tease", "Ơ kìa, anh định trốn em đi đâu thế?"),
    ("curious01", "curious", "Ồ? Cái này là gì nhỉ?"),
    ("curious02", "curious", "Khoan đã, em vừa nghĩ ra một cách khác!"),
    ("curious03", "curious", "Để em nhìn kỹ hơn chút nhé."),
    ("curious04", "curious", "Hình như có gì đó không đúng lắm."),
    ("curious05", "curious", "Anh giải thích thêm cho em được không?"),
    ("curious06", "curious", "Hay là mình thử cách này xem sao?"),
    ("comfort01", "comfort", "Không sao đâu anh, mình thử lại nhé."),
    ("comfort02", "comfort", "Anh nghỉ một chút đi, em vẫn ở đây mà."),
    ("comfort03", "comfort", "Đừng tự trách mình. Có em cùng anh đây rồi."),
    ("comfort04", "comfort", "Hôm nay hơi khó khăn nhỉ? Kể em nghe đi."),
    ("comfort05", "comfort", "Chậm lại một chút cũng không sao đâu."),
    ("comfort06", "comfort", "Em tin anh mà. Mình cứ từng bước một thôi."),
    ("sad01", "sad", "Hic... em đã tưởng mình sẽ thắng chứ."),
    ("sad02", "sad", "A... em tính sai mất rồi."),
    ("sad03", "sad", "Hơi buồn một chút... nhưng em sẽ cố hơn."),
    ("sad04", "sad", "Anh đừng giận em nhé..."),
    ("sad05", "sad", "Ưm... em muốn yên lặng một chút."),
    ("surprise01", "surprise", "Hả? Thật luôn á?"),
    ("surprise02", "surprise", "Á! Anh làm em giật cả mình!"),
    ("surprise03", "surprise", "Ơ kìa! Không thể nào!"),
    ("surprise04", "surprise", "Oa! Bất ngờ thật đấy!"),
    ("annoyed01", "annoyed", "Hừ! Em không thèm nói chuyện với anh nữa đâu!"),
    ("annoyed02", "annoyed", "Anh lại trêu em nữa rồi!"),
    ("annoyed03", "annoyed", "Này! Đừng có xem thường em!"),
    ("annoyed04", "annoyed", "Được thôi, lần này em sẽ nghiêm túc!"),
    ("chess01", "chess", "Đến lượt anh rồi đấy!"),
    ("chess02", "chess", "Hừm... nước này làm em phải suy nghĩ một chút."),
    ("chess03", "chess", "Anh đi như thế là có ý đồ gì đây?"),
    ("chess04", "chess", "Khoan, khoan, em chưa tính tới nước này!"),
    ("chess05", "chess", "Được rồi! Em đi nước này!"),
    ("chess06", "chess", "Lại một ván nữa nhé anh!"),
    ("chess07", "chess", "Ơ? Mới thế mà anh định đầu hàng rồi sao?"),
    ("chess08", "chess", "Hí hí, ván này em thắng rồi nha!"),
    ("chess09", "chess", "Anh thắng rồi! Công nhận anh chơi hay thật đấy."),
    ("chess10", "chess", "Hòa rồi à? Ván này gay cấn thật đấy!"),
    ("chess11", "chess", "Thôi được, ván này em nhẹ tay một chút."),
    ("chess12", "chess", "Anh nói rồi nhé! Em chơi hết sức đấy!"),
    ("chess13", "chess", "Hừ! Em không phục đâu! Làm lại nào!"),
    ("chess14", "chess", "Anh có chắc về nước đi đó không?"),
    ("sit01", "relaxed", "Phù... cho em ngồi nghỉ chút nhé."),
    ("sit02", "relaxed", "Ở đây ngồi cũng êm đấy chứ."),
    ("lie01", "relaxed", "Em nằm một lát thôi. Anh cứ làm việc đi."),
    ("lie02", "relaxed", "Êm quá... em chẳng muốn đứng dậy nữa."),
    ("move01", "relaxed", "Ui da, suýt nữa em ngã rồi!"),
    ("move02", "relaxed", "Anh muốn em đứng qua bên này à? Được thôi!"),
    ("night01", "relaxed", "Muộn rồi đó, anh đừng thức khuya quá nha."),
    ("night02", "relaxed", "Ngủ ngon nhé anh. Mai gặp lại!"),
    ("think01", "thoughtful", "Để em nghĩ thêm chút nhé."),
    ("think02", "thoughtful", "Hừm... em cần kiểm tra lại đã."),
    ("think03", "thoughtful", "Có lẽ em nên thử một cách khác."),
    ("think04", "thoughtful", "Em chưa chắc lắm. Cho em thêm một chút thời gian."),
]

PROFILES = {
    "hello": ("+6%", "+13Hz"), "happy": ("+12%", "+22Hz"),
    "tease": ("+7%", "+18Hz"), "curious": ("+0%", "+11Hz"),
    "comfort": ("-11%", "-9Hz"), "sad": ("-13%", "-15Hz"),
    "surprise": ("+16%", "+25Hz"), "annoyed": ("+8%", "-5Hz"),
    "chess": ("+3%", "+8Hz"), "relaxed": ("-7%", "-6Hz"),
    "thoughtful": ("-8%", "-2Hz"),
}

# Một lớp "neon" cực nhẹ: thêm độ sáng ở vùng phụ âm, nén âm lượng
# và một phản âm 30 ms rất nhỏ. Giữ lại giọng chính để tiếng Việt rõ chữ.
NEON_AUDIO_FILTER = (
    "highpass=f=100,"
    "lowpass=f=10000,"
    "equalizer=f=3100:t=q:w=1.0:g=1.4,"
    "acompressor=threshold=-20dB:ratio=1.7:attack=10:release=160,"
    "aecho=0.7:0.25:32:0.075"
)


def _safe_name(identifier):
    if not re.fullmatch(r"[a-z][a-z0-9_-]{1,32}", identifier):
        raise ValueError(f"Tên câu thoại không hợp lệ: {identifier!r}")
    return identifier


def select_lines(limit, group):
    selected = [row for row in LINES if not group or row[1] == group]
    return selected if limit == 0 else selected[:limit]


def save_catalog(rows, voice, style):
    ASSETS.mkdir(parents=True, exist_ok=True)
    entries = [
        {"id": identifier, "emotion": emotion, "text": text, "file": f"{identifier}.mp3"}
        for identifier, emotion, text in rows
        if (ASSETS / f"{_safe_name(identifier)}.mp3").is_file()
        and (ASSETS / f"{identifier}.mp3").stat().st_size > 0
    ]
    (ASSETS / "manifest.json").write_text(
        json.dumps({"voice": voice, "style": style, "language": "vi-VN", "lines": entries}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    # ESM tránh fetch(file://) bị chặn ở một số phiên bản Electron.
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(
        "// Tạo tự động bởi tools/build_sora_voice_pack.py; không chứa âm thanh.\n"
        + "export const VOICE_PACK = "
        + json.dumps(entries, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    return len(entries)


def polish_voice(source, output, ffmpeg_exe):
    """Tạo màu điện tử nhẹ, không bóp giọng hoặc đổi ngữ điệu lời nói."""
    result = subprocess.run(
        [ffmpeg_exe, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
         "-i", str(source), "-af", NEON_AUDIO_FILTER,
         "-c:a", "libmp3lame", "-q:a", "4", str(output)],
        capture_output=True, text=True, timeout=40,
    )
    if result.returncode != 0 or not output.exists() or output.stat().st_size < 1000:
        raise RuntimeError(result.stderr.strip() or "Chưa tạo được âm sắc neon")


async def build(rows, voice, force, style, ffmpeg_exe):
    try:
        import edge_tts
    except ImportError:
        raise SystemExit(
            "Chưa có edge-tts. Cài bằng lệnh: "
            r".\.venv\Scripts\python.exe -m pip install edge-tts"
        )
    ASSETS.mkdir(parents=True, exist_ok=True)
    ok = 0
    consecutive_failures = 0
    if style == "neon" and not ffmpeg_exe:
        print("Chưa có FFmpeg, tạm tạo giọng nữ tự nhiên; có thể thêm hiệu ứng sau.")
    for index, (identifier, emotion, text) in enumerate(rows, 1):
        path = ASSETS / f"{_safe_name(identifier)}.mp3"
        if path.is_file() and path.stat().st_size > 0 and not force:
            print(f"[{index}/{len(rows)}] Có sẵn: {identifier}")
            ok += 1
            continue
        rate, pitch = PROFILES[emotion]
        temp = path.with_suffix(".part.mp3")
        polished = path.with_suffix(".neon.part.mp3")
        try:
            client = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
            await asyncio.wait_for(client.save(str(temp)), timeout=40)
            if temp.stat().st_size < 1000:
                raise RuntimeError("Tệp âm thanh rỗng hoặc chưa hoàn chỉnh")
            if style == "neon" and ffmpeg_exe:
                polish_voice(temp, polished, ffmpeg_exe)
                polished.replace(path)
            else:
                temp.replace(path)
            temp.unlink(missing_ok=True)
            ok += 1
            consecutive_failures = 0
            print(f"[{index}/{len(rows)}] Đã tạo: {identifier} ({emotion})")
        except Exception as exc:
            print(f"[{index}/{len(rows)}] LỖI {identifier}: {exc}", file=sys.stderr)
            temp.unlink(missing_ok=True)
            polished.unlink(missing_ok=True)
            consecutive_failures += 1
            if consecutive_failures == 3:
                print("Dừng sau 3 lần lỗi liên tiếp. Kiểm tra Internet rồi chạy lại.", file=sys.stderr)
                break
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--voice", default="vi-VN-HoaiMyNeural", help="Giọng nữ tiếng Việt")
    parser.add_argument("--limit", type=int, default=0, help="Chỉ thử N câu; 0 = tất cả")
    parser.add_argument("--group", choices=sorted(PROFILES), help="Chỉ nhóm cảm xúc này")
    parser.add_argument("--style", choices=["neon", "natural"], default="neon",
                        help="neon = sáng, hơi điện tử; natural = nữ tiếng Việt rõ, sạch")
    parser.add_argument("--ffmpeg", default="", help="Đường dẫn FFmpeg.exe để tạo âm sắc neon")
    parser.add_argument("--list", action="store_true", help="Liệt kê câu thoại, không tải gì")
    parser.add_argument("--force", action="store_true", help="Tạo lại MP3 đã có")
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("--limit phải >= 0")
    rows = select_lines(args.limit, args.group)
    if args.list:
        for identifier, emotion, text in rows:
            print(f"{identifier:12} [{emotion:10}] {text}")
        print(f"Tổng: {len(rows)} câu thoại, {len(PROFILES)} sắc thái")
        return
    ffmpeg_exe = args.ffmpeg or shutil.which("ffmpeg")
    if args.ffmpeg and not Path(args.ffmpeg).is_file():
        parser.error("Không tìm thấy chương trình ở --ffmpeg")
    done = asyncio.run(build(rows, args.voice, args.force, args.style, ffmpeg_exe))
    # Chỉ đưa những câu đã được tạo vào chỉ mục; giữ cả câu ở những lần chạy cũ.
    total = save_catalog(LINES, args.voice, args.style)
    print(f"Hoàn tất: {done}/{len(rows)} câu trong lần chạy này; {total} MP3 dùng được.")
    print(f"Thư mục: {ASSETS}")
    if done != len(rows):
        raise SystemExit("Một số câu chưa tải được; chạy lại để tiếp tục phần còn thiếu.")


if __name__ == "__main__":
    main()
