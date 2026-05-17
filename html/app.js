var STORAGE_KEY = "child-schedule-data-v1";
var FILE_HANDLE_DB = "child-schedule-file-db";
var FILE_HANDLE_STORE = "handles";
var FILE_HANDLE_KEY = "json-handle";

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

var timelineZoom = 1;
var timelineOrientation = "vertical";
var useActualTimes = false;
var touchStartTaskId = null;
var touchStartTime = 0;
var editingTaskId = null;
var draggedTaskId = null;
var activeTimer = null;
var tickId = null;
var fileHandle = null;
var saveTimer = null;

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

// 兼容性：Array.prototype.find
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

// 兼容性：Array.prototype.findIndex
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

var typeLabels = {
  school: "学校作业",
  home: "家庭作业",
};

var defaultData = {
  days: {},
  records: [],
};

var data = null;
var config = null;
var currentDate = toDateInputValue(new Date());
var activeTimer = null;
var tickId = null;
var fileHandle = null;
var saveTimer = null;
var draggedTaskId = null;
var timelineZoom = 1;
var timelineOrientation = "vertical";
var useActualTimes = false;
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

function wireEvents() {
  els.scheduleTab.addEventListener("click", function() { showView("schedule"); });
  els.timerTab.addEventListener("click", function() { showView("timer"); });
  els.dateInput.addEventListener("change", function() {
    currentDate = els.dateInput.value || toDateInputValue(new Date());
    ensureDay(currentDate);
    render();
  });

  els.toggleTaskFormBtn.addEventListener("click", toggleTaskForm);

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
    
    // 清空表单
    els.taskTitle.value = "";
    els.taskDuration.value = "30";
    els.taskDescription.value = "";
    els.taskStart.value = "";
    persistAndRender();
  });

  els.clearScheduleBtn.addEventListener("click", function() {
    var day = ensureDay(currentDate);
    if (!day.scheduled.length) return;
    day.scheduled = [];
    persistAndRender();
  });

  els.chooseFileBtn.addEventListener("click", chooseJsonFile);
  els.exportBtn.addEventListener("click", exportJson);
  els.pauseBtn.addEventListener("click", pauseTimer);
  els.resumeBtn.addEventListener("click", resumeTimer);
  els.completeBtn.addEventListener("click", completeTimer);
  els.timeline.addEventListener("dragover", handleTimelineDragOver);
  els.timeline.addEventListener("dragleave", handleTimelineDragLeave);
  els.timeline.addEventListener("drop", handleTimelineDrop);
  els.timeline.addEventListener("touchmove", handleTimelineTouchMove);
  els.timeline.addEventListener("touchend", handleTimelineTouchEnd);
  els.zoomOutBtn.addEventListener("click", function() {
    timelineZoom = Math.max(config.minZoom, timelineZoom - config.zoomStep);
    renderTimeline();
  });
  els.zoomInBtn.addEventListener("click", function() {
    timelineZoom = Math.min(config.maxZoom, timelineZoom + config.zoomStep);
    renderTimeline();
  });
  els.toggleAxisBtn.addEventListener("click", function() {
    timelineOrientation = timelineOrientation === "vertical" ? "horizontal" : "vertical";
    renderTimeline();
  });
  els.actualOrderBtn.addEventListener("click", function() {
    useActualTimes = !useActualTimes;
    renderTimeline();
  });
  window.addEventListener("keydown", handleZoomShortcut);
  els.timeline.addEventListener("wheel", handleTimelineWheel, { passive: false });
  
  els.closeModalBtn.addEventListener("click", hideDetailModal);
  els.modalOverlay.addEventListener("click", hideDetailModal);
  window.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
      hideDetailModal();
    }
  });
}

function showDetailModal(item, record) {
  els.modalTitle.textContent = item.title;
  var info = item.start + " - " + item.end + " · " + item.duration + " 分钟";
  if (record) {
    var accuracy = getAccuracy(record.plannedDurationMinutes, record.actualDurationSeconds);
    info += "\n准确率: " + accuracy.label;
    info += "\n实际时间: " + formatClock(record.actualStart) + "-" + formatClock(record.actualEnd);
    info += "\n实际耗时: " + formatDuration(record.actualDurationSeconds);
    info += "\n暂停: " + formatDuration(record.interruptedSeconds);
  }
  els.modalInfo.textContent = info;
  els.modalDescription.textContent = item.description || "无任务说明";
  els.detailModal.removeAttribute("hidden");
}

function hideDetailModal() {
  els.detailModal.setAttribute("hidden", "");
}

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

function render() {
  ensureDay(currentDate);
  renderSummary();
  renderTaskList();
  renderTimeline();
  renderTimer();
}

function renderSummary() {
  var range = getDayRange(currentDate);
  els.appTitle.textContent = formatChineseDate(currentDate);
  els.timelineTitle.textContent = range.title;
  els.timelineHint.textContent = range.start + " - " + range.end + "，把左侧任务拖到时间段中";
  updateRealtimeClock();
}

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
    card.addEventListener("dragstart", function(event) {
      draggedTaskId = task.id;
      card.classList.add("dragging");
      event.dataTransfer.setData("text/plain", task.id);
      event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", function() {
      draggedTaskId = null;
      hideDropIndicator();
      card.classList.remove("dragging");
    });
    card.addEventListener("touchstart", function(event) {
      touchStartTaskId = task.id;
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

function renderTimeline() {
  var range = getDayRange(currentDate);
  var day = ensureDay(currentDate);
  els.timeline.innerHTML = "";
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

  for (var index = 0; index < slotCount; index += 1) {
    var start = addMinutes(range.start, index * config.slotMinutes);
    var row = document.createElement("div");
    row.className = "time-row";
    row.style.height = timelineOrientation === "vertical" ? slotSize + "px" : "100%";
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

  var layer = document.createElement("div");
  layer.className = "scheduled-layer";
  if (timelineOrientation === "horizontal") {
    layer.style.width = slotCount * slotSize + "px";
  } else {
    layer.style.height = slotCount * slotSize + "px";
  }

  function sortSchedule(a, b) {
    return getDisplayStartMinutes(a, range.start) - getDisplayStartMinutes(b, range.start);
  }

  var scheduledItems = assignScheduleLanes(
    day.scheduled.slice().sort(sortSchedule),
    range.start
  );

  function getLaneCount(entry) {
    return entry.laneCount;
  }

  var laneCounts = scheduledItems.map(getLaneCount);
  var laneCount = Math.max(1, Math.max.apply(Math, laneCounts));
  layer.style.setProperty("--lane-count", laneCount);

  scheduledItems.slice().forEach(function(entry) {
    layer.appendChild(renderScheduledCard(entry.item, range.start, entry.record, entry.lane, entry.laneCount));
  });
  els.timeline.appendChild(layer);

  var indicator = document.createElement("div");
  indicator.className = "drop-indicator";
  indicator.hidden = true;
  indicator.innerHTML = '<span></span>';
  els.timeline.appendChild(indicator);
}

function assignScheduleLanes(items, dayStart) {
  var lanes = [];
  var entries = items.map(function(item) {
    var record = findRecordForSchedule(item.id);
    var start = getDisplayStartMinutes(item, dayStart);
    var actualSeconds = record && record.actualDurationSeconds ? record.actualDurationSeconds : 0;
    var duration = useActualTimes && record ? Math.max(5, Math.ceil(actualSeconds / 60)) : minutesBetween(item.start, item.end);
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

function handleTimelineDragOver(event) {
  if (!draggedTaskId) return;
  event.preventDefault();
  var dragStart = getDragStartFromPointer(event);
  showDropIndicator(dragStart);
}

function handleTimelineDragLeave(event) {
  if (!event.relatedTarget || !els.timeline.contains(event.relatedTarget)) {
    hideDropIndicator();
  }
}

function handleTimelineDrop(event) {
  if (!draggedTaskId) return;
  event.preventDefault();
  var dragStart = getDragStartFromPointer(event);
  hideDropIndicator();
  scheduleTask(event.dataTransfer.getData("text/plain") || draggedTaskId, dragStart.time);
}

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

function showDropIndicator(dragStart) {
  var indicator = els.timeline.querySelector(".drop-indicator");
  if (!indicator) return;
  var offset = (dragStart.minutes / config.slotMinutes) * getSlotSize();
  indicator.hidden = false;
  indicator.style.top = timelineOrientation === "horizontal" ? "0" : offset + "px";
  indicator.style.left = timelineOrientation === "horizontal" ? offset + "px" : "";
  indicator.querySelector("span").textContent = "开始 " + dragStart.time;
}

function hideDropIndicator() {
  var indicator = els.timeline.querySelector(".drop-indicator");
  if (indicator) {
    indicator.hidden = true;
  }
}

function renderScheduledCard(item, dayStart, record, lane, laneCount) {
  if (lane === undefined) lane = 0;
  if (laneCount === undefined) laneCount = 1;
  
  var card = document.createElement("article");
  card.className = "scheduled-card " + (record ? "completed" : item.type);
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
      if (!isButton) {
        showDetailModal(item, record);
      }
    }
  });
  card.addEventListener("click", function(event) {
    if (!isDragging) {
      var isButton = event.target && (event.target.tagName === "BUTTON" || event.target.closest("button"));
      if (!isButton) {
        showDetailModal(item, record);
      }
    }
  });
  
  card.addEventListener("touchstart", function(event) {
    var touch = event.touches[0];
    var targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    var isButton = targetElement && (targetElement.tagName === "BUTTON" || targetElement.closest("button"));
    if (!isButton) {
      touchStartTime = Date.now();
    }
  });
  card.addEventListener("touchend", function(event) {
    var touchDuration = Date.now() - touchStartTime;
    var touch = event.changedTouches[0];
    var targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    var isButton = targetElement && (targetElement.tagName === "BUTTON" || targetElement.closest("button"));
    if (touchDuration < 200 && !isButton) {
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
  
  var displayStartMinutes = getDisplayStartMinutes(item, dayStart);
  var plannedMinutes = minutesBetween(item.start, item.end);
  var actualSeconds = record && record.actualDurationSeconds ? record.actualDurationSeconds : 0;
  var durationMinutes = useActualTimes && record ? Math.max(5, Math.ceil(actualSeconds / 60)) : plannedMinutes;
  var offset = (displayStartMinutes / config.slotMinutes) * getSlotSize();
  var size = Math.max(record ? 74 : 52, (durationMinutes / config.slotMinutes) * getSlotSize() - 6);

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
  detail.textContent = item.start + " - " + item.end + " · " + item.duration + " 分钟";
  copy.appendChild(title);
  copy.appendChild(detail);

  if (record) {
    var accuracy = getAccuracy(record.plannedDurationMinutes, record.actualDurationSeconds);
    var result = document.createElement("span");
    result.className = "result-line";
    result.textContent =
      "实际时间 " + formatClock(record.actualStart) + "-" + formatClock(record.actualEnd) + " · 实际耗时 " + formatDuration(record.actualDurationSeconds);
    copy.appendChild(result);

    var accuracyBox = document.createElement("div");
    accuracyBox.className = "accuracy-box " + accuracy.status;
    accuracyBox.innerHTML = "<span>准确率</span><strong>" + accuracy.label + "</strong>";
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

function adjustZoom(delta) {
  var nextZoom = Math.min(config.maxZoom, Math.max(config.minZoom, timelineZoom + delta));
  if (nextZoom === timelineZoom) return;
  timelineZoom = nextZoom;
  renderTimeline();
}

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

function handleTimelineWheel(event) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  adjustZoom(event.deltaY < 0 ? config.zoomStep : -config.zoomStep);
}

function scheduleTask(taskId, start) {
  var day = ensureDay(currentDate);
  var task = day.tasks.find(function(item) { return item.id === taskId; });
  var scheduledItem = day.scheduled.find(function(item) { return item.id === taskId; });
  if (!task && !scheduledItem) return;

  var item = task || scheduledItem;
  var range = getDayRange(currentDate);
  var end = addMinutes(start, item.duration);
  if (timeToMinutes(end) > timeToMinutes(range.end)) {
    alert("这个任务会超出当天可安排时间，请拖到更早的时间段。");
    return;
  }

  var hasOverlap = day.scheduled.some(function(scheduled) {
    return scheduled.id !== taskId && timeToMinutes(start) < timeToMinutes(scheduled.end) && timeToMinutes(end) > timeToMinutes(scheduled.start);
  });
  if (hasOverlap) {
    alert("这个时间段已经有安排了，请换一个时间。");
    return;
  }

  if (task) {
    day.tasks = day.tasks.filter(function(i) { return i.id !== taskId; });
    day.scheduled.push({
      id: generateUUID(),
      sourceTaskId: task.id,
      title: task.title,
      type: task.type,
      duration: task.duration,
      description: task.description || "",
      date: currentDate,
      start,
      end,
    });
  } else {
    scheduledItem.start = start;
    scheduledItem.end = end;
  }
  persistAndRender();
}

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
  };
  showView("timer");
  startTicking();
  persistAndRender();
}

function pauseTimer() {
  if (!activeTimer || activeTimer.state !== "running") return;
  activeTimer.state = "paused";
  activeTimer.pauseStartedAt = Date.now();
  stopTicking();
  startTicking();
  persistAndRender();
}

function resumeTimer() {
  if (!activeTimer || activeTimer.state !== "paused") return;
  var pausedFor = Math.floor((Date.now() - activeTimer.pauseStartedAt) / 1000);
  activeTimer.interruptCount += 1;
  activeTimer.interruptedSeconds += pausedFor;
  activeTimer.pauseStartedAt = null;
  activeTimer.state = "running";
  persistAndRender();
}

function completeTimer() {
  if (!activeTimer) return;
  if (activeTimer.state === "paused") {
    var pausedFor = Math.floor((Date.now() - activeTimer.pauseStartedAt) / 1000);
    activeTimer.interruptCount += 1;
    activeTimer.interruptedSeconds += pausedFor;
  }

  var actualEnd = new Date();
  var actualStart = new Date(activeTimer.actualStart);
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
    actualElapsedSeconds: Math.max(0, Math.floor((actualEnd - actualStart) / 1000)),
    actualDurationSeconds: Math.max(0, Math.floor((actualEnd - actualStart) / 1000) - activeTimer.interruptedSeconds),
    interruptCount: activeTimer.interruptCount,
    interruptedSeconds: activeTimer.interruptedSeconds,
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

function startTicking() {
  stopTicking();
  tickId = window.setInterval(function() {
    if (!activeTimer) {
      stopTicking();
      return;
    }
    if (activeTimer.state === "running") {
      activeTimer.remainingSeconds -= 1;
    }
    renderTimer();
  }, 1000);
}

function stopTicking() {
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
}

function showView(name) {
  var schedule = name === "schedule";
  els.scheduleView.classList.toggle("active-view", schedule);
  els.timerView.classList.toggle("active-view", !schedule);
  els.scheduleTab.classList.toggle("active", schedule);
  els.timerTab.classList.toggle("active", !schedule);
}

function ensureDay(dateKey) {
  if (!data.days[dateKey]) {
    data.days[dateKey] = {
      tasks: [],
      scheduled: [],
    };
  }
  return data.days[dateKey];
}

function getDayRange(dateKey) {
  var day = new Date(dateKey + "T00:00:00");
  var isWeekend = day.getDay() === 0 || day.getDay() === 6;
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

function deepClone(obj) {
  if (typeof structuredClone === "function") {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

config = deepClone(defaultConfig);

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

function loadData() {
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && saved.days && Array.isArray(saved.records) ? saved : deepClone(defaultData);
  } catch (e) {
    return deepClone(defaultData);
  }
}

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

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  render();
  scheduleDiskSave();
}

function scheduleDiskSave() {
  if (els.saveStatus) {
    els.saveStatus.textContent = "正在保存...";
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToServer, 350);
}

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

function exportJson() {
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = "child-schedule-" + currentDate + ".json";
  link.click();
  URL.revokeObjectURL(url);
}

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

function openHandleDb() {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(FILE_HANDLE_DB, 1);
    request.onupgradeneeded = function() { request.result.createObjectStore(FILE_HANDLE_STORE); };
    request.onsuccess = function() { resolve(request.result); };
    request.onerror = function() { reject(request.error); };
  });
}

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

function toDateInputValue(date) {
  var offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

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

function timeToMinutes(time) {
  var parts = time.split(":");
  var hour = parseInt(parts[0], 10);
  var minute = parseInt(parts[1], 10);
  return hour * 60 + minute;
}

function addMinutes(time, minutes) {
  var next = timeToMinutes(time) + minutes;
  var hour = String(Math.floor(next / 60)).padStart(2, "0");
  var minute = String(next % 60).padStart(2, "0");
  return hour + ":" + minute;
}

function minutesBetween(start, end) {
  return timeToMinutes(end) - timeToMinutes(start);
}

function formatSeconds(seconds) {
  var safe = Math.max(0, seconds);
  var minutes = Math.floor(safe / 60);
  var rest = safe % 60;
  return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
}

function getSlotSize() {
  return config.rowHeight * timelineZoom;
}

function getDisplayStartMinutes(item, dayStart) {
  var record = findRecordForSchedule(item.id);
  var start = useActualTimes && record ? formatClock(record.actualStart) : item.start;
  return Math.max(0, timeToMinutes(start) - timeToMinutes(dayStart));
}

function findRecordForSchedule(scheduledId) {
  return data.records
    .filter(function(record) { return record.scheduledId === scheduledId; })
    .sort(function(a, b) { return new Date(b.actualEnd) - new Date(a.actualEnd); })[0];
}

function formatClock(isoTime) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoTime));
}

function formatDuration(seconds) {
  var safe = Math.max(0, seconds || 0);
  var minutes = Math.floor(safe / 60);
  var rest = safe % 60;
  if (minutes <= 0) return rest + " 秒";
  if (rest === 0) return minutes + " 分钟";
  return minutes + " 分 " + rest + " 秒";
}

function formatAccuracy(plannedMinutes, actualSeconds) {
  if (!actualSeconds) return "无法计算";
  return Math.round(((plannedMinutes * 60) / actualSeconds) * 100) + "%";
}

function getAccuracy(plannedMinutes, actualSeconds) {
  var plannedSeconds = plannedMinutes * 60;
  if (!actualSeconds || !plannedSeconds) {
    return { label: "无法计算", status: "late" };
  }
  var ratio = actualSeconds <= plannedSeconds ? actualSeconds / plannedSeconds : plannedSeconds / actualSeconds;
  return {
    label: Math.round(ratio * 100) + "%",
    status: actualSeconds <= plannedSeconds ? "early" : "late",
  };
}
