// Sora native launcher for Windows.
// Starts the user's own local Ollama server when it is not already running.
// No shell, VBS, admin rights, Windows service, registry edits, model downloads,
// remote execution, antivirus changes or scheduled startup.
package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	appName         = "Sora"
	localOllamaAPI  = "http://127.0.0.1:11434/api/tags"
	localOllamaHost = "127.0.0.1:11434"
	requiredModel   = "qwen2.5:1.5b"
	// Windows CREATE_NO_WINDOW: do not flash a CMD window when Ollama starts.
	createNoWindow = 0x08000000
)

var (
	user32     = syscall.NewLazyDLL("user32.dll")
	messageBox = user32.NewProc("MessageBoxW")
	// Never inherit the user's HTTP_PROXY for local Ollama requests.
	ollamaHTTP = &http.Client{
		Timeout: 1200 * time.Millisecond,
		Transport: &http.Transport{
			Proxy:             nil,
			DisableKeepAlives: true,
			DialContext:       (&net.Dialer{Timeout: 800 * time.Millisecond}).DialContext,
		},
	}
)

func pop(title, message string, isError bool) {
	title16, _ := syscall.UTF16PtrFromString(title)
	msg16, _ := syscall.UTF16PtrFromString(message)
	flag := uintptr(0x40)
	if isError {
		flag = 0x10
	}
	messageBox.Call(0, uintptr(unsafe.Pointer(msg16)), uintptr(unsafe.Pointer(title16)), flag)
}

func relative(root string, parts ...string) string {
	return filepath.Join(append([]string{root}, parts...)...)
}

func rootDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Abs(filepath.Dir(exe))
}

func requireFile(path, friendly string) error {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return fmt.Errorf("Thiếu %s:\n%s", friendly, path)
	}
	return nil
}

func check(root string) (string, string, error) {
	electron := relative(root, "node_modules", "electron", "dist", "electron.exe")
	python := relative(root, ".venv", "Scripts", "python.exe")
	probes := []struct{ path, label string }{
		{relative(root, "package.json"), "package.json"},
		{relative(root, "src", "main", "main.js"), "Electron main.js"},
		{relative(root, "src", "renderer", "index.html"), "giao diện RT"},
		{relative(root, "assets", "sora", "sora-full.png"), "nhân vật RT"},
		{electron, "Electron.exe"},
		{python, "Python (.venv)"},
		{relative(root, "data", "memory.sqlite3"), "SQLite ký ức"},
	}
	for _, p := range probes {
		if err := requireFile(p.path, p.label); err != nil {
			return "", "", err
		}
	}
	return electron, python, nil
}

func appendLog(root, message string) {
	folder := relative(root, "logs")
	if err := os.MkdirAll(folder, 0755); err != nil {
		return
	}
	f, err := os.OpenFile(relative(folder, "SoraLauncher.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s: %s\n", time.Now().Format(time.RFC3339), message)
}

func getenvSet(env []string, key, value string) []string {
	prefix := strings.ToUpper(key) + "="
	output := make([]string, 0, len(env)+1)
	for _, entry := range env {
		if !strings.HasPrefix(strings.ToUpper(entry), prefix) {
			output = append(output, entry)
		}
	}
	return append(output, key+"="+value)
}

func localModelDir(root string) string {
	return relative(filepath.Dir(root), "OllamaModels")
}

// Probe the actual HTTP API, not just the existence of an ollama.exe process.
func probeOllama() (bool, bool) {
	response, err := ollamaHTTP.Get(localOllamaAPI)
	if err != nil {
		return false, false
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return false, false
	}
	var answer struct {
		Models []struct {
			Name  string `json:"name"`
			Model string `json:"model"`
		} `json:"models"`
	}
	if err := json.NewDecoder(response.Body).Decode(&answer); err != nil {
		return false, false
	}
	for _, model := range answer.Models {
		if strings.EqualFold(model.Name, requiredModel) || strings.EqualFold(model.Model, requiredModel) {
			return true, true
		}
	}
	return true, false
}

func apiPortTaken() bool {
	c, err := net.DialTimeout("tcp", localOllamaHost, 500*time.Millisecond)
	if err != nil {
		return false
	}
	c.Close()
	return true
}

// Best effort: launch Sora even when Ollama is missing, slow, or down.
// Never start a second Ollama instance when one already owns the port.
func ensureOllama(root string) {
	if live, hasModel := probeOllama(); live {
		if !hasModel {
			appendLog(root, "Ollama dang chay nhung thieu model "+requiredModel+". Kiem tra OllamaModels hoac Ollama server da chay truoc.")
		}
		return
	}
	if apiPortTaken() {
		appendLog(root, "Cong 11434 dang duoc su dung nhung API Ollama khong tra loi. Khong khoi dong server trung.")
		return
	}

	ollamaExe := relative(filepath.Dir(root), "Ollama", "ollama.exe")
	if err := requireFile(ollamaExe, "Ollama portable"); err != nil {
		appendLog(root, "Chua tim thay Ollama: "+ollamaExe+". Sora van khoi dong ngoai tuyen.")
		return
	}
	modelsDir := localModelDir(root)
	if stat, err := os.Stat(modelsDir); err != nil || !stat.IsDir() {
		appendLog(root, "Chua tim thay thu muc model: "+modelsDir+". Khong tu tai model.")
	}

	cmd := exec.Command(ollamaExe, "serve")
	cmd.Dir = filepath.Dir(ollamaExe)
	env := os.Environ()
	env = getenvSet(env, "OLLAMA_MODELS", modelsDir)
	env = getenvSet(env, "OLLAMA_HOST", localOllamaHost)
	cmd.Env = env
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	// Separate log permits diagnosing startup failures without a CMD window.
	_ = os.MkdirAll(relative(root, "logs"), 0755)
	serverLog, logErr := os.OpenFile(relative(root, "logs", "OllamaServer.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if logErr != nil {
		// mkdir logs already happened in appendLog; start without redirected output if needed.
		appendLog(root, "Khong mo duoc log Ollama: "+logErr.Error())
	} else {
		cmd.Stdout = serverLog
		cmd.Stderr = serverLog
	}
	if err := cmd.Start(); err != nil {
		if serverLog != nil {
			serverLog.Close()
		}
		appendLog(root, "Khong khoi dong duoc Ollama: "+err.Error())
		return
	}
	appendLog(root, "Da khoi dong Ollama ngam (PID "+fmt.Sprint(cmd.Process.Pid)+") bang "+ollamaExe)
	_ = cmd.Process.Release()
	if serverLog != nil {
		serverLog.Close()
	}

	// Ollama usually responds quickly. Bounded wait; never block Sora indefinitely.
	for n := 0; n < 20; n++ {
		if live, hasModel := probeOllama(); live {
			if hasModel {
				appendLog(root, "Ollama da san sang voi model "+requiredModel)
			}
			if !hasModel {
				appendLog(root, "Ollama da khoi dong nhung chua co model "+requiredModel)
			}
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
	appendLog(root, "Ollama chua phan hoi kip. Sora van mo; DIALOG se kiem tra lai ket noi.")
}

func launch(root, electron, python string, debug bool) error {
	cmd := exec.Command(electron, root)
	cmd.Dir = root
	env := os.Environ()
	env = getenvSet(env, "SORA_PYTHON", python)
	env = getenvSet(env, "SORA_MEMORY_DB", relative(root, "data", "memory.sqlite3"))
	env = getenvSet(env, "OLLAMA_HOST", localOllamaHost)
	env = getenvSet(env, "OLLAMA_MODELS", localModelDir(root))
	if debug {
		env = getenvSet(env, "SORA_DEBUG", "1")
	}
	siblingNode := relative(filepath.Dir(root), "Nodejs", "node.exe")
	if _, err := os.Stat(siblingNode); err == nil {
		env = getenvSet(env, "PATH", filepath.Dir(siblingNode)+string(os.PathListSeparator)+os.Getenv("PATH"))
	}
	cmd.Env = env
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

func execute() error {
	root, err := rootDir()
	if err != nil {
		return fmt.Errorf("Không xác định được thư mục Sora: %w", err)
	}
	electron, python, err := check(root)
	if err != nil {
		appendLog(root, err.Error())
		return fmt.Errorf("Sora.exe phải nằm trong thư mục dự án cùng package.json và node_modules.\n\n%w", err)
	}
	var checkOnly, debug bool
	for _, a := range os.Args[1:] {
		switch strings.ToLower(a) {
		case "--check":
			checkOnly = true
		case "--debug":
			debug = true
		default:
			return fmt.Errorf("Tham số không hỗ trợ: %s\n\nHợp lệ: --check, --debug", a)
		}
	}
	if checkOnly {
		pop(appName+" — kiểm tra", "Sẵn sàng khởi động.\n\nThư mục: "+root+"\nElectron: "+electron+"\nPython: "+python+"\nOllama: "+relative(filepath.Dir(root), "Ollama", "ollama.exe")+"\nKý ức: "+relative(root, "data", "memory.sqlite3"), false)
		return nil
	}
	ensureOllama(root)
	if err := launch(root, electron, python, debug); err != nil {
		appendLog(root, "Loi Electron: "+err.Error())
		return fmt.Errorf("Không khởi động được Electron: %w", err)
	}
	return nil
}

func main() {
	if err := execute(); err != nil {
		pop("Sora — lỗi khởi động", err.Error()+"\n\nXem logs\\SoraLauncher.log nếu có.", true)
		os.Exit(1)
	}
}
