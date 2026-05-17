# 日程安排助手

一个基于 Go 语言和 Web 技术开发的日程安排管理工具，支持任务拖拽、时间规划和数据持久化。

## 功能特性

- 📅 **日程管理**：支持按天查看和管理日程安排
- ✅ **任务管理**：添加、编辑和删除待办任务
- 🖱️ **拖拽操作**：将任务拖放到时间轴上进行时间安排
- 🔄 **方向切换**：支持横向和纵向时间轴显示
- 🔍 **缩放功能**：支持时间轴缩放查看
- 💾 **数据持久化**：任务数据自动保存到本地
- ⏰ **实时时钟**：显示当前时间

## 项目结构

```
schedule/
├── html/              # 嵌入的静态资源（编译时嵌入）
│   ├── index.html     # 主页面
│   ├── app.js         # 前端逻辑
│   ├── styles.css     # 样式文件
│   └── *.svg          # 图标文件
├── web/               # 静态文件解压目录（运行时生成）
├── data/              # 数据存储目录
│   └── {username}.json # 用户数据文件
├── config.yaml        # 配置文件
├── main.go            # 主程序入口
├── go.mod             # Go 模块依赖
├── go.sum             # 模块校验和
└── Dockerfile         # Docker 构建文件
```

## 配置说明

`config.yaml` 配置文件说明：

```yaml
username: "Anders"           # 用户名（用于数据文件命名）
rowHeight: 60               # 时间轴行高度（像素）
slotMinutes: 30             # 时间槽间隔（分钟）
dragSnapMinutes: 15         # 拖拽对齐精度（分钟）
minZoom: 0.5               # 最小缩放比例
maxZoom: 2.0               # 最大缩放比例
zoomStep: 0.1              # 缩放步长
workday:                   # 工作日配置
  start: "08:00"           # 开始时间
  end: "18:00"             # 结束时间
  title: "工作日"           # 显示标题
weekend:                   # 周末配置
  start: "09:00"           # 开始时间
  end: "17:00"             # 结束时间
  title: "周末"             # 显示标题
```

## 编译说明

### 环境要求

- Go 1.21 或更高版本

### Windows 编译

```bash
go build -o schedule.exe main.go
```

### macOS 编译

```bash
go build -o schedule main.go
```

### Linux 编译

```bash
go build -o schedule main.go
```

### ARMv7 32位架构编译

```bash
# Linux ARMv7
GOOS=linux GOARCH=arm GOARM=7 go build -o schedule main.go

# Raspberry Pi 等 ARM 设备
GOOS=linux GOARCH=arm GOARM=7 go build -o schedule main.go
```

### 跨平台编译示例

```bash
# Windows 32位
GOOS=windows GOARCH=386 go build -o schedule.exe main.go

# Windows 64位
GOOS=windows GOARCH=amd64 go build -o schedule.exe main.go

# macOS ARM64 (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o schedule main.go

# macOS Intel
GOOS=darwin GOARCH=amd64 go build -o schedule main.go

# Linux ARM64
GOOS=linux GOARCH=arm64 go build -o schedule main.go
```

## 运行说明

### 直接运行

编译完成后，直接执行二进制文件：

```bash
# Windows
schedule.exe

# macOS/Linux
./schedule
```

运行后访问：http://localhost:8080

### Docker 运行

#### 构建镜像

```bash
docker build -t schedule-app .
```

#### 启动容器

```bash
docker run -d \
  -p 8080:8080 \
  -v /path/to/web:/app/web \
  -v /path/to/data:/app/data \
  --name schedule-container \
  schedule-app
```

**参数说明：**
- `-p 8080:8080`：端口映射
- `-v /path/to/web:/app/web`：挂载静态文件目录
- `-v /path/to/data:/app/data`：挂载数据目录（持久化存储）
- `--name schedule-container`：容器名称

#### Windows PowerShell 示例

```powershell
docker run -d -p 8080:8080 -v ${PWD}\web:/app/web -v ${PWD}\data:/app/data --name schedule-container schedule-app
```

## 使用说明

1. **添加任务**：在左侧面板点击"添加任务"按钮
2. **安排时间**：将任务拖拽到右侧时间轴的对应时间段
3. **调整时间**：拖动已安排任务的边缘调整时长，或拖动任务整体调整位置
4. **删除任务**：点击任务卡片右上角的删除按钮
5. **切换方向**：点击工具栏的旋转按钮切换时间轴方向
6. **缩放视图**：使用放大/缩小按钮调整时间轴显示比例

## 技术栈

- **后端**：Go 1.21+
- **前端**：HTML5 + JavaScript + CSS3
- **图标**：SVG
- **配置**：YAML
- **数据存储**：JSON 文件

## License

MIT License