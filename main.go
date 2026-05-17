package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"mime"
	"net/http"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v2"
)

type WorkdayConfig struct {
	Start string `yaml:"start" json:"start"`
	End   string `yaml:"end" json:"end"`
	Title string `yaml:"title" json:"title"`
}

type Config struct {
	Username        string        `yaml:"username" json:"username"`
	RowHeight       int           `yaml:"rowHeight" json:"rowHeight"`
	SlotMinutes     int           `yaml:"slotMinutes" json:"slotMinutes"`
	DragSnapMinutes int           `yaml:"dragSnapMinutes" json:"dragSnapMinutes"`
	MinZoom         float64       `yaml:"minZoom" json:"minZoom"`
	MaxZoom         float64       `yaml:"maxZoom" json:"maxZoom"`
	ZoomStep        float64       `yaml:"zoomStep" json:"zoomStep"`
	Workday         WorkdayConfig `yaml:"workday" json:"workday"`
	Weekend         WorkdayConfig `yaml:"weekend" json:"weekend"`
}

type LoadDataResponse struct {
	Config Config                  `json:"config"`
	Data   *map[string]interface{} `json:"data,omitempty"`
}

var config Config
var dataDir = "./data"
var webDir = "./web"

//go:embed html/**
var htmlFiles embed.FS

func loadYAMLConfig() error {
	data, err := ioutil.ReadFile("config.yaml")
	if err != nil {
		return fmt.Errorf("读取配置文件失败: %v", err)
	}
	err = yaml.Unmarshal(data, &config)
	if err != nil {
		return fmt.Errorf("解析YAML失败: %v", err)
	}
	return nil
}

func extractWebFiles() error {
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		fmt.Println("创建 web 目录...")
		if err := os.MkdirAll(webDir, 0755); err != nil {
			return fmt.Errorf("创建 web 目录失败: %v", err)
		}
	}

	entries, err := htmlFiles.ReadFile("html/index.html")
	if err != nil {
		return fmt.Errorf("读取嵌入文件失败: %v", err)
	}
	_ = entries

	localHtmlDir := "html"

	err = filepath.Walk(localHtmlDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			relPath, _ := filepath.Rel(localHtmlDir, path)
			if relPath != "." {
				targetDir := filepath.Join(webDir, relPath)
				os.MkdirAll(targetDir, 0755)
			}
			return nil
		}

		relPath, _ := filepath.Rel(localHtmlDir, path)
		targetPath := filepath.Join(webDir, relPath)

		embedPath := filepath.ToSlash(filepath.Join(localHtmlDir, relPath))

		content, err := htmlFiles.ReadFile(embedPath)
		if err != nil {
			return fmt.Errorf("读取嵌入文件 %s 失败: %v", embedPath, err)
		}

		if err := ioutil.WriteFile(targetPath, content, 0644); err != nil {
			return fmt.Errorf("写入文件 %s 失败: %v", targetPath, err)
		}

		return nil
	})

	if err != nil {
		return fmt.Errorf("解压文件失败: %v", err)
	}

	fmt.Println("静态文件已解压到 web 目录")
	return nil
}

func LoadDataHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	response := LoadDataResponse{
		Config: config,
	}

	filename := fmt.Sprintf("%s.json", config.Username)
	filepath := filepath.Join(dataDir, filename)

	if _, err := os.Stat(filepath); err == nil {
		data, err := ioutil.ReadFile(filepath)
		if err == nil {
			var jsonData map[string]interface{}
			if err := json.Unmarshal(data, &jsonData); err == nil {
				response.Data = &jsonData
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	json.NewEncoder(w).Encode(response)
}

func SaveDataHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	var requestData map[string]interface{}
	err := json.NewDecoder(r.Body).Decode(&requestData)
	if err != nil {
		http.Error(w, "请求体解析失败", http.StatusBadRequest)
		return
	}

	err = os.MkdirAll(dataDir, 0755)
	if err != nil {
		http.Error(w, "创建数据目录失败", http.StatusInternalServerError)
		return
	}

	filename := fmt.Sprintf("%s.json", config.Username)
	filepath := filepath.Join(dataDir, filename)

	data, err := json.MarshalIndent(requestData, "", "  ")
	if err != nil {
		http.Error(w, "JSON序列化失败", http.StatusInternalServerError)
		return
	}

	err = ioutil.WriteFile(filepath, data, 0644)
	if err != nil {
		http.Error(w, "保存文件失败", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success": true}`))
}

func OptionsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.WriteHeader(http.StatusOK)
}

func main() {
	err := loadYAMLConfig()
	if err != nil {
		fmt.Printf("加载配置失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("配置加载成功，用户名: %s\n", config.Username)

	if err := extractWebFiles(); err != nil {
		fmt.Printf("解压静态文件失败: %v\n", err)
		os.Exit(1)
	}

	mime.AddExtensionType(".svg", "image/svg+xml")

	http.HandleFunc("/api/loaddata", LoadDataHandler)
	http.HandleFunc("/api/savedata", SaveDataHandler)
	http.HandleFunc("/api/loaddata/", OptionsHandler)
	http.HandleFunc("/api/savedata/", OptionsHandler)

	http.Handle("/", http.FileServer(http.Dir(webDir)))

	fmt.Println("服务启动，监听端口 8080...")
	fmt.Println("访问地址: http://localhost:8080")
	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		fmt.Printf("服务启动失败: %v\n", err)
	}
}
