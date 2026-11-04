"""Generate original Vietnamese voice samples with VieNeu, not a clone of an actor.
Install in a separate environment: py -3.11 -m venv H:\\SORA_Voice_Env
H:\\SORA_Voice_Env\\Scripts\\python.exe -m pip install vieneu
This tool intentionally uses preset voices, not copyrighted reference-video audio.
"""
from pathlib import Path
import argparse

LINES = [
  ('01_trung_tinh', 'Anh ơi, hôm nay mình bắt đầu từ đâu nhỉ?'),
  ('02_tinh_nghich', 'Hửm? Anh định thắng em thật đấy à? Để xem nào!'),
  ('03_han_hoan', 'A ha! Em biết ngay mà! Chúng mình làm được rồi!'),
  ('04_buon', 'Ừm... ván này em thua rồi. Hơi tiếc một chút.'),
  ('05_diudang', 'Anh mệt rồi hả? Cứ nghỉ một lát đi, em ở đây.'),
  ('06_bat_ngo', 'Ơ kìa! Nước cờ đó... anh nghĩ ra thật sao?'),
  ('07_gian_doi', 'Hừ! Anh lại trêu em rồi. Lần này em không dễ bị lừa đâu!'),
  ('08_can_than', 'Khoan nhé... để em kiểm tra lại kết quả trước khi trả lời anh.'),
]

def main():
    p=argparse.ArgumentParser();p.add_argument('--voice',default='Ái Hân');p.add_argument('--mode',default='v3nano',choices=['v3nano','v3turbo']);p.add_argument('--out',default='voice_samples');p.add_argument('--threads',type=int,default=2);a=p.parse_args()
    from vieneu import Vieneu
    tts=Vieneu(mode=a.mode)
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    for key,text in LINES:
        audio=tts.infer(text,voice=a.voice,threads=a.threads)
        tts.save(audio,str(out/(key+'.wav')))
        print('Đã tạo:',key)
if __name__=='__main__':main()
