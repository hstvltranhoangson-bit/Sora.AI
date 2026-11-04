  .section .rsrc,"dr"
  .p2align 2
resource_start:
resource_root:
  .long 0,0
  .short 0,0,0,2
  .long 3
  .long 0x80000000 + type_icons - resource_start
  .long 14
  .long 0x80000000 + type_group - resource_start
type_icons:
  .long 0,0
  .short 0,0,0,6
  .long 1
  .long 0x80000000 + lang_icon_1 - resource_start
  .long 2
  .long 0x80000000 + lang_icon_2 - resource_start
  .long 3
  .long 0x80000000 + lang_icon_3 - resource_start
  .long 4
  .long 0x80000000 + lang_icon_4 - resource_start
  .long 5
  .long 0x80000000 + lang_icon_5 - resource_start
  .long 6
  .long 0x80000000 + lang_icon_6 - resource_start
type_group:
  .long 0,0
  .short 0,0,0,1
  .long 1
  .long 0x80000000 + lang_group - resource_start
lang_icon_1:
  .long 0,0
  .short 0,0,0,1
  .long 1033
  .long entry_icon_1 - resource_start
lang_icon_2:
  .long 0,0
  .short 0,0,0,1
  .long 1033
  .long entry_icon_2 - resource_start
lang_icon_3:
  .long 0,0
  .short 0,0,0,1
  .long 1033
  .long entry_icon_3 - resource_start
lang_icon_4:
  .long 0,0
  .short 0,0,0,1
  .long 1033
  .long entry_icon_4 - resource_start
lang_icon_5:
  .long 0,0
  .short 0,0,0,1
  .long 1033
  .long entry_icon_5 - resource_start
lang_icon_6:
  .long 0,0
  .short 0,0,0,1
  .long 1033
  .long entry_icon_6 - resource_start
lang_group:
  .long 0,0
  .short 0,0,0,1
  .long 1033
  .long entry_group - resource_start
  .p2align 2
entry_icon_1:
  .rva data_icon_1
  .long 5389
  .long 0,0
entry_icon_2:
  .rva data_icon_2
  .long 67624
  .long 0,0
entry_icon_3:
  .rva data_icon_3
  .long 16936
  .long 0,0
entry_icon_4:
  .rva data_icon_4
  .long 9640
  .long 0,0
entry_icon_5:
  .rva data_icon_5
  .long 4264
  .long 0,0
entry_icon_6:
  .rva data_icon_6
  .long 1128
  .long 0,0
entry_group:
  .rva data_group
  .long 90
  .long 0,0
  .p2align 2
data_icon_1:
  .incbin "icon-1.bin"
  .p2align 2
data_icon_2:
  .incbin "icon-2.bin"
  .p2align 2
data_icon_3:
  .incbin "icon-3.bin"
  .p2align 2
data_icon_4:
  .incbin "icon-4.bin"
  .p2align 2
data_icon_5:
  .incbin "icon-5.bin"
  .p2align 2
data_icon_6:
  .incbin "icon-6.bin"
  .p2align 2
data_group:
  .incbin "icon-group.bin"
