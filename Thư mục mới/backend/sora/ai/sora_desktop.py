import os, subprocess, webbrowser
from pathlib import Path
def windows():
    if os.name!="nt": raise RuntimeError("Điều khiển desktop chỉ hỗ trợ Windows.")
def inspect():
    windows()
    import pygetwindow as gw
    import pyautogui as pg
    wins=[{"title":w.title[:140],"left":w.left,"top":w.top,"width":w.width,"height":w.height} for w in gw.getAllWindows() if w.title.strip() and w.width>0 and w.height>0]
    return {"windows":wins[:35],"screen":list(pg.size())}
def perform(name,args):
    windows()
    import pyautogui as pg
    pg.FAILSAFE=True
    if name=="inspect": return inspect()
    if name=="read_screen":
        try:
            import pytesseract
            from PIL import ImageOps
        except ImportError:
            raise RuntimeError("Thiếu pytesseract hoặc Pillow")
        import shutil
        exe=shutil.which("tesseract")
        if not exe:
            exe=r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if not Path(exe).exists() and not shutil.which("tesseract"):
            raise RuntimeError("Cần cài Tesseract OCR và gói vie")
        pytesseract.pytesseract.tesseract_cmd=exe
        data=pytesseract.image_to_data(ImageOps.grayscale(pg.screenshot()),lang="vie+eng",output_type=pytesseract.Output.DICT)
        words=[{"text":t,"x":data["left"][i],"y":data["top"][i]} for i,t in enumerate(data["text"]) if t.strip()]
        return {"words":words[:250],"truncated":len(words)>250}
    if name=="inspect_ui":
        try:
            import uiautomation as auto
        except ImportError:
            raise RuntimeError("Thiếu uiautomation")
        items=[]
        def walk(node,depth):
            if depth>3 or len(items)>=100:return
            try:
                items.append({"name":str(node.Name)[:100],"type":str(node.ControlTypeName)})
                for child in node.GetChildren()[:25]:walk(child,depth+1)
            except Exception:pass
        walk(auto.GetForegroundControl(),0)
        return {"elements":items}

    if name=="open_app":
        apps={"notepad":"notepad.exe","calculator":"calc.exe","explorer":"explorer.exe","vscode":"code"}
        app=str(args.get("app","")).lower()
        if app not in apps: raise ValueError("Ứng dụng chưa nằm trong danh sách cho phép.")
        subprocess.Popen([apps[app]],shell=False)
        return {"opened":app}
    if name=="open_url":
        url=str(args.get("url",""))
        if not (url.startswith("https://") or url.startswith("http://")): raise ValueError("URL không hợp lệ")
        webbrowser.open(url)
        return {"opened":url}
    if name=="click":
        x,y=int(args["x"]),int(args["y"])
        w,h=pg.size()
        if not 0<=x<w or not 0<=y<h: raise ValueError("Tọa độ ngoài màn hình")
        pg.click(x,y)
        return {"clicked":[x,y]}
    if name=="type_text":
        text=str(args.get("text",""))[:3000]
        import pyperclip
        old=pyperclip.paste()
        try:
            pyperclip.copy(text)
            pg.hotkey("ctrl","v")
        finally:
            pyperclip.copy(old)
        return {"typed_characters":len(text),"unicode":True}
    if name=="hotkey":
        keys=args.get("keys",[])
        allowed={"ctrl","alt","shift","tab","enter","esc","s","a","c","v","z","f","n","t","w","left","right","up","down","backspace"}
        if not isinstance(keys,list) or not 1<=len(keys)<=3 or any(k not in allowed for k in keys): raise ValueError("Phím tắt không được hỗ trợ")
        pg.hotkey(*keys)
        return {"hotkey":keys}
    if name=="screenshot":
        path=Path.home()/".sora"/"screenshot.png"
        path.parent.mkdir(exist_ok=True)
        pg.screenshot().save(path)
        return {"saved":str(path),"note":"Ảnh lưu cục bộ; model văn bản chưa phân tích trực tiếp hình ảnh."}
    raise ValueError("Công cụ không tồn tại")
