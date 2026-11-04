import struct, pathlib, subprocess, sys
here=pathlib.Path(__file__).resolve().parent
p=here/'Sora.ico'; data=p.read_bytes()
res,typ,n=struct.unpack_from('<HHH',data)
assert res==0 and typ==1 and n>0
icons=[]
for i in range(n):
    off=6+16*i
    width,height,colors,resv,planes,depth,size,pos=struct.unpack_from('<BBBBHHII',data,off)
    raw=data[pos:pos+size]
    (here/f'icon-{i+1}.bin').write_bytes(raw)
    icons.append((width,height,colors,resv,planes,depth,size))
# Windows RT_GROUP_ICON equivalent of ICONDIR (offsets->resourceIDs)
group=struct.pack('<HHH',0,1,n)
for i,v in enumerate(icons):group += struct.pack('<BBBBHHIH',*v,i+1)
(here/'icon-group.bin').write_bytes(group)
S=[]
def put(s):S.append(s)
def header(label, count):
    put(f'{label}:')
    put('  .long 0,0')
    put(f'  .short 0,0,0,{count}')
def entry(id,target,subdir=True):
    put(f'  .long {id}')
    put(f'  .long {"0x80000000 + " if subdir else ""}{target} - resource_start')
put('  .section .rsrc,"dr"')
put('  .p2align 2')
put('resource_start:')
header('resource_root',2)
entry(3,'type_icons')
entry(14,'type_group')
header('type_icons',n)
for i in range(n):entry(i+1,f'lang_icon_{i+1}')
header('type_group',1)
entry(1,'lang_group')
for i in range(n):
    header(f'lang_icon_{i+1}',1)
    entry(1033,f'entry_icon_{i+1}',False)
header('lang_group',1)
entry(1033,'entry_group',False)
put('  .p2align 2')
for i in range(n):
    put(f'entry_icon_{i+1}:')
    put(f'  .rva data_icon_{i+1}')
    put(f'  .long {icons[i][6]}')
    put('  .long 0,0')
put('entry_group:')
put('  .rva data_group')
put(f'  .long {len(group)}')
put('  .long 0,0')
for i in range(n):
    put('  .p2align 2')
    put(f'data_icon_{i+1}:')
    put(f'  .incbin "icon-{i+1}.bin"')
put('  .p2align 2')
put('data_group:')
put('  .incbin "icon-group.bin"')
(here/'sora_resource.asm').write_text('\n'.join(S)+'\n')
subprocess.run(['clang','--target=x86_64-pc-windows-gnu','-c', '-x', 'assembler', 'sora_resource.asm','-o','rsrc_windows_amd64.syso'],check=True,cwd=here)
print('resource syso generated', (here/'rsrc_windows_amd64.syso').stat().st_size)
