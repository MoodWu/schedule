// 本地存储键名
var STORAGE_KEY = "child-schedule-data-v1";
var FILE_HANDLE_DB = "child-schedule-file-db";
var FILE_HANDLE_STORE = "handles";
var FILE_HANDLE_KEY = "json-handle";

// 默认配置
var defaultConfig = {
  username: "Anders",
  rowHeight: 48,
  slotMinutes: 30,
  dragSnapMinutes: 5,
  minZoom: 0.75,
  maxZoom: 2.5,
  zoomStep: 0.25,
  workday: {
    start: "18:00",
    end: "22:00",
    title: "工作日晚上安排"
  },
  weekend: {
    start: "08:00",
    end: "22:00",
    title: "周末全天安排"
  }
};

var config;

// 时间轴缩放比例
var timelineZoom = 1;
// 时间轴方向：vertical（纵向）或 horizontal（横向）
var timelineOrientation = "vertical";
// 是否使用实际时间排序
var useActualTimes = false;
// 是否显示全天时间范围
var isFullDayMode = false;
// 每个卡片的显示状态（key=scheduledId，value=true表示显示准时率，false表示显示准确率）
var cardRateStates = {};
// 触摸事件相关变量
var touchStartTaskId = null;
var touchStartTime = 0;
// 当前正在编辑的任务ID
var editingTaskId = null;
// 当前正在拖拽的任务ID
var draggedTaskId = null;
// 当前活跃的计时器
var activeTimer = null;
// 计时器定时器ID
var tickId = null;
// 文件句柄（用于文件系统API）
var fileHandle = null;
// 自动保存定时器
var saveTimer = null;

// 生成唯一标识符
function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 兼容性：为旧浏览器添加 Array.prototype.find 方法
if (!Array.prototype.find) {
  Array.prototype.find = function(predicate) {
    if (this == null) {
      throw new TypeError('"this" is null or not defined');
    }
    var o = Object(this);
    var len = o.length >>> 0;
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var thisArg = arguments[1];
    var k = 0;
    while (k < len) {
      var kValue = o[k];
      if (predicate.call(thisArg, kValue, k, o)) {
        return kValue;
      }
      k++;
    }
    return undefined;
  };
}

// 兼容性：为旧浏览器添加 Array.prototype.findIndex 方法
if (!Array.prototype.findIndex) {
  Array.prototype.findIndex = function(predicate) {
    if (this == null) {
      throw new TypeError('"this" is null or not defined');
    }
    var o = Object(this);
    var len = o.length >>> 0;
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var thisArg = arguments[1];
    var k = 0;
    while (k < len) {
      var kValue = o[k];
      if (predicate.call(thisArg, kValue, k, o)) {
        return k;
      }
      k++;
    }
    return -1;
  };
}

// 任务类型标签映射
var typeLabels = {
  school: "学校作业",
  home: "家庭作业",
};

// 默认数据结构
var defaultData = {
  days: {},
  records: [],
};

/*
 * JSON数据格式说明
 * 
 * 1. 配置文件格式（config）：
 * {
 *   "username": "Anders",              // 用户名
 *   "rowHeight": 48,                   // 行高（像素）
 *   "slotMinutes": 30,                 // 时间槽大小（分钟）
 *   "dragSnapMinutes": 5,              // 拖拽吸附时间（分钟）
 *   "minZoom": 0.75,                   // 最小缩放比例
 *   "maxZoom": 2.5,                    // 最大缩放比例
 *   "zoomStep": 0.25,                  // 缩放步长
 *   "workday": {                       // 工作日配置
 *     "start": "18:00",                // 开始时间
 *     "end": "22:00",                  // 结束时间
 *     "title": "工作日晚上安排"        // 标题
 *   },
 *   "weekend": {                       // 周末配置
 *     "start": "08:00",
 *     "end": "22:00",
 *     "title": "周末全天安排"
 *   }
 * }
 * 
 * 2. 主数据文件格式（data）：
 * {
 *   "days": {                          // 按日期索引的任务数据
 *     "2026-05-19": {                 // 日期键（YYYY-MM-DD）
 *       "tasks": [                     // 待安排任务列表
 *         {
 *           "id": "uuid-string",      // 任务唯一ID
 *           "title": "任务标题",       // 任务标题
 *           "type": "school",          // 任务类型：school（学校作业）或 home（家庭作业）
 *           "duration": 30,            // 预计时长（分钟）
 *           "description": "任务说明",  // 任务描述（可选）
 *           "createdAt": "2026-05-19T10:30:00.000Z"  // 创建时间（ISO格式）
 *         }
 *       ],
 *       "scheduled": [                 // 已安排到时间轴的任务列表
 *         {
 *           "id": "uuid-string",      // 安排ID
 *           "sourceTaskId": "uuid",     // 源任务ID（关联tasks中的任务）
 *           "title": "任务标题",
 *           "type": "school",
 *           "duration": 30,            // 预计时长（分钟）
 *           "description": "任务说明",
 *           "date": "2026-05-19",     // 安排日期
 *           "start": "18:00",         // 开始时间（HH:MM）
 *           "end": "18:30",           // 结束时间（HH:MM）
 *           "completedRecordId": "uuid"  // 完成记录ID（可选，表示任务已完成）
 *         }
 *       ]
 *     }
 *   },
 *   "records": [                       // 任务完成记录列表
 *     {
 *       "id": "uuid-string",          // 记录唯一ID
 *       "scheduledId": "uuid",         // 关联的已安排任务ID
 *       "date": "2026-05-19",         // 日期
 *       "title": "任务标题",
 *       "type": "school",
 *       "plannedStart": "18:00",      // 计划开始时间
 *       "plannedEnd": "18:30",        // 计划结束时间
 *       "plannedDurationMinutes": 30,  // 计划时长（分钟）
 *       "actualStart": "2026-05-19T10:00:00.000Z",  // 实际开始时间（ISO格式）
 *       "actualEnd": "2026-05-19T10:35:00.000Z",    // 实际结束时间（ISO格式）
 *       "actualElapsedSeconds": 2100,  // 实际总耗时（秒，包含暂停时间）
 *       "actualDurationSeconds": 2000, // 实际有效耗时（秒，不包含暂停时间）
 *       "interruptCount": 1,          // 暂停次数
 *       "interruptedSeconds": 100      // 暂停总时长（秒）
 *     }
 *   ]
 * }
 * 
 * 3. 服务器API数据格式：
 * 
 * 加载数据（GET /api/loaddata）：
 * {
 *   "config": { ... },                // 配置对象（同上）
 *   "data": { ... }                   // 数据对象（同上）
 * }
 * 
 * 保存数据（POST /api/savedata）：
 * {
 *   "config": { ... },                // 配置对象
 *   "days": { ... },                  // days对象
 *   "records": [ ... ]                // records数组
 * }
 * 
 * 响应：
 * {
 *   "success": true                   // 保存成功标志
 * }
 */

var data = null;
var config = null;
var currentDate = toDateInputValue(new Date());
var activeTimer = null;
var tickId = null;
var fileHandle = null;
var saveTimer = null;
var draggedTaskId = null;
var touchStartTaskId = null;
var touchStartTime = 0;
var editingTaskId = null;

var els = {};

function onDOMReady() {
  try {
    els = {
      appTitle: document.querySelector("#appTitle"),
      daySummary: document.querySelector("#daySummary"),
      scheduleTab: document.querySelector("#scheduleTab"),
      timerTab: document.querySelector("#timerTab"),
      scheduleView: document.querySelector("#scheduleView"),
      timerView: document.querySelector("#timerView"),
      dateInput: document.querySelector("#dateInput"),
      chooseFileBtn: document.querySelector("#chooseFileBtn"),
      exportBtn: document.querySelector("#exportBtn"),
      saveStatus: document.querySelector("#saveStatus"),
      taskForm: document.querySelector("#taskForm"),
      taskTitle: document.querySelector("#taskTitle"),
      taskType: document.querySelector("#taskType"),
      taskDuration: document.querySelector("#taskDuration"),
      taskDescription: document.querySelector("#taskDescription"),
      taskStart: document.querySelector("#taskStart"),
      taskSubmitBtn: document.querySelector("#taskForm button[type='submit']"),
      taskList: document.querySelector("#taskList"),
      toggleTaskFormBtn: document.querySelector("#toggleTaskFormBtn"),
      timelineTitle: document.querySelector("#timelineTitle"),
      timelineHint: document.querySelector("#timelineHint"),
      timeline: document.querySelector("#timeline"),
      zoomOutBtn: document.querySelector("#zoomOutBtn"),
      zoomInBtn: document.querySelector("#zoomInBtn"),
      toggleFullDayBtn: document.querySelector("#toggleFullDayBtn"),
      toggleAxisBtn: document.querySelector("#toggleAxisBtn"),
      actualOrderBtn: document.querySelector("#actualOrderBtn"),
      clearScheduleBtn: document.querySelector("#clearScheduleBtn"),
      emptyTimer: document.querySelector("#emptyTimer"),
      activeTimerPanel: document.querySelector("#activeTimer"),
      timerCategory: document.querySelector("#timerCategory"),
      timerPlan: document.querySelector("#timerPlan"),
      timerTitle: document.querySelector("#timerTitle"),
      countdown: document.querySelector("#countdown"),
      pauseReadout: document.querySelector("#pauseReadout"),
      timerActions: document.querySelector("#timerActions"),
      resumeOnly: document.querySelector("#resumeOnly"),
      pauseBtn: document.querySelector("#pauseBtn"),
      resumeBtn: document.querySelector("#resumeBtn"),
      completeBtn: document.querySelector("#completeBtn"),
      detailModal: document.querySelector("#detailModal"),
      modalOverlay: document.querySelector("#modalOverlay"),
      closeModalBtn: document.querySelector("#closeModalBtn"),
      modalTitle: document.querySelector("#modalTitle"),
      modalInfo: document.querySelector("#modalInfo"),
      modalDescription: document.querySelector("#modalDescription"),
    };
    els.dateInput.value = currentDate;
    wireEvents();
    loadFromServer();
    updateRealtimeClock();
    window.setInterval(updateRealtimeClock, 1000);
  } catch (error) {
    console.error("初始化失败:", error);
  }
}

if (document.attachEvent) {
  document.attachEvent("onreadystatechange", function() {
    if (document.readyState === "complete") {
      onDOMReady();
    }
  });
} else if (document.addEventListener) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMReady);
  } else {
    onDOMReady();
  }
} else {
  onDOMReady();
}

// 绑定所有事件监听器
function wireEvents() {
  els.scheduleTab.addEventListener("click", function() { showView("schedule"); });
  els.timerTab.addEventListener("click", function() { showView("timer"); });
  els.dateInput.addEventListener("change", function() {
    currentDate = els.dateInput.value || toDateInputValue(new Date());
    ensureDay(currentDate);
    render();
  });

  els.toggleTaskFormBtn.addEventListener("click", toggleTaskForm);

  // 任务表单提交事件
  els.taskForm.addEventListener("submit", function(event) {
    event.preventDefault();
    var title = els.taskTitle.value.trim();
    var duration = Number(els.taskDuration.value);
    var description = els.taskDescription.value.trim();
    var startTime = els.taskStart.value.trim();
    if (!title || !Number.isFinite(duration)) return;

    var day = ensureDay(currentDate);
    var range = getDayRange(currentDate);
    
    if (editingTaskId) {
      // 编辑模式：更新现有任务
      var taskIndex = day.tasks.findIndex(function(t) { return t.id === editingTaskId; });
      if (taskIndex !== -1) {
        if (startTime) {
          // 保存时设置了开始时间，移到时间表格
          var endTime = addMinutes(startTime, duration);
          if (timeToMinutes(startTime) < timeToMinutes(range.start) || timeToMinutes(endTime) > timeToMinutes(range.end)) {
            alert("开始时间必须在 " + range.start + " 到 " + range.end + " 之间。");
            return;
          }
          
          // 检查时间冲突
          var conflictTask = null;
          var hasOverlap = day.scheduled.some(function(scheduled) {
            // 跳过已完成的任务
            if (scheduled.completedRecordId) return false;
            
            var scheduledRecord = findRecordForSchedule(scheduled.id);
            var scheduledDuration = scheduledRecord && scheduledRecord.actualDurationSeconds 
              ? Math.max(5, Math.ceil(scheduledRecord.actualDurationSeconds / 60)) 
              : scheduled.duration;
            var scheduledEnd = addMinutes(scheduled.start, scheduledDuration);
            
            if (timeToMinutes(startTime) < timeToMinutes(scheduledEnd) && timeToMinutes(endTime) > timeToMinutes(scheduled.start)) {
              conflictTask = scheduled;
              return true;
            }
            return false;
          });
          if (hasOverlap) {
            alert("这个时间段与任务 \"" + conflictTask.title + "\" 冲突，请换一个时间。");
            return;
          }
          
          // 从待安排列表移除
          day.tasks.splice(taskIndex, 1);
          // 添加到时间表格
          day.scheduled.push({
            id: generateUUID(),
            sourceTaskId: editingTaskId,
            title: title,
            type: els.taskType.value,
            duration: duration,
            description: description,
            date: currentDate,
            start: startTime,
            end: endTime,
          });
        } else {
          // 直接更新待安排任务
          day.tasks[taskIndex].title = title;
          day.tasks[taskIndex].type = els.taskType.value;
          day.tasks[taskIndex].duration = duration;
          day.tasks[taskIndex].description = description;
        }
      }
      // 重置编辑状态
      editingTaskId = null;
      els.taskSubmitBtn.textContent = "添加任务";
    } else {
      // 添加模式：创建新任务
      if (startTime) {
        var endTime = addMinutes(startTime, duration);
        if (timeToMinutes(startTime) < timeToMinutes(range.start) || timeToMinutes(endTime) > timeToMinutes(range.end)) {
          alert("开始时间必须在 " + range.start + " 到 " + range.end + " 之间。");
          return;
        }
        
        // 检查时间冲突
        var conflictTask = null;
        var hasOverlap = day.scheduled.some(function(scheduled) {
          // 跳过已完成的任务
          if (scheduled.completedRecordId) return false;
          
          var scheduledRecord = findRecordForSchedule(scheduled.id);
          var scheduledDuration = scheduledRecord && scheduledRecord.actualDurationSeconds 
            ? Math.max(5, Math.ceil(scheduledRecord.actualDurationSeconds / 60)) 
            : scheduled.duration;
          var scheduledEnd = addMinutes(scheduled.start, scheduledDuration);
          
          if (timeToMinutes(startTime) < timeToMinutes(scheduledEnd) && timeToMinutes(endTime) > timeToMinutes(scheduled.start)) {
            conflictTask = scheduled;
            return true;
          }
          return false;
        });
        if (hasOverlap) {
          alert("这个时间段与任务 \"" + conflictTask.title + "\" 冲突，请换一个时间。");
          return;
        }
        
        day.scheduled.push({
          id: generateUUID(),
          sourceTaskId: generateUUID(),
          title: title,
          type: els.taskType.value,
          duration: duration,
          description: description,
          date: currentDate,
          start: startTime,
          end: endTime,
        });
      } else {
        day.tasks.push({
          id: generateUUID(),
          title: title,
          type: els.taskType.value,
          duration: duration,
          description: description,
          createdAt: new Date().toISOString(),
        });
      }
    }
    
  // 清空任务表单
  els.taskTitle.value = "";
  els.taskDuration.value = "30";
  els.taskDescription.value = "";
  els.taskStart.value = "";
  persistAndRender();
  });

  // 清空当天安排按钮事件
  els.clearScheduleBtn.addEventListener("click", function() {
    var day = ensureDay(currentDate);
    if (!day.scheduled.length) return;
    day.scheduled = [];
    persistAndRender();
  });

  // 文件操作和计时器按钮事件
  els.chooseFileBtn.addEventListener("click", chooseJsonFile);
  els.exportBtn.addEventListener("click", exportJson);
  els.pauseBtn.addEventListener("click", pauseTimer);
  els.resumeBtn.addEventListener("click", resumeTimer);
  els.completeBtn.addEventListener("click", completeTimer);
  
  // 时间轴拖拽事件
  els.timeline.addEventListener("dragover", handleTimelineDragOver);
  els.timeline.addEventListener("dragleave", handleTimelineDragLeave);
  els.timeline.addEventListener("drop", handleTimelineDrop);
  els.timeline.addEventListener("touchmove", handleTimelineTouchMove);
  els.timeline.addEventListener("touchend", handleTimelineTouchEnd);
  
  // 缩放按钮事件 - 添加边界检查，避免不必要的重渲染
  els.zoomOutBtn.addEventListener("click", function() {
    if (timelineZoom <= config.minZoom + 0.001) return;
    var newZoom = Math.max(config.minZoom, timelineZoom - config.zoomStep);
    if (newZoom < timelineZoom - 0.001) {
      timelineZoom = newZoom;
      renderTimeline();
    }
  });
  els.zoomInBtn.addEventListener("click", function() {
    if (timelineZoom >= config.maxZoom - 0.001) return;
    var newZoom = Math.min(config.maxZoom, timelineZoom + config.zoomStep);
    if (newZoom > timelineZoom + 0.001) {
      timelineZoom = newZoom;
      renderTimeline();
    }
  });
  
  // 切换全天时间范围
  els.toggleFullDayBtn.addEventListener("click", function() {
    var oldRange = getDayRange(currentDate);
    var oldScrollLeft = els.timeline.scrollLeft;
    var oldSlotSize = getSlotSize();
    
    var oldRangeStartMinutes = timeToMinutes(oldRange.start);
    var viewStartMinutes = oldRangeStartMinutes + (oldScrollLeft / oldSlotSize) * config.slotMinutes;
    
    isFullDayMode = !isFullDayMode;
    els.toggleFullDayBtn.classList.toggle("full-day-active", isFullDayMode);
    
    var newRange = getDayRange(currentDate);
    var newSlotSize = getSlotSize();
    
    var newRangeStartMinutes = timeToMinutes(newRange.start);
    var newRangeEndMinutes = timeToMinutes(newRange.end);
    
    renderSummary();
    renderTimeline();
    
    if (viewStartMinutes >= newRangeStartMinutes && viewStartMinutes <= newRangeEndMinutes) {
      var newViewStartOffset = (viewStartMinutes - newRangeStartMinutes) / config.slotMinutes * newSlotSize;
      var newRangeTotalMinutes = minutesBetween(newRange.start, newRange.end);
      var newRangeTotalPixels = (newRangeTotalMinutes / config.slotMinutes) * newSlotSize;
      els.timeline.scrollLeft = Math.max(0, Math.min(newViewStartOffset, newRangeTotalPixels - els.timeline.clientWidth));
    } else {
      els.timeline.scrollLeft = 0;
    }
  });
  
  // 切换时间轴方向
  els.toggleAxisBtn.addEventListener("click", function() {
    timelineOrientation = timelineOrientation === "vertical" ? "horizontal" : "vertical";
    renderTimeline();
  });
  
  // 切换实际/计划时间显示
  els.actualOrderBtn.addEventListener("click", function() {
    useActualTimes = !useActualTimes;
    renderTimeline();
  });
  
  // 键盘快捷键和滚轮缩放
  window.addEventListener("keydown", handleZoomShortcut);
  els.timeline.addEventListener("wheel", handleTimelineWheel, { passive: false });
  
  // 模态框关闭事件
  els.closeModalBtn.addEventListener("click", hideDetailModal);
  els.modalOverlay.addEventListener("click", hideDetailModal);
  window.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
      hideDetailModal();
    }
  });
}

// 显示任务详情模态框
// 格式化时长（小于1分钟显示秒，否则显示分钟）
function formatDurationWithSeconds(seconds) {
  if (seconds < 60) {
    return seconds + "秒";
  }
  var minutes = Math.floor(seconds / 60);
  var remainingSeconds = seconds % 60;
  if (remainingSeconds > 0) {
    return minutes + "分" + remainingSeconds + "秒";
  }
  return minutes + "分钟";
}

function showDetailModal(item, record) {
  els.modalTitle.textContent = item.title;
  var info = "计划：" + item.start + "-" + item.end + "，共" + item.duration + "分钟";
  if (record) {
    // 计算暂停时间
    var pausedSeconds = record.interruptedSeconds || 0;
    var actualElapsedSeconds = record.actualElapsedSeconds || 0;
    var actualDurationSeconds = record.actualDurationSeconds || 0;
    
    info += "\n实际：" + formatClock(record.actualStart) + "-" + formatClock(record.actualEnd);
    info += "，共" + formatDurationWithSeconds(actualElapsedSeconds);
    if (pausedSeconds > 0) {
      info += "，暂停" + formatDurationWithSeconds(pausedSeconds);
    }
    info += "，实际执行" + formatDurationWithSeconds(actualDurationSeconds);
    
    // 计算准确率（保留正负号）
    var plannedSeconds = record.plannedDurationMinutes * 60;
    var accuracyRatio = plannedSeconds > 0 ? (actualDurationSeconds - plannedSeconds) / plannedSeconds : 0;
    var accuracyPercent = Math.round(accuracyRatio * 100);
    
    // 计算准时率（保留正负号）
    var punctualityRatio = plannedSeconds > 0 ? (actualElapsedSeconds - plannedSeconds) / plannedSeconds : 0;
    var punctualityPercent = Math.round(punctualityRatio * 100);
    
    info += "\n计划准确率：" + accuracyPercent + "%，计划准时率：" + punctualityPercent + "%";
  }
  els.modalInfo.textContent = info;
  
  // 任务说明：如果有值保留换行，没有则不显示
  if (item.description && item.description.trim()) {
    els.modalDescription.textContent = item.description;
    els.modalDescription.style.display = "block";
  } else {
    els.modalDescription.style.display = "none";
  }
  
  els.detailModal.removeAttribute("hidden");
}

// 隐藏任务详情模态框
function hideDetailModal() {
  els.detailModal.setAttribute("hidden", "");
}

// 切换任务表单的展开/折叠状态
function toggleTaskForm() {
  var workspace = document.querySelector(".workspace");
  var isCollapsed = workspace.classList.toggle("collapsed");
  els.toggleTaskFormBtn.classList.toggle("collapsed", isCollapsed);
  var icon = els.toggleTaskFormBtn.querySelector("img");
  if (isCollapsed) {
    icon.src = "right.svg";
    icon.alt = "展开";
    els.toggleTaskFormBtn.title = "展开任务面板";
  } else {
    icon.src = "left.svg";
    icon.alt = "折叠";
    els.toggleTaskFormBtn.title = "折叠任务面板";
  }
}

// 渲染所有视图
function render() {
  ensureDay(currentDate);
  renderSummary();
  renderTaskList();
  renderTimeline();
  renderTimer();
}

// 渲染页面摘要信息（日期、时间范围等）
function renderSummary() {
  var range = getDayRange(currentDate);
  var day = ensureDay(currentDate);
  
  els.appTitle.textContent = formatChineseDate(currentDate);
  
  var totalCards = day.scheduled.length;
  var visibleCards = 0;
  
  if (totalCards > 0) {
    var rangeStartMinutes = timeToMinutes(range.start);
    var rangeEndMinutes = timeToMinutes(range.end);
    
    visibleCards = day.scheduled.filter(function(scheduled) {
      var taskStartMinutes = timeToMinutes(scheduled.start);
      var durationMinutes = minutesBetween(scheduled.start, scheduled.end);
      var taskEndMinutes = taskStartMinutes + durationMinutes;
      return taskStartMinutes <= rangeEndMinutes && taskEndMinutes >= rangeStartMinutes;
    }).length;
  }
  
  els.timelineTitle.innerHTML = range.title + '<span class="card-count">(' + visibleCards + '/' + totalCards + ')</span>';
  els.timelineHint.textContent = range.start + " - " + range.end + "，把左侧任务拖到时间段中";
  updateRealtimeClock();
}

// 渲染待安排任务列表
function renderTaskList() {
  var day = ensureDay(currentDate);
  els.taskList.innerHTML = "";
  if (!day.tasks.length) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "今天还没有待安排任务";
    els.taskList.append(empty);
    return;
  }

  day.tasks.forEach(function(task) {
    var card = document.querySelector("#taskTemplate").content.firstElementChild.cloneNode(true);
    card.classList.add(task.type);
    card.dataset.taskId = task.id;
    card.querySelector("strong").textContent = task.title;
    card.querySelector("span").textContent = task.duration + " 分钟";
    var descEl = card.querySelector(".task-desc");
    if (task.description) {
      descEl.textContent = task.description;
      descEl.style.display = "block";
    } else {
      descEl.style.display = "none";
    }
    // 点击卡片编辑任务
    var contentDiv = card.querySelector("div");
    contentDiv.addEventListener("click", function(event) {
      if (event.target.tagName === "BUTTON") return;
      editingTaskId = task.id;
      els.taskTitle.value = task.title;
      els.taskType.value = task.type;
      els.taskDuration.value = task.duration;
      els.taskDescription.value = task.description || "";
      els.taskStart.value = "";
      els.taskSubmitBtn.textContent = "保存任务";
    });
    // 拖拽开始事件
    card.addEventListener("dragstart", function(event) {
      draggedTaskId = task.id;
      card.classList.add("dragging");
      event.dataTransfer.setData("text/plain", task.id);
      event.dataTransfer.effectAllowed = "move";
    });
    // 拖拽结束事件
    card.addEventListener("dragend", function() {
      draggedTaskId = null;
      hideDropIndicator();
      card.classList.remove("dragging");
    });
    // 触摸开始事件（移动端拖拽）
    card.addEventListener("touchstart", function(event) {
      touchStartTaskId = task.id;
      touchStartTime = Date.now();
      event.preventDefault();
    });
    // 触摸移动事件
    card.addEventListener("touchmove", function(event) {
      if (!touchStartTaskId || Date.now() - touchStartTime < 200) return;
      draggedTaskId = touchStartTaskId;
      card.classList.add("dragging");
      var touch = event.touches[0];
      var pointerEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY
      };
      handleTimelineDragOver(pointerEvent);
    });
    // 触摸结束事件
    card.addEventListener("touchend", function(event) {
      if (draggedTaskId) {
        var touch = event.changedTouches[0];
        var targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
        var isOverTimeline = els.timeline.contains(targetElement);
        if (!isOverTimeline) {
          hideDropIndicator();
          card.classList.remove("dragging");
          draggedTaskId = null;
        }
      }
      touchStartTaskId = null;
    });
    // 删除任务按钮事件
    card.querySelector("button").addEventListener("click", function(event) {
      event.stopPropagation();
      var nextDay = ensureDay(currentDate);
      nextDay.tasks = nextDay.tasks.filter(function(item) { return item.id !== task.id; });
      // 如果删除的是正在编辑的任务，清空编辑器
      if (editingTaskId === task.id) {
        editingTaskId = null;
        els.taskTitle.value = "";
        els.taskDuration.value = "30";
        els.taskDescription.value = "";
        els.taskStart.value = "";
        els.taskSubmitBtn.textContent = "添加任务";
      }
      persistAndRender();
    });
    els.taskList.append(card);
  });
}

// 渲染时间轴视图
function renderTimeline() {
  var range = getDayRange(currentDate);
  var day = ensureDay(currentDate);
  var savedScrollLeft = els.timeline.scrollLeft;
  var savedScrollTop = els.timeline.scrollTop;
  els.timeline.innerHTML = "";
  els.timeline.scrollLeft = savedScrollLeft;
  els.timeline.scrollTop = savedScrollTop;
  els.timeline.classList.toggle("horizontal", timelineOrientation === "horizontal");
  els.toggleAxisBtn.classList.toggle("active", timelineOrientation === "horizontal");
  els.toggleAxisBtn.title = timelineOrientation === "horizontal" ? "纵向时间轴" : "横向时间轴";
  els.actualOrderBtn.classList.toggle("active-control", useActualTimes);
  var actualIcon = els.actualOrderBtn.querySelector("img");
  if (useActualTimes) {
    actualIcon.src = "notebook.svg";
    actualIcon.alt = "按计划时间";
    els.actualOrderBtn.title = "按计划时间";
  } else {
    actualIcon.src = "clock.svg";
    actualIcon.alt = "按实际时间";
    els.actualOrderBtn.title = "按实际时间";
  }

  var totalMinutes = minutesBetween(range.start, range.end);
  var slotCount = totalMinutes / config.slotMinutes;
  var slotSize = getSlotSize();

  // 创建时间槽 - 同时设置 height 和 minHeight，确保缩放时行高与计算值一致
  // 注意：CSS 中的 min-height 会覆盖 JS 设置的 height，需要 JS 同时设置两者
  for (var index = 0; index < slotCount; index += 1) {
    var start = addMinutes(range.start, index * config.slotMinutes);
    var row = document.createElement("div");
    row.className = "time-row";
    if (timelineOrientation === "vertical") {
      row.style.height = slotSize + "px";
      row.style.minHeight = slotSize + "px";
    } else {
      row.style.height = "100%";
      row.style.minHeight = "0";
    }
    if (timelineOrientation === "horizontal") {
      row.style.left = index * slotSize + "px";
      row.style.width = slotSize + "px";
    }

    var label = document.createElement("div");
    label.className = "time-label";
    label.textContent = index % 2 === 0 ? start : "";

    var slot = document.createElement("div");
    slot.className = "time-slot";
    slot.dataset.start = start;

    row.appendChild(label);
    row.appendChild(slot);
    els.timeline.appendChild(row);
  }

  // 创建已安排任务层
  var layer = document.createElement("div");
  layer.className = "scheduled-layer";
  if (timelineOrientation === "horizontal") {
    layer.style.width = slotCount * slotSize + "px";
  } else {
    layer.style.height = slotCount * slotSize + "px";
  }

  // 按开始时间排序已安排任务
  function sortSchedule(a, b) {
    return getDisplayStartMinutes(a, range.start) - getDisplayStartMinutes(b, range.start);
  }

  var rangeStartMinutes = timeToMinutes(range.start);
  var rangeEndMinutes = timeToMinutes(range.end);

  var filteredScheduled = day.scheduled.filter(function(scheduled) {
    var taskStartMinutes = timeToMinutes(scheduled.start);
    var durationMinutes = minutesBetween(scheduled.start, scheduled.end);
    var taskEndMinutes = taskStartMinutes + durationMinutes;
    return taskStartMinutes <= rangeEndMinutes && taskEndMinutes >= rangeStartMinutes;
  });

  var scheduledItems = assignScheduleLanes(
    filteredScheduled.slice().sort(sortSchedule),
    range.start
  );

  function getLaneCount(entry) {
    return entry.laneCount;
  }

  var laneCounts = scheduledItems.map(getLaneCount);
  var laneCount = Math.max(1, Math.max.apply(Math, laneCounts));
  layer.style.setProperty("--lane-count", laneCount);

  // 渲染每个已安排任务卡片
  scheduledItems.slice().forEach(function(entry) {
    layer.appendChild(renderScheduledCard(entry.item, range.start, entry.record, entry.lane, entry.laneCount));
  });
  els.timeline.appendChild(layer);

  // 创建拖拽指示器
  var indicator = document.createElement("div");
  indicator.className = "drop-indicator";
  indicator.hidden = true;
  indicator.innerHTML = '<span></span>';
  els.timeline.appendChild(indicator);

  els.timeline.scrollLeft = savedScrollLeft;
  els.timeline.scrollTop = savedScrollTop;
}

// 为已安排任务分配显示轨道（避免重叠）
function assignScheduleLanes(items, dayStart) {
  var lanes = [];
  var entries = items.map(function(item) {
    var record = findRecordForSchedule(item.id);
    var start, duration;
    
    if (record && useActualTimes) {
      var actualStartMinutes = timeToMinutes(formatClock(record.actualStart));
      var actualEndMinutes = timeToMinutes(formatClock(record.actualEnd));
      var dayStartMinutes = timeToMinutes(dayStart);
      start = Math.max(0, actualStartMinutes - dayStartMinutes);
      duration = Math.max(5, actualEndMinutes - actualStartMinutes);
    } else {
      start = getDisplayStartMinutes(item, dayStart);
      duration = minutesBetween(item.start, item.end);
    }
    var end = start + duration;
    var lane = lanes.findIndex(function(laneEnd) { return start >= laneEnd; });
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(end);
    } else {
      lanes[lane] = end;
    }
    return { item: item, record: record, start: start, end: end, lane: lane, laneCount: 1 };
  });

  entries.forEach(function(entry) {
    entry.laneCount = entries.filter(function(other) { return entry.start < other.end && entry.end > other.start; }).length;
  });

  var maxLaneCount = Math.max(1, lanes.length);
  entries.forEach(function(entry) {
    entry.laneCount = maxLaneCount;
  });
  return entries;
}

// 处理时间轴拖拽悬停事件
function handleTimelineDragOver(event) {
  if (!draggedTaskId) return;
  event.preventDefault();
  var dragStart = getDragStartFromPointer(event);
  showDropIndicator(dragStart);
}

// 处理时间轴拖拽离开事件
function handleTimelineDragLeave(event) {
  if (!event.relatedTarget || !els.timeline.contains(event.relatedTarget)) {
    hideDropIndicator();
  }
}

// 处理时间轴拖拽放置事件
function handleTimelineDrop(event) {
  if (!draggedTaskId) return;
  event.preventDefault();
  var dragStart = getDragStartFromPointer(event);
  hideDropIndicator();
  scheduleTask(event.dataTransfer.getData("text/plain") || draggedTaskId, dragStart.time);
}

// 处理时间轴触摸移动事件（移动端）
function handleTimelineTouchMove(event) {
  if (!draggedTaskId) return;
  event.preventDefault();
  var touch = event.touches[0];
  var pointerEvent = {
    clientX: touch.clientX,
    clientY: touch.clientY
  };
  var dragStart = getDragStartFromPointer(pointerEvent);
  showDropIndicator(dragStart);
}

// 处理时间轴触摸结束事件（移动端）
function handleTimelineTouchEnd(event) {
  if (!draggedTaskId) return;
  var touch = event.changedTouches[0];
  var pointerEvent = {
    clientX: touch.clientX,
    clientY: touch.clientY
  };
  var dragStart = getDragStartFromPointer(pointerEvent);
  hideDropIndicator();
  scheduleTask(draggedTaskId, dragStart.time);
  draggedTaskId = null;
}

// 根据鼠标/触摸位置计算拖拽任务的开始时间
function getDragStartFromPointer(event) {
  var range = getDayRange(currentDate);
  var rect = els.timeline.getBoundingClientRect();
  var task = ensureDay(currentDate).tasks.find(function(item) { return item.id === draggedTaskId; });
  var totalMinutes = minutesBetween(range.start, range.end);
  var taskDuration = task && task.duration ? task.duration : 0;
  var latestStart = Math.max(0, totalMinutes - taskDuration);
  var pointerOffset =
    timelineOrientation === "horizontal"
      ? event.clientX - rect.left + els.timeline.scrollLeft
      : event.clientY - rect.top + els.timeline.scrollTop;
  var rawMinutes = (pointerOffset / getSlotSize()) * config.slotMinutes;
  var snappedMinutes = Math.round(rawMinutes / config.dragSnapMinutes) * config.dragSnapMinutes;
  var clampedMinutes = Math.min(Math.max(0, snappedMinutes), latestStart);

  return {
    minutes: clampedMinutes,
    time: addMinutes(range.start, clampedMinutes),
  };
}

// 显示拖拽放置指示器
function showDropIndicator(dragStart) {
  var indicator = els.timeline.querySelector(".drop-indicator");
  if (!indicator) return;
  var offset = (dragStart.minutes / config.slotMinutes) * getSlotSize();
  indicator.hidden = false;
  indicator.style.top = timelineOrientation === "horizontal" ? "0" : offset + "px";
  indicator.style.left = timelineOrientation === "horizontal" ? offset + "px" : "";
  indicator.querySelector("span").textContent = "开始 " + dragStart.time;
}

// 隐藏拖拽放置指示器
function hideDropIndicator() {
  var indicator = els.timeline.querySelector(".drop-indicator");
  if (indicator) {
    indicator.hidden = true;
  }
}

// 渲染已安排任务卡片
function renderScheduledCard(item, dayStart, record, lane, laneCount) {
  if (lane === undefined) lane = 0;
  if (laneCount === undefined) laneCount = 1;

  var card = document.createElement("article");
  card.className = "scheduled-card " + (record ? "completed" : item.type);
  card.id = "scheduled-card-" + item.id;
  card.title = buildScheduleTip(item, record);
  
  var isTaskStarted = activeTimer && activeTimer.itemId === item.id;
  var hasOtherTaskActive = activeTimer && activeTimer.itemId !== item.id;
  
  var isDragging = false;
  var touchStartTime = 0;
  
  card.addEventListener("mousedown", function() {
    isDragging = false;
  });
  card.addEventListener("mousemove", function() {
    isDragging = true;
  });
  card.addEventListener("mouseup", function(event) {
    if (!isDragging) {
      var isButton = event.target && (event.target.tagName === "BUTTON" || event.target.closest("button"));
      var isAccuracyBox = event.target && event.target.closest(".accuracy-box");
      if (!isButton && !isAccuracyBox) {
        showDetailModal(item, record);
      }
    }
  });
  card.addEventListener("click", function(event) {
    if (!isDragging) {
      var isButton = event.target && (event.target.tagName === "BUTTON" || event.target.closest("button"));
      var isAccuracyBox = event.target && event.target.closest(".accuracy-box");
      if (!isButton && !isAccuracyBox) {
        showDetailModal(item, record);
      }
    }
  });
  
  card.addEventListener("touchstart", function(event) {
    var touch = event.touches[0];
    var targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    var isButton = targetElement && (targetElement.tagName === "BUTTON" || targetElement.closest("button"));
    var isAccuracyBox = targetElement && targetElement.closest(".accuracy-box");
    if (!isButton && !isAccuracyBox) {
      touchStartTime = Date.now();
    }
  });
  card.addEventListener("touchend", function(event) {
    var touchDuration = Date.now() - touchStartTime;
    var touch = event.changedTouches[0];
    var targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    var isButton = targetElement && (targetElement.tagName === "BUTTON" || targetElement.closest("button"));
    var isAccuracyBox = targetElement && targetElement.closest(".accuracy-box");
    if (touchDuration < 200 && !isButton && !isAccuracyBox) {
      showDetailModal(item, record);
    }
  });
  
  if (!record && !isTaskStarted) {
    card.draggable = true;
    card.addEventListener("dragstart", function(event) {
      draggedTaskId = item.id;
      card.classList.add("dragging");
      event.dataTransfer.setData("text/plain", item.id);
      event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", function() {
      draggedTaskId = null;
      hideDropIndicator();
      card.classList.remove("dragging");
    });
    card.addEventListener("touchstart", function(event) {
      touchStartTaskId = item.id;
      touchStartTime = Date.now();
      event.preventDefault();
    });
    card.addEventListener("touchmove", function(event) {
      if (!touchStartTaskId || Date.now() - touchStartTime < 200) return;
      draggedTaskId = touchStartTaskId;
      card.classList.add("dragging");
      var touch = event.touches[0];
      var pointerEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY
      };
      handleTimelineDragOver(pointerEvent);
    });
    card.addEventListener("touchend", function(event) {
      if (draggedTaskId) {
        var touch = event.changedTouches[0];
        var targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
        var isOverTimeline = els.timeline.contains(targetElement);
        if (!isOverTimeline) {
          hideDropIndicator();
          card.classList.remove("dragging");
          draggedTaskId = null;
        }
      }
      touchStartTaskId = null;
    });
  }
  
  // 计算任务显示位置和大小
  // 根据 useActualTimes 和任务完成状态决定使用计划时间还是实际时间
  var displayStartMinutes;
  var durationMinutes;
  
  if (record && useActualTimes) {
    // 已完成任务且按实际时间模式，使用完整实际时间范围（实际开始到实际结束）
    var actualStartMinutes = timeToMinutes(formatClock(record.actualStart));
    var actualEndMinutes = timeToMinutes(formatClock(record.actualEnd));
    var dayStartMinutes = timeToMinutes(dayStart);
    displayStartMinutes = Math.max(0, actualStartMinutes - dayStartMinutes);
    durationMinutes = Math.max(5, actualEndMinutes - actualStartMinutes);
  } else {
    // 未完成任务，或按计划时间模式，使用计划时间
    displayStartMinutes = getDisplayStartMinutes(item, dayStart);
    durationMinutes = minutesBetween(item.start, item.end);
  }
  
  // 使用 Math.round 避免浮点数精度问题导致的位置偏移
  var offset = Math.round((displayStartMinutes / config.slotMinutes) * getSlotSize());
  var durationPixels = (durationMinutes / config.slotMinutes) * getSlotSize();
  var size = Math.max(record ? 74 : 52, Math.round(durationPixels) - 6);

  if (timelineOrientation === "horizontal") {
    card.style.left = (offset + 3) + "px";
    card.style.width = size + "px";
    card.style.top = (8 + lane * 86) + "px";
    card.style.height = "auto";
  } else {
    card.style.top = (offset + 3) + "px";
    card.style.height = size + "px";
    card.style.left = "calc(" + ((lane * 100) / laneCount) + "% + 12px)";
    card.style.width = "calc(" + (100 / laneCount) + "% - 24px)";
    card.style.right = "auto";
  }

  var copy = document.createElement("div");
  var title = document.createElement("strong");
  title.textContent = item.title + " ";
  var detail = document.createElement("span");
  detail.className = "schedule-detail";
  
  // 构建卡片上显示的信息
  var detailText = "计划：" + item.start + "-" + item.end + " · " + item.duration + "分钟";
  
  if (record) {
    // 已完成任务显示实际执行信息
    var pausedSeconds = record.interruptedSeconds || 0;
    var actualElapsedSeconds = record.actualElapsedSeconds || 0;
    var actualDurationSeconds = record.actualDurationSeconds || 0;
    
    detailText += " 实际：" + formatClock(record.actualStart) + "-" + formatClock(record.actualEnd);
    detailText += "，共" + formatDurationWithSeconds(actualElapsedSeconds);
    if (pausedSeconds > 0) {
      detailText += "，暂停" + formatDurationWithSeconds(pausedSeconds);
    }
    detailText += "，有效" + formatDurationWithSeconds(actualDurationSeconds);
  }
  
  detail.textContent = detailText;
  
  // 构建鼠标悬停提示内容（设置到卡片的title属性）
  var tooltipText = item.title + "\n"; // 第一行显示任务名称
  tooltipText += "计划：" + item.start + "-" + item.end + "，共" + item.duration + "分钟";
  
  if (record) {
    // 计算暂停时间
    var pausedSeconds = record.interruptedSeconds || 0;
    var actualElapsedSeconds = record.actualElapsedSeconds || 0;
    var actualDurationSeconds = record.actualDurationSeconds || 0;
    
    tooltipText += "\n实际：" + formatClock(record.actualStart) + "-" + formatClock(record.actualEnd);
    tooltipText += "，共" + formatDurationWithSeconds(actualElapsedSeconds);
    if (pausedSeconds > 0) {
      tooltipText += "，暂停" + formatDurationWithSeconds(pausedSeconds);
    }
    tooltipText += "，实际执行" + formatDurationWithSeconds(actualDurationSeconds);
    
    // 计算准确率和准时率
    var plannedSeconds = record.plannedDurationMinutes * 60;
    var accuracyRatio = plannedSeconds > 0 ? (actualDurationSeconds - plannedSeconds) / plannedSeconds : 0;
    var accuracyPercent = Math.round(accuracyRatio * 100);
    var punctualityRatio = plannedSeconds > 0 ? (actualElapsedSeconds - plannedSeconds) / plannedSeconds : 0;
    var punctualityPercent = Math.round(punctualityRatio * 100);
    
    tooltipText += "\n准确率：" + accuracyPercent + "%，准时率：" + punctualityPercent + "%";
  }
  
  // 添加任务说明（如果有）
  if (item.description && item.description.trim()) {
    tooltipText += "\n" + item.description;
  }
  
  // 将悬停提示设置到卡片的title属性
  card.title = tooltipText;
  
  copy.appendChild(title);
  copy.appendChild(detail);

  if (record) {
    var accuracy = getAccuracy(record.plannedDurationMinutes, record.actualDurationSeconds);
    var punctuality = getPunctualityRate(record.plannedDurationMinutes, record.actualElapsedSeconds);
    
    // 获取当前卡片的显示状态（默认显示准确率）
    var cardId = item.id;
    if (cardRateStates[cardId] === undefined) {
      cardRateStates[cardId] = false; // 默认显示准确率
    }
    var showPunctuality = cardRateStates[cardId];
    
    // 根据卡片状态决定显示准时率还是准确率
    var currentRate = showPunctuality ? punctuality : accuracy;
    var rateLabel = showPunctuality ? "准时率" : "准确率";

    var accuracyBox = document.createElement("div");
    accuracyBox.className = "accuracy-box " + currentRate.status;
    accuracyBox.style.position = "relative";
    accuracyBox.addEventListener("click", function(event) {
      event.stopPropagation();
    });
    
    // 主方块（显示准确率或准时率）
    var mainBox = document.createElement("div");
    mainBox.className = "rate-main";
    mainBox.innerHTML = "<span>" + rateLabel + "</span><strong>" + currentRate.label + "</strong>";
    mainBox.addEventListener("click", function(event) {
      event.stopPropagation();
      cardRateStates[cardId] = !cardRateStates[cardId];
      updateCardRateDisplay(cardId);
    });
    accuracyBox.appendChild(mainBox);
    
    card.appendChild(copy);
    card.appendChild(accuracyBox);
    return card;
  }

  var actions = document.createElement("div");
  actions.className = "scheduled-actions";

  if (!isTaskStarted) {
    var start = document.createElement("button");
    start.type = "button";
    start.className = "play-button";
    start.setAttribute("aria-label", "开始");
    start.title = "开始";
    start.addEventListener("click", function(event) {
      event.stopPropagation();
      if (activeTimer) {
        alert("已经有任务在进行中，请先完成或暂停当前任务。");
        return;
      }
      startTimer(item);
    });
    start.addEventListener("touchend", function(event) {
      event.stopPropagation();
      event.preventDefault();
      if (activeTimer) {
        alert("已经有任务在进行中，请先完成或暂停当前任务。");
        return;
      }
      startTimer(item);
    });

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "移除安排");
    remove.addEventListener("click", function(event) {
      event.stopPropagation();
      var day = ensureDay(currentDate);
      day.scheduled = day.scheduled.filter(function(scheduled) { return scheduled.id !== item.id; });
      day.tasks.push({
        id: generateUUID(),
        title: item.title,
        type: item.type,
        duration: item.duration,
        description: item.description || "",
        createdAt: new Date().toISOString(),
      });
      persistAndRender();
    });
    remove.addEventListener("touchend", function(event) {
      event.stopPropagation();
      event.preventDefault();
      var day = ensureDay(currentDate);
      day.scheduled = day.scheduled.filter(function(scheduled) { return scheduled.id !== item.id; });
      day.tasks.push({
        id: generateUUID(),
        title: item.title,
        type: item.type,
        duration: item.duration,
        description: item.description || "",
        createdAt: new Date().toISOString(),
      });
      persistAndRender();
    });

    actions.appendChild(start);
    actions.appendChild(remove);
  }
  
  card.appendChild(copy);
  if (actions.childNodes.length > 0) {
    card.appendChild(actions);
  }
  return card;
}

// 构建任务卡片的提示信息
function buildScheduleTip(item, record) {
  var lines = [
    item.title,
    item.start + " - " + item.end + " · " + item.duration + " 分钟"
  ];
  if (item.description) {
    lines.push(item.description);
  }
  if (record) {
    var accuracy = getAccuracy(record.plannedDurationMinutes, record.actualDurationSeconds);
    lines.push(
      "准确率 " + accuracy.label,
      "实际时间 " + formatClock(record.actualStart) + "-" + formatClock(record.actualEnd),
      "实际耗时 " + formatDuration(record.actualDurationSeconds),
      "暂停 " + formatDuration(record.interruptedSeconds)
    );
  }
  return lines.join("\n");
}

// 调整时间轴缩放
function adjustZoom(delta) {
  var nextZoom = Math.min(config.maxZoom, Math.max(config.minZoom, timelineZoom + delta));
  if (nextZoom === timelineZoom) return;
  timelineZoom = nextZoom;
  renderTimeline();
}

// 处理键盘缩放快捷键
function handleZoomShortcut(event) {
  if (!event.ctrlKey) return;
  var key = event.key;
  if (key === "+" || key === "=") {
    event.preventDefault();
    adjustZoom(config.zoomStep);
  }
  if (key === "-" || key === "_") {
    event.preventDefault();
    adjustZoom(-config.zoomStep);
  }
}

// 处理时间轴滚轮缩放
function handleTimelineWheel(event) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  adjustZoom(event.deltaY < 0 ? config.zoomStep : -config.zoomStep);
}

// 将任务安排到时间轴
function scheduleTask(taskId, start) {
  var day = ensureDay(currentDate);
  var task = day.tasks.find(function(item) { return item.id === taskId; });
  var scheduledItem = day.scheduled.find(function(item) { return item.id === taskId; });
  if (!task && !scheduledItem) return;

  var item = task || scheduledItem;
  
  // 如果任务已完成，使用实际时间；否则使用预计时间
  var record = scheduledItem ? findRecordForSchedule(scheduledItem.id) : null;
  var duration = record && record.actualDurationSeconds 
    ? Math.max(5, Math.ceil(record.actualDurationSeconds / 60)) 
    : item.duration;
  
  var range = getDayRange(currentDate);
  var end = addMinutes(start, duration);
  if (timeToMinutes(end) > timeToMinutes(range.end)) {
    alert("这个任务会超出当天可安排时间，请拖到更早的时间段。");
    return;
  }

  // 检查时间冲突
  var conflictTask = null;
  var hasOverlap = day.scheduled.some(function(scheduled) {
    if (scheduled.id === taskId) return false;
    
    // 跳过已完成的任务
    if (scheduled.completedRecordId) return false;
    
    var scheduledRecord = findRecordForSchedule(scheduled.id);
    var scheduledDuration = scheduledRecord && scheduledRecord.actualDurationSeconds 
      ? Math.max(5, Math.ceil(scheduledRecord.actualDurationSeconds / 60)) 
      : scheduled.duration;
    
    var scheduledEnd = addMinutes(scheduled.start, scheduledDuration);
    
    if (timeToMinutes(start) < timeToMinutes(scheduledEnd) && timeToMinutes(end) > timeToMinutes(scheduled.start)) {
      conflictTask = scheduled;
      return true;
    }
    return false;
  });
  if (hasOverlap) {
    alert("这个时间段与任务 \"" + conflictTask.title + "\" 冲突，请换一个时间。");
    return;
  }

  // 如果是待安排任务，将其移到时间轴；如果是已安排任务，更新其时间
  if (task) {
    day.tasks = day.tasks.filter(function(i) { return i.id !== taskId; });
    day.scheduled.push({
      id: generateUUID(),
      sourceTaskId: task.id,
      title: task.title,
      type: task.type,
      duration: duration,
      description: task.description || "",
      date: currentDate,
      start,
      end,
    });
  } else {
    scheduledItem.start = start;
    scheduledItem.end = end;
    scheduledItem.duration = duration;
  }
  persistAndRender();
}

// 开始任务计时器
function startTimer(item) {
  activeTimer = {
    id: generateUUID(),
    itemId: item.id,
    scheduledId: item.id,
    date: currentDate,
    title: item.title,
    type: item.type,
    plannedStart: item.start,
    plannedEnd: item.end,
    plannedDurationMinutes: item.duration,
    actualStart: new Date().toISOString(),
    remainingSeconds: item.duration * 60,
    interruptCount: 0,
    interruptedSeconds: 0,
    pauseStartedAt: null,
    state: "running",
    startTime: Date.now(),  // 记录开始时间戳，用于精确计算剩余时间
  };
  showView("timer");
  startTicking();
  persistAndRender();
}

// 暂停计时器
function pauseTimer() {
  if (!activeTimer || activeTimer.state !== "running") return;
  activeTimer.state = "paused";
  activeTimer.pauseStartedAt = Date.now();
  stopTicking();
  startTicking();
  persistAndRender();
}

// 恢复计时器
function resumeTimer() {
  if (!activeTimer || activeTimer.state !== "paused") return;
  var pausedFor = Math.floor((Date.now() - activeTimer.pauseStartedAt) / 1000);
  activeTimer.interruptCount +=1;
  activeTimer.interruptedSeconds += pausedFor;
  activeTimer.pauseStartedAt = null;
  activeTimer.state = "running";
  persistAndRender();
}

// 完成计时器并保存记录
function completeTimer() {
  if (!activeTimer) return;
  if (activeTimer.state === "paused") {
    var pausedFor = Math.floor((Date.now() - activeTimer.pauseStartedAt) / 1000);
    activeTimer.interruptCount +=1;
    activeTimer.interruptedSeconds += pausedFor;
  }

  var actualEnd = new Date();
  var actualStart = new Date(activeTimer.actualStart);
  var actualElapsedSeconds = Math.max(0, Math.floor((actualEnd - actualStart) / 1000));
  var actualDurationSeconds = Math.max(0, actualElapsedSeconds - activeTimer.interruptedSeconds);
  
  // 计算准确率和准时率
  var accuracy = getAccuracy(activeTimer.plannedDurationMinutes, actualDurationSeconds);
  var punctuality = getPunctualityRate(activeTimer.plannedDurationMinutes, actualElapsedSeconds);
  
  var record = {
    id: activeTimer.id,
    scheduledId: activeTimer.scheduledId,
    date: activeTimer.date,
    title: activeTimer.title,
    type: activeTimer.type,
    plannedStart: activeTimer.plannedStart,
    plannedEnd: activeTimer.plannedEnd,
    plannedDurationMinutes: activeTimer.plannedDurationMinutes,
    actualStart: activeTimer.actualStart,
    actualEnd: actualEnd.toISOString(),
    actualElapsedSeconds: actualElapsedSeconds,
    actualDurationSeconds: actualDurationSeconds,
    interruptCount: activeTimer.interruptCount,
    interruptedSeconds: activeTimer.interruptedSeconds,
    accuracy: accuracy.label,
    accuracyStatus: accuracy.status,
    punctuality: punctuality.label,
    punctualityStatus: punctuality.status,
  };
  data.records.push(record);

  var day = ensureDay(activeTimer.date);
  var scheduled = day.scheduled.find(function(item) { return item.id === activeTimer.scheduledId; });
  if (scheduled) {
    scheduled.completedRecordId = record.id;
  }

  activeTimer = null;
  stopTicking();
  showView("schedule");
  persistAndRender();
}

// 渲染计时器界面
function renderTimer() {
  if (!activeTimer) {
    els.emptyTimer.hidden = true;
    els.activeTimerPanel.hidden = true;
    return;
  }

  els.emptyTimer.hidden = true;
  els.activeTimerPanel.hidden = false;
  els.timerTitle.textContent = activeTimer.title;
  els.timerCategory.textContent = typeLabels[activeTimer.type];
  els.timerCategory.className = "category-pill " + activeTimer.type;
  els.timerPlan.textContent = "计划 " + activeTimer.plannedStart + " - " + activeTimer.plannedEnd;
  els.countdown.textContent = formatSeconds(Math.abs(activeTimer.remainingSeconds));
  els.countdown.classList.toggle("overtime", activeTimer.remainingSeconds < 0);

  var paused = activeTimer.state === "paused";
  els.pauseReadout.hidden = !paused;
  els.timerActions.hidden = paused;
  els.resumeOnly.hidden = !paused;
  if (paused) {
    var pausedSeconds = Math.floor((Date.now() - activeTimer.pauseStartedAt) / 1000);
    els.pauseReadout.textContent = "暂停 " + formatSeconds(pausedSeconds);
  }
}

// 开始计时器倒计时
function startTicking() {
  stopTicking();
  tickId = window.setInterval(function() {
    if (!activeTimer) {
      stopTicking();
      return;
    }
    if (activeTimer.state === "running") {
      // 使用时间戳精确计算剩余时间，避免 setInterval 暂停导致的时间偏差
      var elapsedSeconds = Math.floor((Date.now() - activeTimer.startTime) / 1000);
      // 减去累计暂停时间
      elapsedSeconds -= activeTimer.interruptedSeconds;
      activeTimer.remainingSeconds = activeTimer.plannedDurationMinutes * 60 - elapsedSeconds;
    }
    renderTimer();
  }, 1000);
}

// 停止计时器倒计时
function stopTicking() {
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
}

// 切换视图（日程/计时器）
function showView(name) {
  var schedule = name === "schedule";
  els.scheduleView.classList.toggle("active-view", schedule);
  els.timerView.classList.toggle("active-view", !schedule);
  els.scheduleTab.classList.toggle("active", schedule);
  els.timerTab.classList.toggle("active", !schedule);
}

// 确保日期数据存在
function ensureDay(dateKey) {
  // 如果 data 还未初始化，先使用默认数据
  if (!data) {
    data = deepClone(defaultData);
  }
  if (!data.days[dateKey]) {
    data.days[dateKey] = {
      tasks: [],
      scheduled: [],
    };
  }
  return data.days[dateKey];
}

// 获取日期的时间范围配置
function getDayRange(dateKey) {
  var day = new Date(dateKey + "T00:00:00");
  var isWeekend = day.getDay() === 0 || day.getDay() === 6;
  
  // 全天模式：返回0:00-23:59
  if (isFullDayMode) {
    return {
      isWeekend: isWeekend,
      start: "00:00",
      end: "23:59",
      title: "全天安排"
    };
  }
  
  // 正常模式：根据工作日/周末返回配置的时间范围
  if (isWeekend) {
    return {
      isWeekend: isWeekend,
      start: config.weekend.start,
      end: config.weekend.end,
      title: config.weekend.title
    };
  } else {
    return {
      isWeekend: isWeekend,
      start: config.workday.start,
      end: config.workday.end,
      title: config.workday.title
    };
  }
}

// 深度克隆对象（用于配置和数据复制）
function deepClone(obj) {
  if (typeof structuredClone === "function") {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

// 初始化配置为默认配置
config = deepClone(defaultConfig);

// 加载配置文件
function loadProfile(profileJson) {
  if (!profileJson || typeof profileJson !== "object") {
    console.warn("loadProfile: 无效的配置文件");
    return;
  }
  var hasChanges = false;
  var applyConfig = function(target, source) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
          if (typeof target[key] !== "object" || target[key] === null) {
            target[key] = {};
          }
          applyConfig(target[key], source[key]);
          hasChanges = true;
        } else if (target[key] !== source[key]) {
          target[key] = source[key];
          hasChanges = true;
        }
      }
    }
  };
  applyConfig(config, profileJson);
  if (hasChanges) {
    render();
  }
}

// 从本地存储加载数据
function loadData() {
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && saved.days && Array.isArray(saved.records) ? saved : deepClone(defaultData);
  } catch (e) {
    return deepClone(defaultData);
  }
}

// 从服务器加载配置和数据
function loadFromServer() {
  fetch('/api/loaddata')
    .then(function(response) {
      return response.json();
    })
    .then(function(result) {
      if (result.config) {
        config = result.config;
      } else {
        config = deepClone(defaultConfig);
      }
      if (result.data) {
        data = result.data;
        // 补齐缺少准确率和准时率的数据
        fillMissingRates();
      } else {
        data = deepClone(defaultData);
      }
      render();
      if (els.saveStatus) {
        els.saveStatus.textContent = "已从服务器加载";
      }
    })
    .catch(function(error) {
      console.error("从服务器加载失败:", error);
      config = deepClone(defaultConfig);
      data = deepClone(defaultData);
      render();
      if (els.saveStatus) {
        els.saveStatus.textContent = "使用本地默认配置";
      }
    });
}

// 保存配置和数据到服务器
function saveToServer() {
  if (!data || !config) return;
  var saveData = {
    config: config,
    days: data.days,
    records: data.records
  };
  fetch('/api/savedata', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(saveData, null, 2)
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(result) {
    if (result.success && els.saveStatus) {
      els.saveStatus.textContent = "已保存到服务器";
    }
  })
  .catch(function(error) {
    console.error("保存到服务器失败:", error);
    if (els.saveStatus) {
      els.saveStatus.textContent = "保存失败";
    }
  });
}

// 保存数据并重新渲染
function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  render();
  scheduleDiskSave();
}

// 调度磁盘保存（延迟执行以避免频繁保存）
function scheduleDiskSave() {
  if (els.saveStatus) {
    els.saveStatus.textContent = "正在保存...";
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToServer, 350);
}

// 选择JSON文件导入
function chooseJsonFile() {
  if (!window.showSaveFilePicker) {
    alert("当前浏览器不支持自动写入本地文件。可以继续使用导出 JSON。");
    return;
  }

  window.showSaveFilePicker({
    suggestedName: "child-schedule-records.json",
    types: [
      {
        description: "JSON 文件",
        accept: { "application/json": [".json"] },
      },
    ],
  }).then(function(handle) {
    fileHandle = handle;
    return saveFileHandle(fileHandle);
  }).then(function() {
    return saveToDisk();
  }).catch(function(error) {
    if (error.name !== "AbortError") {
      console.error(error);
      alert("绑定文件失败，请重试。");
    }
  });
}

// 保存数据到磁盘文件
function saveToDisk() {
  if (!fileHandle) return;
  verifyFilePermission(fileHandle).then(function(writableAllowed) {
    if (!writableAllowed) {
      els.saveStatus.textContent = "需要重新授权 JSON 文件写入";
      return;
    }
    return fileHandle.createWritable().then(function(writable) {
      return writable.write(JSON.stringify(data, null, 2)).then(function() {
        return writable.close();
      });
    });
  }).then(function() {
    els.saveStatus.textContent = "已自动写入 JSON 文件";
  }).catch(function(error) {
    console.error(error);
    els.saveStatus.textContent = "文件写入失败，仍已保存到浏览器";
  });
}

// 验证文件写入权限
function verifyFilePermission(handle) {
  if (!handle.queryPermission || !handle.requestPermission) return Promise.resolve(true);
  var options = { mode: "readwrite" };
  return handle.queryPermission(options).then(function(status) {
    if (status === "granted") return true;
    return handle.requestPermission(options).then(function(status) {
      return status === "granted";
    });
  });
}

// 导出JSON文件
function exportJson() {
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = "child-schedule-" + currentDate + ".json";
  link.click();
  URL.revokeObjectURL(url);
}

// 尝试恢复文件句柄（用于自动保存）
function tryRestoreFileHandle() {
  if (!("indexedDB" in window)) return;
  readFileHandle().then(function(handle) {
    if (!handle) return;
    fileHandle = handle;
    els.saveStatus.textContent = "已连接上次绑定的 JSON 文件";
  }).catch(function() {
    fileHandle = null;
  });
}

// 打开IndexedDB数据库（用于存储文件句柄）
function openHandleDb() {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(FILE_HANDLE_DB, 1);
    request.onupgradeneeded = function() { request.result.createObjectStore(FILE_HANDLE_STORE); };
    request.onsuccess = function() { resolve(request.result); };
    request.onerror = function() { reject(request.error); };
  });
}

// 保存文件句柄到IndexedDB
function saveFileHandle(handle) {
  return openHandleDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(FILE_HANDLE_STORE, "readwrite");
      tx.objectStore(FILE_HANDLE_STORE).put(handle, FILE_HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

// 从IndexedDB读取文件句柄
function readFileHandle() {
  return openHandleDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(FILE_HANDLE_STORE, "readonly");
      var request = tx.objectStore(FILE_HANDLE_STORE).get(FILE_HANDLE_KEY);
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  });
}

// 将日期转换为日期输入框的值格式（YYYY-MM-DD）
function toDateInputValue(date) {
  var offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

// 格式化日期为中文格式（如：五月19日 星期一）
function formatChineseDate(dateKey) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(new Date(dateKey + "T00:00:00"));
  } catch (e) {
    var date = new Date(dateKey + "T00:00:00");
    var weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    var months = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
    return months[date.getMonth()] + date.getDate() + "日 " + weekdays[date.getDay()];
  }
}

// 更新实时时钟显示
function updateRealtimeClock() {
  try {
    els.daySummary.textContent = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch (e) {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, "0");
    var m = String(now.getMinutes()).padStart(2, "0");
    var s = String(now.getSeconds()).padStart(2, "0");
    els.daySummary.textContent = h + ":" + m + ":" + s;
  }
}

// 将时间字符串（HH:MM）转换为分钟数
function timeToMinutes(time) {
  var parts = time.split(":");
  var hour = parseInt(parts[0], 10);
  var minute = parseInt(parts[1], 10);
  return hour * 60 + minute;
}

// 在时间上增加指定分钟数
function addMinutes(time, minutes) {
  var next = timeToMinutes(time) + minutes;
  var hour = String(Math.floor(next / 60)).padStart(2, "0");
  var minute = String(next % 60).padStart(2, "0");
  return hour + ":" + minute;
}

// 计算两个时间之间的分钟数
function minutesBetween(start, end) {
  return timeToMinutes(end) - timeToMinutes(start);
}

// 格式化秒数为MM:SS格式
function formatSeconds(seconds) {
  var safe = Math.max(0, seconds);
  var minutes = Math.floor(safe / 60);
  var rest = safe % 60;
  return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
}

// 获取时间轴槽位大小（考虑缩放）- 添加配置未加载时的默认值检查
function getSlotSize() {
  var rowHeight = config && config.rowHeight ? config.rowHeight : defaultConfig.rowHeight;
  return rowHeight * timelineZoom;
}

// 获取任务显示的起始分钟数（相对于当天开始时间）
function getDisplayStartMinutes(item, dayStart) {
  var record = findRecordForSchedule(item.id);
  var start = useActualTimes && record ? formatClock(record.actualStart) : item.start;
  return Math.max(0, timeToMinutes(start) - timeToMinutes(dayStart));
}

// 查找已安排任务的完成记录
function findRecordForSchedule(scheduledId) {
  return data.records
    .filter(function(record) { return record.scheduledId === scheduledId; })
    .sort(function(a, b) { return new Date(b.actualEnd) - new Date(a.actualEnd); })[0];
}

// 格式化ISO时间为HH:MM格式
function formatClock(isoTime) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoTime));
}

// 格式化持续时间为易读格式（如：5分30秒）
  function formatDuration(seconds) {
  var safe = Math.max(0, seconds || 0);
  var minutes = Math.floor(safe / 60);
  var rest = safe % 60;
  if (minutes <= 0) return rest + " 秒";
  if (rest === 0) return minutes + " 分钟";
  return minutes + " 分 " + rest + " 秒";
}

// 格式化准确率为百分比
function formatAccuracy(plannedMinutes, actualSeconds) {
  if (!actualSeconds) return "无法计算";
  return Math.round(((plannedMinutes * 60) / actualSeconds) * 100) + "%";
}

// 获取准确率信息（包含标签和状态）
// 准确率 = 预计时长 / 有效时长 * 100%
// 小于100%为红色(late)，等于100%为绿色(early)，大于100%为蓝色(over)
function getAccuracy(plannedMinutes, actualSeconds) {
  var plannedSeconds = plannedMinutes * 60;
  if (!actualSeconds || !plannedSeconds) {
    return { label: "无法计算", status: "late" };
  }
  // 准确率 = 预计时长 / 有效时长 * 100%
  var percentage = Math.round((plannedSeconds / actualSeconds) * 100);
  // 小于100%为红色(late)，100%为绿色(early)，大于100%为蓝色(over)
  var status;
  if (percentage < 100) {
    status = "late";
  } else if (percentage === 100) {
    status = "early";
  } else {
    status = "over";
  }
  return {
    label: percentage + "%",
    status: status,
  };
}

// 获取准时率信息（包含标签和状态）
// 准时率 = 预计时长 / 实际时长 * 100%
// 小于100%为红色，100%为绿色，大于100%为蓝色
function getPunctualityRate(plannedMinutes, actualElapsedSeconds) {
  var plannedSeconds = plannedMinutes * 60;
  if (!actualElapsedSeconds || !plannedSeconds) {
    return { label: "无法计算", status: "late" };
  }
  // 准时率 = 预计时长 / 实际时长 * 100%
  var percentage = Math.round((plannedSeconds / actualElapsedSeconds) * 100);
  // 小于100%为红色(late)，100%为绿色(early)，大于100%为蓝色(over)
  var status;
  if (percentage < 100) {
    status = "late";
  } else if (percentage === 100) {
    status = "early";
  } else {
    status = "over";
  }
  return {
    label: percentage + "%",
    status: status,
  };
}

// 补齐缺少准确率和准时率的数据
function fillMissingRates() {
  if (!data || !data.records) return;
  
  var hasMissingData = false;
  
  data.records.forEach(function(record) {
    // 检查是否缺少准确率数据
    if (!record.accuracy || !record.accuracyStatus) {
      var accuracy = getAccuracy(record.plannedDurationMinutes, record.actualDurationSeconds);
      record.accuracy = accuracy.label;
      record.accuracyStatus = accuracy.status;
      hasMissingData = true;
    }
    
    // 检查是否缺少准时率数据
    if (!record.punctuality || !record.punctualityStatus) {
      var punctuality = getPunctualityRate(record.plannedDurationMinutes, record.actualElapsedSeconds);
      record.punctuality = punctuality.label;
      record.punctualityStatus = punctuality.status;
      hasMissingData = true;
    }
  });
  
  // 如果有数据被补齐，保存到服务器
  if (hasMissingData) {
    saveToServer();
    console.log("已补齐缺失的准确率和准时率数据");
  }
}

// 重新计算所有数据的准确率和准时率（用于算法更新后重新计算）
// 调用方式：recalculateAllRates()
function recalculateAllRates() {
  if (!data || !data.records) return;
  
  var recordCount = data.records.length;
  
  data.records.forEach(function(record) {
    // 重新计算准确率
    var accuracy = getAccuracy(record.plannedDurationMinutes, record.actualDurationSeconds);
    record.accuracy = accuracy.label;
    record.accuracyStatus = accuracy.status;
    
    // 重新计算准时率
    var punctuality = getPunctualityRate(record.plannedDurationMinutes, record.actualElapsedSeconds);
    record.punctuality = punctuality.label;
    record.punctualityStatus = punctuality.status;
  });
  
  // 保存到服务器
  saveToServer();
  console.log("已重新计算所有 " + recordCount + " 条记录的准确率和准时率");

  // 重新渲染界面
  render();

  return recordCount;
}

function updateCardRateDisplay(cardId) {
  var card = document.getElementById("scheduled-card-" + cardId);
  if (!card) return;

  var day = ensureDay(currentDate);
  var item = day.scheduled.find(function(s) { return s.id === cardId; });
  if (!item) return;

  var record = findRecordForSchedule(cardId);
  if (!record) return;

  var accuracy = getAccuracy(record.plannedDurationMinutes, record.actualDurationSeconds);
  var punctuality = getPunctualityRate(record.plannedDurationMinutes, record.actualElapsedSeconds);

  var showPunctuality = cardRateStates[cardId];
  var currentRate = showPunctuality ? punctuality : accuracy;
  var rateLabel = showPunctuality ? "准时率" : "准确率";

  var mainBox = card.querySelector(".rate-main");
  if (mainBox) {
    mainBox.innerHTML = "<span>" + rateLabel + "</span><strong>" + currentRate.label + "</strong>";
  }

  var accuracyBox = card.querySelector(".accuracy-box");
  if (accuracyBox) {
    accuracyBox.className = "accuracy-box " + currentRate.status;
  }
}
