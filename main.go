// Package main - 日程安排助手服务端程序
// 提供静态文件服务和数据持久化API
package main

import (
	"embed"         // 用于嵌入静态文件到可执行文件
	"encoding/json" // JSON序列化/反序列化
	"fmt"           // 格式化输出
	"io/ioutil"     // 文件读写操作
	"mime"          // MIME类型处理
	"net/http"      // HTTP服务
	"os"            // 操作系统接口
	"path/filepath" // 文件路径处理

	"gopkg.in/yaml.v2" // YAML解析库
)

// WorkdayConfig - 工作日/周末时间配置
type WorkdayConfig struct {
	Start string `yaml:"start" json:"start"` // 开始时间（格式：HH:MM）
	End   string `yaml:"end" json:"end"`     // 结束时间（格式：HH:MM）
	Title string `yaml:"title" json:"title"` // 时间段标题
}

// Config - 应用程序配置结构体
type Config struct {
	Username        string        `yaml:"username" json:"username"`               // 用户名（作为数据文件名）
	RowHeight       int           `yaml:"rowHeight" json:"rowHeight"`             // 时间轴行高（像素）
	SlotMinutes     int           `yaml:"slotMinutes" json:"slotMinutes"`         // 时间槽大小（分钟）
	DragSnapMinutes int           `yaml:"dragSnapMinutes" json:"dragSnapMinutes"` // 拖拽吸附时间（分钟）
	MinZoom         float64       `yaml:"minZoom" json:"minZoom"`                 // 最小缩放比例
	MaxZoom         float64       `yaml:"maxZoom" json:"maxZoom"`                 // 最大缩放比例
	ZoomStep        float64       `yaml:"zoomStep" json:"zoomStep"`               // 缩放步长
	Workday         WorkdayConfig `yaml:"workday" json:"workday"`                 // 工作日配置
	Weekend         WorkdayConfig `yaml:"weekend" json:"weekend"`                 // 周末配置
}

// LoadDataResponse - 加载数据API响应结构
type LoadDataResponse struct {
	Config Config                  `json:"config"`         // 配置信息
	Data   *map[string]interface{} `json:"data,omitempty"` // 用户数据（可选）
}

// 全局变量
var config Config      // 应用配置实例
var dataDir = "./data" // 数据文件存储目录
var webDir = "./web"   // 静态文件服务目录

//go:embed html/**
var htmlFiles embed.FS // 嵌入的HTML静态文件

// loadYAMLConfig - 从config.yaml文件加载配置
func loadYAMLConfig() error {
	// 读取配置文件内容
	data, err := ioutil.ReadFile("config.yaml")
	if err != nil {
		return fmt.Errorf("读取配置文件失败: %v", err)
	}
	// 解析YAML到config结构体
	err = yaml.Unmarshal(data, &config)
	if err != nil {
		return fmt.Errorf("解析YAML失败: %v", err)
	}
	return nil
}

// extractWebFiles - 解压嵌入的静态文件到web目录
func extractWebFiles() error {
	// 检查web目录是否存在，不存在则创建
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		fmt.Println("创建 web 目录...")
		if err := os.MkdirAll(webDir, 0755); err != nil {
			return fmt.Errorf("创建 web 目录失败: %v", err)
		}
	}

	// 尝试读取嵌入的index.html文件验证嵌入是否成功
	_, err := htmlFiles.ReadFile("html/index.html")
	if err != nil {
		return fmt.Errorf("读取嵌入文件失败: %v", err)
	}

	// 递归解压整个html目录
	err = extractDir(htmlFiles, "html", webDir)
	if err != nil {
		return fmt.Errorf("解压文件失败: %v", err)
	}

	fmt.Println("静态文件已解压到 web 目录")
	return nil
}

// extractDir - 从embed.FS递归解压目录到目标路径
// fsys: 嵌入文件系统
// srcDir: 源目录（嵌入文件系统中的路径）
// destDir: 目标目录（磁盘路径）
func extractDir(fsys embed.FS, srcDir, destDir string) error {
	// 读取源目录内容
	entries, err := fsys.ReadDir(srcDir)
	if err != nil {
		return fmt.Errorf("读取目录 %s 失败: %v", srcDir, err)
	}

	// 遍历每个条目
	for _, entry := range entries {
		srcPath := filepath.ToSlash(filepath.Join(srcDir, entry.Name()))
		destPath := filepath.Join(destDir, entry.Name())

		if entry.IsDir() {
			// 如果是目录，递归处理
			if err := os.MkdirAll(destPath, 0755); err != nil {
				return fmt.Errorf("创建目录 %s 失败: %v", destPath, err)
			}
			if err := extractDir(fsys, srcPath, destPath); err != nil {
				return err
			}
		} else {
			// 如果是文件，读取并写入目标路径
			content, err := fsys.ReadFile(srcPath)
			if err != nil {
				return fmt.Errorf("读取文件 %s 失败: %v", srcPath, err)
			}
			if err := ioutil.WriteFile(destPath, content, 0644); err != nil {
				return fmt.Errorf("写入文件 %s 失败: %v", destPath, err)
			}
		}
	}
	return nil
}

// LoadDataHandler - 处理加载数据请求（GET /api/loaddata）
func LoadDataHandler(w http.ResponseWriter, r *http.Request) {
	// 只允许GET方法
	if r.Method != http.MethodGet {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	// 构建响应对象，包含配置信息
	response := LoadDataResponse{
		Config: config,
	}

	// 构建数据文件路径（用户名.json）
	filename := fmt.Sprintf("%s.json", config.Username)
	filepath := filepath.Join(dataDir, filename)

	// 如果数据文件存在，读取并解析
	if _, err := os.Stat(filepath); err == nil {
		data, err := ioutil.ReadFile(filepath)
		if err == nil {
			var jsonData map[string]interface{}
			if err := json.Unmarshal(data, &jsonData); err == nil {
				response.Data = &jsonData
			}
		}
	}

	// 设置响应头（支持CORS）
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	// 序列化并输出响应
	json.NewEncoder(w).Encode(response)
}

// SaveDataHandler - 处理保存数据请求（POST /api/savedata）
func SaveDataHandler(w http.ResponseWriter, r *http.Request) {
	// 只允许POST方法
	if r.Method != http.MethodPost {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	// 解析请求体JSON
	var requestData map[string]interface{}
	err := json.NewDecoder(r.Body).Decode(&requestData)
	if err != nil {
		http.Error(w, "请求体解析失败", http.StatusBadRequest)
		return
	}

	// 确保数据目录存在
	err = os.MkdirAll(dataDir, 0755)
	if err != nil {
		http.Error(w, "创建数据目录失败", http.StatusInternalServerError)
		return
	}

	// 构建数据文件路径
	filename := fmt.Sprintf("%s.json", config.Username)
	filepath := filepath.Join(dataDir, filename)

	// 序列化数据（带缩进的JSON格式）
	data, err := json.MarshalIndent(requestData, "", "  ")
	if err != nil {
		http.Error(w, "JSON序列化失败", http.StatusInternalServerError)
		return
	}

	// 写入文件
	err = ioutil.WriteFile(filepath, data, 0644)
	if err != nil {
		http.Error(w, "保存文件失败", http.StatusInternalServerError)
		return
	}

	// 设置响应头并返回成功状态
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success": true}`))
}

// OptionsHandler - 处理OPTIONS预检请求（用于CORS）
func OptionsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.WriteHeader(http.StatusOK)
}

// main - 程序入口函数
func main() {
	// 加载配置文件
	err := loadYAMLConfig()
	if err != nil {
		fmt.Printf("加载配置失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("配置加载成功，用户名: %s\n", config.Username)

	// 解压静态文件到web目录
	if err := extractWebFiles(); err != nil {
		fmt.Printf("解压静态文件失败: %v\n", err)
		os.Exit(1)
	}

	// 注册SVG MIME类型（解决SVG图标显示问题）
	mime.AddExtensionType(".svg", "image/svg+xml")

	// 注册API路由
	http.HandleFunc("/api/loaddata", LoadDataHandler)
	http.HandleFunc("/api/savedata", SaveDataHandler)
	http.HandleFunc("/api/loaddata/", OptionsHandler)
	http.HandleFunc("/api/savedata/", OptionsHandler)

	// 注册静态文件服务
	http.Handle("/", http.FileServer(http.Dir(webDir)))

	// 启动HTTP服务
	fmt.Println("服务启动，监听端口 8080...")
	fmt.Println("访问地址: http://localhost:8080")
	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		fmt.Printf("服务启动失败: %v\n", err)
	}
}
