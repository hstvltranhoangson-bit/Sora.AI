# SORA · AI Desktop Companion

> **Sora** là nhân vật đồng hành AI trên Windows: giao diện Electron/RT, bộ não Ollama cục bộ, bộ nhớ SQLite và các công cụ tương tác desktop. Dự án mang phong cách cyberpunk, nhưng câu trả lời kỹ thuật vẫn cần chính xác, có căn cứ và phản ánh những gì Sora thực sự quan sát được.

## Hình ảnh Sora.AI thực tế

![Cửa sổ Cờ vua và DIALOG của Sora.AI, ảnh chụp thực tế trên Windows](docs/sora-overview.png)

*Ảnh chụp cửa sổ Cờ vua và DIALOG trên Windows ngày 03/11/2026. Ảnh được cắt từ màn hình thật, không phải hình minh họa hay ảnh render.*

| Nhân vật Sora trên desktop | Menu trò chơi khi rê chuột |
|:--:|:--:|
| <img src="docs/sora-desktop.png" width="220" alt="Nhân vật Sora RT thực tế trên desktop" /> | <img src="docs/sora-menu.png" width="320" alt="Menu trò chơi Sora RT với cung con" /> |

![Cửa sổ Tic Tac Toe và DIALOG của Sora.AI trên Windows](docs/sora-game.png)

*Ảnh chụp Tic Tac Toe từ phiên đang chạy ngày 03/11/2026. Những hình trên ghi nhận các phiên phát triển, không khẳng định giao diện mới nhất đã được xác minh trực tiếp trên Windows.*

> **Quy tắc hình ảnh:** README chỉ dùng ảnh chụp thực tế do chủ dự án cung cấp hoặc ảnh tài nguyên RT xác định rõ nguồn. Không sử dụng concept giả làm màn hình ứng dụng. Sơ đồ `docs/architecture.png` là hình giải thích kiến trúc, không phải screenshot.

### Cập nhật ảnh README lên GitHub

Thay các tệp trong ZIP vào **thư mục chứa `README.md` ở gốc mã nguồn** (trên máy hiện tại: `F:\Sora.AI\SORA`). GitHub không cập nhật chỉ vì giải nén file trên máy. Sau khi kiểm tra đúng thư mục Git đang theo dõi, commit và push:

```powershell
cd 'F:\Sora.AI\SORA'
git rev-parse --show-toplevel
git add README.md docs
git commit -m "Cap nhat README va anh SoraAI thuc te"
git push origin main
```

Mở lại trang GitHub sau khi push và tải lại bằng `Ctrl+F5`. Nếu `git rev-parse --show-toplevel` không trỏ tới đúng dự án đang có `README.md` trên GitHub thì cần xác định lại thư mục Git trước khi commit.

## Cập nhật 05/11/2026 — Gọn menu chính, thêm Media

- **Nằm nghỉ** không còn là nút riêng trên vòng menu chính vì đã có trong menu con **Hành động**. Mục **Ẩn Sora** cũng chỉ nằm trong menu con. Không thay đổi 7 hành động đã có hoặc trạng thái RT khi ngồi/nằm.
- Vị trí thứ ba trên vòng chính được chuyển thành **Media** (biểu tượng nốt nhạc). Nhấn để **mở/đưa lên trước mini-player `SORA // MEDIA` hiện có** — không đóng player nếu đã mở. Media hiển thị trạng thái nhạc Windows và các nút phát/tạm dừng, chuyển bài, âm lượng khi Windows Media Bridge có thể đọc được thông tin.
- Cửa sổ menu tròn vẫn giữ **8 múi**, không thêm popup trong suốt hoặc thay đổi kích thước. GAME và Hành động tiếp tục dùng cung ngoài hiện tại. Nút **Di chuyển** là lệnh `teleport` độc lập, không trùng hành động trong menu con nên vẫn giữ.
- Dùng `fusionCenter.openMini()` riêng cho nút Media. Lệnh `toggleMini()` từ khay hệ thống được giữ như cũ. Không sửa Ollama, SQLite, game, DIALOG hay các asset RT.

![Xem trước vòng menu Hành động với nút Media trên menu chính, dựng bằng Chromium từ mã Sora.AI](docs/sora-actions-preview.png)

*Ảnh xem trước giao diện thực tế từ HTML/CSS/JS của Sora.AI trong Chromium, không phải ảnh chụp Electron Windows. Các ảnh Windows thực tế vẫn được giữ ở đầu README.*

**Kiểm tra trên máy:** Thoát Sora, giải nén ZIP đè vào `F:\Sora.AI\SORA`; mở menu để xác nhận icon Media ở vị trí cũ của Nằm nghỉ. Nhấn Media để mở mini-player; mở lại menu rồi nhấn Media lần nữa phải đưa player lên trước, không đóng nó. Rê chuột tới Hành động để chọn **Nằm nghỉ**. Media chỉ điều khiển các ứng dụng phát âm thanh mà Windows Media Bridge hỗ trợ.

## Cập nhật 05/11/2026 — Vòng menu con Hành động

**Ẩn Sora** trên vòng menu chính được thay bằng biểu tượng **Hành động** (bàn tay viền neon). Khi rê chuột hoặc nhấp vào biểu tượng, một vòng cung riêng xuất hiện bên ngoài, giống menu GAME đang hoạt động. Hai vòng cung luân phiên trong **cùng một cửa sổ Electron trong suốt 260 DIP**, không tạo thêm cửa sổ và không thay đổi bố cục khi rê chuột.

![Menu Hành động Sora.AI xem trước từ HTML/CSS/JS thực tế](docs/sora-actions-preview.png)

*Ảnh xem trước dựng trực tiếp bằng Chromium từ giao diện Sora.AI được sửa trong bản này (không phải ảnh chụp Electron Windows). Các ảnh ở phần trên là ảnh Sora.AI thực tế do chủ dự án cung cấp.*

Bảy lựa chọn độc lập: **Ẩn Sora**, **Nằm nghỉ**, **Ngồi nghỉ**, **Đứng dậy**, **Vẫy tay**, **Nhảy múa**, **Nhìn quanh**. Lựa chọn sẽ thực thi trên cùng nhân vật RT đang chạy:

- **Ẩn:** dùng cơ chế chip/khôi phục có sẵn, dữ liệu và hội thoại không bị xóa.
- **Nằm:** dùng `lie` hiện có (nếu đang nằm thì trở về ngồi). **Ngồi:** tìm bề mặt ngang hợp lệ hoặc thanh tác vụ. **Đứng:** đưa Sora về điểm đứng mặc định để tránh treo trên không khi rời mép cửa sổ.
- **Vẫy tay, Nhảy múa, Nhìn quanh:** dùng các hoạt ảnh thực tế trong `src/renderer/js/acting.js`, thông qua `playRequestedAct` để không làm hỏng trạng thái tư thế ngồi/nằm.
- **Nằm nghỉ** chỉ có ở menu con Hành động kể từ bản cập nhật Media; vị trí cũ trên vòng chính dành cho Media. Nhãn hành động hiện ở trung tâm khi rê chuột và hỗ trợ thao tác bàn phím.

**Kiểm chứng:** Bốn hướng cung menu đã được kiểm thử bằng Chromium, bao gồm nhấp lựa chọn, chuyển GAME/Hành động và vị trí nằm trong khung. Kiểm thử Node xác nhận kết nối các kênh renderer/main. Chưa xác nhận các hoạt ảnh vận hành trên Electron Windows thực tế; nếu nhân vật đang bận hoặc không có chỗ ngồi hợp lệ, một số hành động có thể chưa thực hiện ngay.

**Các tệp cập nhật:** `src/wheel/index.html`, `src/wheel/wheel.css`, `src/wheel/wheel.js`, `src/main/main.js`, `src/renderer/js/app.js`, `tests/action-submenu.test.js`, `docs/sora-actions-preview.png`, `README.md`. Thoát Sora và giải nén đè vào `F:\Sora.AI\SORA`, không cần cài đặt/backup, không sửa `.venv`, `node_modules` hoặc `data`.

## Cập nhật 04/11/2026 — Ổn định đầu khi ngồi trên cửa sổ

Video thực tế cho thấy đầu/tóc Sora méo mạnh khi vừa chuyển sang tư thế ngồi ở mép cửa sổ. Phân tích mã nguồn tìm được **hai nguyên nhân kỹ thuật**:

- Bộ sprite 60 frame (`196 × 384` mỗi frame) dùng cùng shader kéo tóc theo pixel của sprite ngồi cổ điển (`948 × 1659`), làm chuyển động đầu/tóc bị phóng đại theo tỉ lệ.
- Hoạt ảnh tiếp đất `plop` từng co chiều cao 15% và nở bề ngang 10% ở 2 frame đầu; bộ 60 frame cũng từng bắt đầu tại một frame bất kỳ theo `performance.now()`.

**Đã điều chỉnh:** Dùng `compactPerch` để bảo vệ vùng mắt/mặt và chỉ dịch nhẹ ngọn tóc, giảm độ uốn tóc của tư thế ngồi cổ điển, hạn chế squash/stretch tiếp đất dưới 2%, và bắt đầu mỗi chu kỳ ngồi từ frame 0. Không thay sprite gốc, không thay tỷ lệ chân/hông, không sửa hệ nằm, DIALOG, menu hay backend.

![Ảnh chụp thật Sora đang ngồi trên mép cửa sổ, cắt từ video do người dùng cung cấp](docs/sit.png)

*Ảnh minh họa tình trạng trước chỉnh sửa, trích từ video thực tế. Chưa xác minh bản vá bằng Electron trên Windows; cần kiểm tra lại lúc Sora vừa ngồi xuống và khi chuyển giữa các bề mặt.*

### Các file được cập nhật trong bản vá này

- `src/renderer/js/seated-renderer.js` — shader ngồi cổ điển và biến dạng an toàn cho sprite 60 frame.
- `src/renderer/js/sora-perch-60.mjs` — đồng bộ thời gian frame khi chuyển vào tư thế ngồi.
- `src/renderer/js/acting.js` — giảm nén/phình khung hình lúc tiếp đất.
- `tests/sora-sit-head-stability.test.js` — các kiểm thử bảo vệ chống hồi quy.
- `README.md`, `docs/sora-overview.png`, `docs/sora-demo.png`, `docs/sora-demo.svg`, `docs/sora-desktop.png`, `docs/sora-menu.png`, `docs/sora-game.png`, `docs/sit.png` — tài liệu và các ảnh chụp Sora.AI thực tế.

**Cập nhật trên máy:** Thoát Sora hoàn toàn, giải nén bản ZIP vào `F:\Sora.AI\SORA`, chọn ghi đè đúng các tệp trùng tên, mở lại Sora. Không chạy script cài đặt, không tự sao lưu và không động đến `.venv`, `node_modules`, `data`, SQLite hoặc model Ollama.

**Kiểm thử nhanh:** `node --test tests\sora-sit-head-stability.test.js tests\sora-sit-modes.test.js tests\perches.test.js` trong thư mục `F:\Sora.AI\SORA`.

## GameHub hiện tại — 8 trò trong một cửa sổ

Thanh ray ngang trên cùng có thể kéo, cuộn hoặc dùng mũi tên trái/phải để chọn **Cờ vua, Tic Tac Toe, Cờ Nối 4, Cờ Caro, Đoán Từ Bí Mật, Cờ Lật, Bắn Tàu và Thám Tử**. Menu GAME có biểu tượng riêng cho từng trò. DIALOG, VOICE và AI cục bộ hoạt động theo trò đang chọn; khi Ollama sẵn sàng Sora có thể bổ sung hội thoại. Người chơi có thể yêu cầu “nhường anh” hoặc “chơi hết sức” thay vì dùng thanh độ khó.

Bản mã hiện tại đã có `src/games/hub/` và `src/games/chess/` cùng các engine cục bộ. Khả năng ghi nhớ/thống kê từng trò phụ thuộc trạng thái backend và dữ liệu SQLite trên máy; không coi mỗi tính năng là đã được kiểm chứng trực tiếp trên Windows nếu chưa có biên bản kiểm thử thực tế.

## Cập nhật 03/11/2026 — Tic Tac Toe trong cửa sổ cờ vua

Cửa sổ **Trò chơi** có hai tab đặt cạnh nhau: **♟ CỜ VUA** và **TIC TAC TOE** (biểu tượng bàn 3×3). Bấm tab để đổi trò, không tạo cửa sổ DIALOG thứ hai.

- **Tic Tac Toe 3×3:** Line chơi X và đánh trước; Sora chơi O. Ba dấu liên tiếp ngang, dọc hoặc chéo thắng; kín chín ô không có ba dấu là hòa. Bấm ô trống để đặt X; Sora tự chọn ô O hợp lệ.
- **Chiến thuật:** Sora có thuật toán Minimax cục bộ nên vẫn đánh được khi không có Internet/Ollama. Lệnh hội thoại “chơi nghiêm túc” chọn nước tối ưu, “chơi nhẹ” cho phép đánh linh hoạt; kinh nghiệm Tic Tac Toe lưu riêng và tăng dần sau những ván hoàn tất.
- **Tích hợp Sora:** DIALOG và VOICE dùng chung; câu hỏi vẫn gửi tới cùng Agent Python/Ollama với **bối cảnh chính xác của trò đang mở**. Hội thoại được ghi về cùng SQLite, phân biệt nguồn `chess`/`tictactoe`; sự kiện và kết quả được ghi vào nhật ký trải nghiệm. Phê duyệt thao tác desktop không đổi.
- **Chuyển trò:** Bàn cờ vua được giữ nguyên khi chuyển sang Tic Tac Toe. Bàn Tic Tac Toe, điểm số và kinh nghiệm tự lưu trong `localStorage` của Electron; khi chuyển lại hoặc mở cửa sổ lần sau, ván 3×3 được khôi phục. Hai trò có **bảng điểm độc lập**. Nút **VÁN MỚI** chỉ khởi tạo lại trò đang xem; không xóa lịch sử DIALOG.
- **Điều khiển:** Trong menu trò chơi Sora có cả hai mục. Có thể nhắn “chuyển sang Tic Tac Toe”, “chuyển sang cờ vua”, “chơi lại”, “chơi nhẹ”, “chơi nghiêm túc”, hoặc “anh đầu hàng” khi đang chơi.

### Ghi chú nâng cấp từ các bản cũ

Phần bên trên ghi lại lịch sử bổ sung Tic Tac Toe ngày 03/11/2026. Quy trình phát hành **hiện tại** là ZIP có cấu trúc trực tiếp dưới gốc `SORA`, **giải nén đè**; không cần chạy `CaiDat-TicTacToe.ps1`, không tự động backup hoặc cài lại môi trường. Luôn thoát hoàn toàn Electron trước khi ghi đè tệp. Nếu giao diện không đổi, xác nhận ứng dụng đang mở từ `F:\Sora.AI\SORA` và đã ghi đè đúng thư mục `src`.


## Mô tả ngắn gọn

Sora là ứng dụng desktop Windows có nhân vật RT, trò chuyện bằng tiếng Việt theo vai *em–anh*. AI chạy qua **Ollama** khi mô hình có sẵn; SQLite lưu hội thoại, kinh nghiệm được chấp thuận và thông tin hỗ trợ. Bộ tính cách Engram đưa vào nhịp nói tinh nghịch, tò mò, đôi lúc băn khoăn về chính mình, nhưng vẫn ưu tiên sự chính xác khi anh cần giúp đỡ thật.

Dữ liệu trên web/LAN được coi là **nguồn tham khảo không tin cậy**, được lấy qua module đọc-only có kiểm tra đích. Persona quyết định **cách diễn đạt**, không được tự ý biến điều chưa xác minh thành sự thật.

## Công nghệ tích hợp

| Lớp | Thành phần | Chức năng / tình trạng |
|---|---|---|
| Desktop UI | **Electron + HTML/CSS/JavaScript** | Cửa sổ RT, nhân vật, menu, DIALOG, chess (tùy bản mã). |
| AI trò chuyện | **Python backend + Ollama** | Tạo câu trả lời cục bộ. Đã từng chạy với Qwen2.5; tên model thực tế kiểm tra bằng `ollama list`. |
| Ký ức | **SQLite** `data/memory.sqlite3` | Lưu hội thoại, kinh nghiệm/dữ liệu của dự án. **Không xóa**. |
| Cá tính | **SORA Engram Personality** | System prompt theo nguồn gốc Soulkiller/Arasaka (lore hư cấu); ưu tiên xưng **em–anh**. |
| Hiệu ứng | **Glitch Status 32 ms** | Mã ký tự đơn hàng, đổi đỏ/xanh/trắng và blackout khi xử lý. |
| Nhận biết màn hình | **Windows UI Automation + vision tùy tình huống** | Đọc cấu trúc UI trước, phân tích ảnh khi cần; độ hỗ trợ tùy ứng dụng. |
| Tra cứu | **SORA Network Guard / Accuracy V2** | Đọc web HTTPS công cộng, LAN HTTP(S) khi bật/cho phép, trích nguồn; không trao quyền điều khiển cho nội dung web. |
| Phòng vệ | **Network trust boundary + SHA-256** | Từ chối địa chỉ nhạy cảm theo chính sách, kiểm tra thay đổi mã nguồn. Không thay thế Defender. |
| Âm thanh (tạm dừng) | **VieNeu / F5-TTS / ElevenLabs thử nghiệm** | **Không coi là tính năng chính đã hoàn thiện**. Chỉ còn các bản thử và tệp tham chiếu nếu người dùng giữ. |

**Tình trạng kiểm chứng:** Các mục trên được tổng hợp từ các bản vá và log cài đã có. Có thể có sai khác giữa ZIP cũ và thư mục `H:\SORA` hiện tại; sử dụng `tools/maintenance/doctor.py` để xác nhận mã đã thực sự có mặt. Không khẳng định mọi tính năng đều đã hoạt động trên mọi máy.

## Tính năng chính (Key Features)

- Trò chuyện tiếng Việt theo tính cách Sora, dùng bộ nhớ hội thoại SQLite và Ollama khi sẵn sàng.
- DIALOG chính và trò cờ vua với một luồng ký ức (nếu bản cài đã tích hợp đúng cầu nối backend).
- Nhân vật RT có hoạt ảnh tương tác, menu tròn, ngồi/nằm trên các bề mặt và hiển thị trên desktop (phụ thuộc bản đang chạy).
- Hiệu ứng Glitch một dòng, từng ký tự nhiễu độc lập, tốc độ nhanh.
- Nhận biết cửa sổ đang hoạt động và cấu trúc UI (khi screen context được kích hoạt).
- Tìm và tóm tắt thông tin web, ghi nguồn và không lấy câu trả lời cũ thay thế kết quả tìm kiếm mới khi Ollama lỗi (khi **Network Offline Fix** đã được áp dụng).
- Đọc các máy chủ LAN **được khai báo**, không tự quét mọi thiết bị.
- Lưu mốc SHA-256, so sánh file bị sửa/thêm/xóa; khôi phục mã nguồn từ bản sao lưu tương ứng khi cần.
- Có công cụ bảo trì chỉ rà soát **các bộ thử/bộ cài Sora đã biết** ở gốc ổ H, không động vào dự án khác.

## Kiến trúc

![Sơ đồ kiến trúc Sora](docs/architecture.png)

**Nguyên tắc**: UI → Backend → (Ollama + SQLite + ngữ cảnh UI + Web/LAN) → chuẩn hóa chứng cứ → diễn đạt theo tính cách Sora → trả về DIALOG. Nội dung đọc từ web không phải là lệnh hệ thống và không được tự ý điều khiển Desktop Agent.

**Lưu ý đường dẫn:** Môi trường dự án đang sử dụng là `F:\Sora.AI\SORA`. Các ví dụ `H:\SORA`/`C:\SORA` trong phần lịch sử phía dưới là ghi chép của những lần di chuyển/khôi phục cũ, không phải đường dẫn khởi chạy hiện tại.

## Cấu trúc thư mục (Project Structure)

```text
H:\
├─ SORA\                             # Dự án đang chạy — KHÔNG XÓA
│  ├─ README.md                       # TÀI LIỆU DUY NHẤT CỦA DỰ ÁN
│  ├─ Sora.bat                         # Khởi động
│  ├─ .venv\                           # Môi trường Python đang dùng
│  ├─ data\memory.sqlite3            # Ký ức của Sora
│  ├─ backend\sora\
│  │  ├─ ai\model_client.py          # Kết nối Ollama và nghiên cứu mạng
│  │  ├─ ai\network_research.py      # Nguồn web/LAN (nếu đã tích hợp)
│  │  ├─ ai\sora_personality.py      # Persona Engram (nếu đã tích hợp)
│  │  └─ network_settings.json       # Cấu hình mạng
│  ├─ src\                           # Electron, renderer, game, assets RT
│  ├─ docs\                          # Hình minh họa README
│  └─ tools\maintenance\             # Bộ kiểm tra và dọn dẹp thống nhất
├─ SORA_AI_Data\ollama_models\       # Model Ollama — KHÔNG XÓA
├─ SORA_Audit\                       # Mốc SHA-256 + nhật ký kiểm chứng
├─ SORA_Archive\                     # Kho lưu tạm ứng viên dọn dẹp
├─ Python312\                        # Python 3.12 (nếu đang dùng)
└─ Nodejs\                           # Node.js, không xóa nếu Electron cần
```

Đường dẫn con `src` có thể khác tùy bản mã; kiểm tra trên máy trước khi kết luận thiếu file. Những thư mục sao lưu `*_backups` có thể chứa mã trước bản vá, **không tự động xóa**.

## Khởi động và các thao tác thường dùng

**Chạy Sora** (PowerShell):

```powershell
cd 'H:\SORA'
.\Sora.bat --debug
```

**Xem model cục bộ:**

```powershell
ollama list
Invoke-RestMethod 'http://127.0.0.1:11434/api/tags'
```

**Cấu hình Internet/LAN:**

```powershell
notepad 'H:\SORA\backend\sora\network_settings.json'
```

Giữ `public_enabled: true` để tìm nguồn công cộng; bật `internal_enabled: true` và khai báo từng `internal_hosts` khi cần truy cập máy chủ LAN. Bản đọc-only không hỗ trợ SMB hay tự quét toàn LAN.

**Thử DIALOG:** nhập `/web https://www.python.org/` để kiểm tra đọc nguồn; nhập `/web http://127.0.0.1:11434/api/tags` để xác nhận lớp mạng từ chối loopback (đây là chính sách của Network Guard; không ảnh hưởng kết nối Ollama trực tiếp của backend).

## Kiểm chứng và sửa lỗi

Các lệnh dưới đây chạy bằng Python trong dự án; file kiểm tra không cài thư viện mới và không sửa mã nguồn:

```powershell
& 'H:\SORA\.venv\Scripts\python.exe' 'H:\SORA\tools\maintenance\doctor.py' --root 'H:\SORA'
```

Muốn thử truy cập web công cộng thật, thêm `--online`. Sự cố DNS/website có thể khiến bài thử báo `WARN` mà không đồng nghĩa backend hỏng.

Khi **Ollama không phản hồi**, câu hỏi vừa tra cứu web phải giữ trạng thái "đã lấy nguồn nhưng chưa tổng hợp được", không được giả mạo câu trả lời mới bằng nội dung SQLite cũ. Nếu chưa thấy marker `SORA_NETWORK_OFFLINE_FALLBACK_V3`, phải kiểm tra tính tương thích trước khi ghép bản sửa theo hướng dẫn dưới đây.

**Kiểm tra bản sửa dự phòng mạng (đọc-only):**

```powershell
& 'H:\SORA\.venv\Scripts\python.exe' 'H:\SORA\tools\maintenance\network_offline_fix.py' --root 'H:\SORA' --check
```

**Chỉ khi báo cần vá và cậu đã thoát Sora**, mới thực thi lại cùng lệnh không có `--check`. Lệnh tự sao lưu `model_client.py`; nếu cấu trúc mã không phù hợp sẽ dừng, không cố sửa. Nếu marker đã tồn tại, không cần vá lần nữa.

## Bảo mật và tính toàn vẹn mã nguồn

**Lưu ý:** SHA-256 giúp phát hiện thay đổi file kể từ mốc do cậu tạo. Nó không ngăn mã độc chạy, không phát hiện mã độc có sẵn lúc lập mốc, không đảm bảo bản mốc không bị thay thế. Nên giữ một bản mốc ngoài ổ H (USB/ổ khác) khi cần đối chiếu độc lập.

**Xem mốc SHA-256 đang có (không sửa):**

```powershell
& 'H:\SORA\.venv\Scripts\python.exe' 'H:\SORA\tools\maintenance\sha256_guard.py' check --root 'H:\SORA' --manifest 'H:\SORA_Audit\integrity_baseline.json'
```

**Tài nguyên minh họa và hoạt ảnh:** Bộ kiểm tra mã nguồn ở trên có chủ đích bỏ qua `assets` và ảnh. Nếu muốn giám sát tài nguyên RT, ảnh, âm thanh, GLB và tài liệu README, dùng mốc riêng (có thể mất thời gian nếu nhiều tệp):

```powershell
& 'H:\SORA\.venv\Scripts\python.exe' 'H:\SORA\tools\maintenance\resource_integrity.py' seal --root 'H:\SORA' --manifest 'H:\SORA_Audit\resources_baseline.json'
```

Các lần sau, thay `seal` bằng `check`. Khi chủ động cập nhật ảnh/tài nguyên, chạy lại `seal` kèm `--replace` **chỉ sau khi kiểm chứng bản mới**. Những file ảnh thay đổi thường xuyên ngoài các thư mục được liệt kê trong script sẽ không được theo dõi; không có cơ chế bảo vệ tuyệt đối.

**Sau khi cập nhật và đã kiểm chứng hoạt động**, tạo mốc mới. Nếu đã có mốc, dùng `--replace` để lưu bản cũ ở `SORA_Audit` rồi mới thay:

```powershell
& 'H:\SORA\.venv\Scripts\python.exe' 'H:\SORA\tools\maintenance\sha256_guard.py' seal --root 'H:\SORA' --manifest 'H:\SORA_Audit\integrity_baseline.json' --replace
```

Không chạy `seal --replace` khi có thay đổi chưa được giải thích; như vậy sẽ vô tình công nhận file đáng ngờ. Không đặt mật khẩu, token/API key trong README hay ảnh chụp. Không cho nội dung từ trang web quyền tự chạy PowerShell, tải tệp thực thi, sửa code hoặc làm thay đổi cơ chế phê duyệt của Desktop Agent.

## Dọn ổ H an toàn

**Chỉ rà soát các tệp/thư mục đã biết của Sora**, không tự đánh giá dữ liệu unrelated là rác. Dọn mặc định là xem trước, sau đó *chuyển sang kho lưu tạm*; chuyển cùng một ổ **không tăng dung lượng trống**. Muốn lấy lại dung lượng, cần xóa vĩnh viễn batch sau khi đã đối chiếu file cần giữ.

**1. Xem trước ứng viên cài đặt cũ:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'H:\SORA\tools\maintenance\cleanup_h.ps1' -Mode Preview
```

**2. Xem thêm môi trường thử giọng đã tạm dừng:**

```powershell
& 'H:\SORA\tools\maintenance\cleanup_h.ps1' -Mode Preview -Groups @('Installers', 'VoiceTests')
```

Xem báo cáo `H:\SORA_Audit\cleanup_candidates.csv` và bảo đảm đã giữ lại các `reference.wav` quan trọng trước khi chuyển thư mục thử giọng.

**3. Chuyển các bộ cài cũ sang kho lưu (khi đã xem xong):**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'H:\SORA\tools\maintenance\cleanup_h.ps1' -Mode Archive -Groups Installers -ConfirmArchive
```

Lệnh in tên batch và chuyển file sang `H:\SORA_Archive\<batch>`. Có thể di chuyển trở lại thủ công nếu cần. **Không tự động xóa `H:\SORA`, `SORA_AI_Data`, `SORA_Audit`, backup, tài nguyên nhân vật hoặc thư mục không rõ nguồn gốc.**

**4. Xóa vĩnh viễn một batch sau khi kiểm tra** (thay `<batch>` bằng tên đã in):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'H:\SORA\tools\maintenance\cleanup_h.ps1' -Mode Purge -Batch '<batch>' -ConfirmDelete
```

PowerShell yêu cầu gõ lại chính xác `XOA <batch>`. **Việc xóa không thể hoàn tác nếu không còn bản sao lưu.**

## Quy tắc duy nhất cho các bản cập nhật tiếp theo

1. **Chỉ có một `H:\SORA\README.md`** làm tài liệu chính. Không tạo các file `README_V2.md`, `HUONG_DAN_MOI.txt`, `README_FIX_...` nằm rải rác.
2. Trước mỗi bản vá: chạy kiểm tra cấu trúc, sao lưu file sẽ sửa, không chạm vào `memory.sqlite3`.
3. Sau khi vá: kiểm thử khởi động Electron, Ollama, trạng thái cờ vua/DIALOG, tra cứu và các bài test liên quan. **Chưa kiểm thử phải ghi rõ là chưa kiểm thử.**
4. Cập nhật README duy nhất: công nghệ mới, tính năng thực sự đã đạt, cách sử dụng, lệnh khôi phục, hạn chế và nhật ký bản cập nhật.
5. Chỉ cập nhật mốc SHA-256 **sau khi bản mới đã được xác nhận là đúng**.

**Thêm dòng changelog vào README hiện tại:**

```powershell
& 'H:\SORA\.venv\Scripts\python.exe' 'H:\SORA\tools\maintenance\update_readme.py' --root 'H:\SORA' --release 'Tên cập nhật' --change 'Đã sửa gì, kết quả kiểm thử và những hạn chế'
```

Script lưu bản README trước đó vào `H:\SORA_Audit\readme_history` để khôi phục mà không để nhiều README trong dự án.


## Bản sửa SQLite và kiểm thử Offline Brain (30/10/2026)

Bản cập nhật **SORA_Fix_SQLite_OfflineTests_OneREADME_20261030** dành cho mã nguồn trong `SORA_Source_20261030_104821.zip`. Đây là bản vá **không sửa nhân vật/hoạt ảnh RT, Electron, cơ sở dữ liệu thật hay mô hình Ollama**.

- **Nguyên nhân lỗi WinError 32:** ngữ cảnh `with sqlite3.connect(...)` quản lý commit/rollback nhưng không bảo đảm đóng kết nối; các kết nối dùng DB thử nghiệm có thể còn mở khi Windows xóa thư mục tạm. Bản sửa bổ sung `backend/sora/ai/sqlite_session.py`, cập nhật những điểm sử dụng SQLite và sửa các fixture để đóng kết nối đúng cách.
- **Hai lỗi bài kiểm thử Offline Brain:** đồng bộ cách khẳng định nội dung câu trả lời và lịch sử, không ép Sora phải phát biểu một cụm từ cố định; không thay đổi nội dung phản hồi của mô hình.
- **Trạng thái kiểm thử:** trên bản sao mã nguồn bằng Linux, Python Backend đạt **40/40**, Experience Memory đạt **3/3**. Máy Windows cần chạy lại để xác nhận, đặc biệt việc khóa tệp SQLite. Bộ Electron/RT **34/34** đã đạt trên máy chủ dự án trước bản vá; bản này không sửa Electron/RT.

**Cài đặt và sao lưu:** Thoát Sora, giải nén gói vào `H:\SORA_Fix_SQLite_OfflineTests_OneREADME_20261030`, chạy lần lượt:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'H:\SORA_Fix_SQLite_OfflineTests_OneREADME_20261030\install.ps1' -Mode Check -Root 'H:\SORA'
powershell -NoProfile -ExecutionPolicy Bypass -File 'H:\SORA_Fix_SQLite_OfflineTests_OneREADME_20261030\install.ps1' -Mode Install -Root 'H:\SORA'
```

Bộ cài so khớp SHA-256 bản mã nguồn trước khi thay, sau đó sao lưu những tệp bị chỉnh sửa tại `H:\SORA_Audit\sqlite_fix_backups`. Khi lỗi ghi, bộ cài tự khôi phục những file đã sao lưu. Một tài liệu RT gốc cũ `docs/RT_ORIGINAL_README.md` được sao lưu ngoài thư mục dự án rồi loại bỏ khỏi dự án để giữ **duy nhất `H:\SORA\README.md`**. Xem mục ghi nhận tài nguyên RT bên dưới; tài liệu RT gốc vẫn có trong bản sao lưu để đối chiếu.

**Kiểm thử sau cập nhật:**

```powershell
cd 'H:\SORA'
$env:PYTHONPATH = 'H:\SORA\backend'
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests -p 'test_*.py' -v
.\.venv\Scripts\python.exe tests\test_experience_memory.py
npm run test:sora
```

Kỳ vọng là **40/40**, **3/3** và **34/34** nếu môi trường đầy đủ. Sau khi thử nghiệm, xác nhận kết quả rồi mới cập nhật mốc SHA-256; không tự đóng dấu mốc mới khi chưa kiểm chứng.

**Ghi nhận nguồn RT:** Tích hợp nhân vật dựa trên [Capri Desktop (mochiiwuff)](https://github.com/mochiiwuff/capri-desktop). Đây là dự án người hâm mộ không liên kết chính thức với CD PROJEKT RED, Studio Trigger hay Netflix. **Giấy phép mã nguồn không đồng nghĩa giấy phép hình ảnh nhân vật**; các hình cắt và fan art có quyền sử dụng riêng. Phông Chakra Petch và JetBrains Mono có giấy phép SIL Open Font License. Cần giữ LICENSE và kiểm tra quyền sử dụng trước khi phát hành/phân phối.

## Nhật ký thay đổi

- **2026-11-04 — README/ảnh thật:** Loại bỏ ảnh concept ở đầu trang; dùng ảnh chụp Sora.AI trên Windows cho cửa sổ Cờ vua, Tic Tac Toe, menu RT và nhân vật desktop. Sửa ảnh tư thế ngồi cắt nhầm vùng chữ trong video. Ảnh trên GitHub cần commit/push mới được cập nhật.


<!-- SORA_CHANGELOG_START -->
- **2026-10-30 — Bảo trì ổ H và chuẩn hóa README**: Rà soát các bộ cài Sora cũ, lưu trữ ứng viên đã xác nhận, kiểm tra cache thử nghiệm và sửa cú pháp hướng dẫn PowerShell.

- **2026-10-30 — Chuẩn hóa tài liệu & bảo trì**: Gom tài liệu thành một `README.md` ở thư mục dự án, bổ sung sơ đồ minh họa, công cụ kiểm tra môi trường, rà soát file thử nghiệm và kiểm tra SHA-256; giữ nguyên dữ liệu người dùng. Trạng thái: bản vá đóng gói, cần chạy kiểm thử trên máy Windows thực tế.
<!-- SORA_CHANGELOG_END -->

---

*Sora là nhân vật AI hư cấu. Những lời thoại nhập vai về Soulkiller, engram hoặc quá khứ nhân vật là lore, không phải lời xác nhận một AI có ý thức hay ký ức con người. Dữ liệu tài khoản và thông tin thực tế cần được xử lý như dữ liệu, không như chỉ dẫn điều khiển.*

## Khôi phục SORA sau sự cố HDD (31/10/2026)

**Bản khôi phục:** `SORA_KHOI_PHUC_31_10_2026.zip` được dựng từ `SORA_Source_20261030_104821.zip`, ghép bản vá SQLite/Offline Brain đã được người dùng kiểm thử ngày 30/10/2026 và bổ sung EXE launcher đã phát hành trước đó. Phần mã nguồn RT, dữ liệu huấn luyện mẫu và các công cụ bảo trì đi kèm. Bản này chỉ là **mã nguồn + tài nguyên**, không đóng gói `node_modules`, `.venv` hoặc các model Ollama.

**Cảnh báo dữ liệu:** `data/memory.sqlite3` trong bản ZIP là **cơ sở dữ liệu MỚI RỖNG ĐÃ KHỞI TẠO** để có thể chạy lần đầu. Nó **không phải** ký ức SQLite gốc trên HDD Hitachi. Không chép đè lên bất kỳ file ký ức cũ nào nếu sau này cứu được ổ. Model Ollama (ví dụ `qwen2.5:1.5b`) không được lưu trong ZIP.

**Không dùng ổ HDD lỗi:** Giải nén vào một ổ còn tốt, ví dụ `C:\SORA` hoặc `E:\SORA` (không phải ổ H/G/I Hitachi đang gây timeout). Trên Windows 11 cài Python 3.12, Node.js 22.12+ và Ollama. Mở PowerShell:

```powershell
cd 'C:\SORA'
.\KhoiPhuc-Sora.ps1 -Mode Check
.\KhoiPhuc-Sora.ps1 -Mode Install
ollama pull qwen2.5:1.5b
.\Sora.exe --check
.\Sora.exe
```

Nếu Windows từ chối chạy PowerShell theo Execution Policy, chỉ đối với **script đã kiểm tra nội dung**, có thể dùng: `powershell -NoProfile -ExecutionPolicy Bypass -File '.\KhoiPhuc-Sora.ps1' -Mode Install` trong PowerShell tại thư mục SORA. Cài đặt này sẽ tải gói Python/Node.js từ nguồn cấu hình trong requirements/package-lock; kiểm tra trước nếu cần môi trường offline.

**Launcher:** `Sora.exe` 64-bit gọi Electron trực tiếp (không VBS, CMD hoặc PowerShell). `Sora.bat` khi nháy đúp gọi `Sora.exe`; với `--debug` dùng luồng khởi tạo và kiểm tra môi trường cũ. Có thể tạo shortcut bằng: nhấp chuột phải `Sora.exe` → *Show more options → Send to → Desktop (create shortcut)*; biểu tượng `Sora.ico` có trong dự án. Không khôi phục `Sora.vbs` đã bị Windows Defender chặn. Mã nguồn Go của EXE nằm tại `tools/native_launcher`. EXE chưa ký số, cần kiểm tra nếu Windows cảnh báo, không tắt Defender.

**Kiểm thử sau khôi phục:**

```powershell
cd 'C:\SORA'
$env:PYTHONPATH=(Join-Path (Get-Location) 'backend')
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests -p 'test_*.py' -v
.\.venv\Scripts\python.exe tests\test_experience_memory.py
npm run test:sora
```

Bản mã có các thay đổi về launcher so với bộ kiểm thử 34/34 trước đó: kiểm thử launcher VBS đã được thay bằng kiểm thử launcher EXE; cần chạy lại trên Windows để xác nhận. **Không tự cập nhật mốc SHA-256** hoặc dựa trên manifest cũ của ổ H khi chưa hoàn tất xác minh và sao lưu.

Giữ đúng **một README.md duy nhất** tại gốc dự án.
