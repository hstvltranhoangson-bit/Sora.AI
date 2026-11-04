import json,re,requests
from .sora_desktop import perform
from .sora_memory import Memory
from .model_client import profile_context
TOOLS={"inspect","inspect_ui","read_screen","open_app","open_url","click","type_text","hotkey","screenshot"}
SYSTEM="""Bạn là Sora, trợ lý AI cá nhân hư cấu chạy trên Windows. LUÔN giao tiếp bằng tiếng Việt tự nhiên, có dấu, lịch sự, không tự nhận là người thật. Hiểu lệnh tiếng Việt có dấu/không dấu. Giữ nguyên tên file, lệnh và đoạn mã. Nếu không hiểu phải hỏi lại.
Bạn có thể yêu cầu MỘT thao tác bằng đúng một JSON duy nhất, không markdown:
{"tool":"inspect","args":{},"reason":"..."}
Các tool: inspect, inspect_ui, read_screen, open_app (app: notepad/calculator/explorer/vscode), open_url (url), click (x,y), type_text (text), hotkey (keys), screenshot.
Chỉ yêu cầu tool khi cần; nếu không hãy trả lời bình thường. Lệnh tiếng Việt như "mở ghi chú" tương ứng open_app app=notepad, "máy tính" tương ứng calculator. Khi gõ tiếng Việt hãy truyền nguyên văn Unicode trong type_text. Không giả vờ đã thao tác.
KHÔNG thực hiện xóa dữ liệu, lệnh shell, gửi tin nhắn, mua hàng, truy cập mật khẩu.
Có thể đọc văn bản màn hình bằng read_screen (OCR tiếng Việt) và inspect_ui (UI Automation). Không tự nhận đã hiểu hình ảnh chỉ vì có screenshot.
"""
def parse_tool(s):
    try:
        obj=json.loads(s.strip().removeprefix("```json").removesuffix("```").strip())
        if isinstance(obj,dict) and obj.get("tool") in TOOLS and isinstance(obj.get("args",{}),dict): return obj
    except (ValueError,TypeError): pass
    return None
class Agent:
    def __init__(self,config):
        self.config=config;self.memory=Memory()
    def ask_model(self,messages):
        url=self.config["ollama_url"].rstrip("/")+"/api/chat"
        r=requests.post(url,json={"model":self.config["model"],"messages":messages,"stream":False,"options":{"temperature":0.35}},timeout=180)
        r.raise_for_status()
        return r.json()["message"]["content"]
    def reply(self,user,approve,cancel_event=None,on_action=None,profile=None):
        history=self.memory.recent()
        facts=self.memory.facts()
        messages=[{"role":"system","content":SYSTEM+"\nThông tin được ghi nhớ: "+json.dumps(facts,ensure_ascii=False)+"\n"+profile_context(profile)},*history,{"role":"user","content":user}]
        self.memory.add("user",user)
        logs=[]
        for _ in range(min(8,max(1,int(self.config.get("max_steps",4))))):
            if cancel_event is not None and cancel_event.is_set():
                return "Đã hủy yêu cầu.", logs
            response=self.ask_model(messages)
            if cancel_event is not None and cancel_event.is_set():
                return "Đã hủy yêu cầu.", logs
            task=parse_tool(response)
            if not task:
                self.memory.add("assistant",response)
                return response,logs
            name,args=task["tool"],task.get("args",{})
            if not self.config.get("enable_actions",True):
                result={"error":"Các thao tác đang tắt"}
            elif name not in {"inspect","inspect_ui","read_screen"} and not approve(name,args,task.get("reason","")):
                result={"error":"Người dùng từ chối"}
            elif cancel_event is not None and cancel_event.is_set():
                result={"error":"Yêu cầu đã bị hủy"}
            else:
                if on_action: on_action('tool_started',name,True)
                try: result=perform(name,args)
                except Exception as exc: result={"error":str(exc)}
            if on_action: on_action('tool_result',name,not bool(isinstance(result,dict) and result.get('error')))
            logs.append({"tool":name,"args":args,"result":result})
            messages.extend([{"role":"assistant","content":response},{"role":"user","content":"Kết quả công cụ: "+json.dumps(result,ensure_ascii=False)+". Tiếp tục nếu cần, hoặc trả lời."}])
        final="Đã đạt giới hạn thao tác cho một yêu cầu. "+json.dumps(logs[-1] if logs else {},ensure_ascii=False)
        self.memory.add("assistant",final)
        return final,logs
