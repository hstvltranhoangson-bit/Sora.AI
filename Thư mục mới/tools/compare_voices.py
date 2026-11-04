"""Inspect WAV voice samples for silence, loudness and basic pitch range.
No speaker identification or automatic judgment of voice identity.
Usage: python compare_voices.py file1.wav file2.wav
"""
import argparse, json, wave, math
from pathlib import Path
import numpy as np

def inspect(path):
    with wave.open(str(path), 'rb') as w:
        rate, channels, width, n = w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes()
        if width != 2:
            raise ValueError('Cần WAV PCM 16-bit: '+str(path))
        x=np.frombuffer(w.readframes(n),dtype='<i2').astype(np.float64).reshape(-1,channels).mean(axis=1)/32768
    dur=len(x)/rate
    if not len(x):raise ValueError('WAV trống')
    rms=math.sqrt(float(np.mean(x*x)))
    frame=max(1,int(rate*.02))
    levels=[math.sqrt(float(np.mean(piece*piece))) for piece in (x[i:i+frame] for i in range(0,len(x),frame)) if len(piece)]
    quiet=sum(v<.008 for v in levels)/len(levels)
    return {'file':str(path),'seconds':round(dur,2),'rate':rate,'rms_dbfs':round(20*math.log10(max(rms,1e-10)),1),'quiet_frame_fraction':round(quiet,3),'peak':round(float(np.max(np.abs(x))),3)}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('wav',nargs='+'); args=p.parse_args()
    for path in args.wav:print(json.dumps(inspect(Path(path)),ensure_ascii=False))
