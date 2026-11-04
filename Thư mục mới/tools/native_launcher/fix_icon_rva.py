from pathlib import Path
import struct,zipfile
p=Path(__file__).parent/'Sora.exe'; b=bytearray(p.read_bytes()); pelfanew=struct.unpack_from('<I',b,0x3c)[0]; op=pelfanew+24
nsec=struct.unpack_from('<H',b,pelfanew+6)[0]
optsize=struct.unpack_from('<H',b,pelfanew+20)[0]
sections=[]
for i in range(nsec):
    sec=pelfanew+24+optsize+40*i
    name=b[sec:sec+8].rstrip(b'\0')
    vsz, rva, rawsz, rawoff=struct.unpack_from('<IIII',b,sec+8)
    sections.append((name,vsz,rva,rawsz,rawoff))
_, _, rva, rsz, off=next(s for s in sections if s[0]==b'.rsrc')
def word(offset):return struct.unpack_from('<H',b,offset)[0]
def uint(offset):return struct.unpack_from('<I',b,offset)[0]
def entries(directory_off):
    base=off+directory_off
    count=word(base+12)+word(base+14)
    return [(uint(base+16+i*8), uint(base+20+i*8)) for i in range(count)]
resources=[]
for ty,val in entries(0):
    assert val & 0x80000000
    for rid,rel in entries(val & 0x7fffffff):
        assert rel & 0x80000000
        for lang,leaf in entries(rel & 0x7fffffff):
            assert lang==1033
            assert not leaf & 0x80000000
            data_len=uint(off+leaf+4)
            resources.append((ty,rid,leaf,data_len))
assert len(resources)==7
payload_off=(max(leaf for _,_,leaf,_ in resources)+16+3) &~3
for ty,rid,leaf,size in resources:
    struct.pack_into('<I',b,off+leaf,rva+payload_off)
    payload_off=(payload_off+size+3)&~3
p.write_bytes(b)
print('Patched resources:',resources,'section',rsz,'end',payload_off)
# validate original .ico frames with extracted resources
z=zipfile.ZipFile('/mnt/data/files/da luoc bo.zip'); ico=z.read('da luoc bo/Sora.ico')
n=struct.unpack_from('<H',ico,4)[0]; print('source icon frames',n)
for _,rid,leaf,size in resources:
    addr=struct.unpack_from('<I',b,off+leaf)[0]
    pos=off+addr-rva
    if rid<=n and _==3:
        image_pos=struct.unpack_from('<I',ico,6+16*(rid-1)+12)[0]
        orig_size=struct.unpack_from('<I',ico,6+16*(rid-1)+8)[0]
        assert b[pos:pos+size]==ico[image_pos:image_pos+orig_size], (rid,pos)
    elif _==14:
        assert b[pos:pos+6]==ico[:6]
print('Icon image bytes validated')
