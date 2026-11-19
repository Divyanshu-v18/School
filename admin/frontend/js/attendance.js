/* ==========================================================================
   ATTENDANCE MANAGEMENT
   Student/teacher attendance monitoring with an Edit Attendance switch.
   Supports daily and monthly attendance views. Attendance can be changed
   (and saved) in the daily view while Edit Attendance is ON.

   Requires:
   - api.js
   - authenticatedFetch()
   - Existing GET /students
   - Existing GET /teachers
   - Existing GET /attendance?date_val=YYYY-MM-DD
   - Existing GET /teacher-attendance?date_val=YYYY-MM-DD

   - POST /attendance and POST /teacher-attendance (only when saving in edit mode)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const $ = (id) => document.getElementById(id);

    /* =========================================================
       DOM ELEMENTS
    ========================================================= */

    const dateInput = $("attDate");
    const monthInput = $("attMonth");

    const classSelect = $("attClass");
    const sectionSelect = $("attSection");

    const classFilterGroup = $("classFilterGroup");
    const sectionFilterGroup = $("sectionFilterGroup");

    const dailyDateGroup = $("dailyDateGroup");
    const monthlyDateGroup = $("monthlyDateGroup");

    const searchInput = $("attSearch");
    const searchLabel = $("searchLabel");

    const loadBtn = $("loadAttendanceBtn");

    const dailyViewBtn = $("dailyViewBtn");
    const monthlyViewBtn = $("monthlyViewBtn");

    const targetStudentBtn = $("targetStudentBtn");
    const targetTeacherBtn = $("targetTeacherBtn");

    const viewDescription = $("viewDescription");
    const summarySubtitle = $("summarySubtitle");
    const summaryPeriod = $("summaryPeriod");

    const tableTitle = $("tableTitle");
    const tableSubtitle = $("tableSubtitle");
    const recordCount = $("recordCount");

    const table = $("attendanceTable");
    const tableHead = $("attendanceTableHead");
    const tableBody = $("attendanceTableBody");

    const kpiTotalLabel = $("kpiTotalLabel");
    const kpiTotal = $("kpiTotal");
    const kpiPresent = $("kpiPresent");
    const kpiAbsent = $("kpiAbsent");
    const kpiNotMarked = $("kpiNotMarked");
    const kpiRate = $("kpiRate");

    const legendNote = $("legendNote");

    const toggleEditBtn = $("toggleEditModeBtn");
    const toggleModeStatus = $("toggleModeStatus");
    const saveBtn = $("saveAttendanceBtn");
    const unsavedBadge = $("unsavedBadge");
    const editQuickActions = $("editQuickActions");
    const markAllPresentBtn = $("markAllPresentBtn");
    const markAllAbsentBtn = $("markAllAbsentBtn");
    const feedbackBanner = $("attendanceFeedbackBanner");

    /* =========================================================
       API CONFIGURATION
    ========================================================= */

    const apiBase = () =>
        (window.API_BASE_URL || "http://127.0.0.1:8000")
            .replace(/\/+$/, "");

    function request(url, options = {}) {

        if (typeof window.authenticatedFetch !== "function") {
            throw new Error(
                "Authentication helper unavailable. Check api.js."
            );
        }

        return window.authenticatedFetch(url, options);
    }

    async function readResponse(response) {

        let data = null;

        try {
            data = await response.json();
        } catch (_) { }

        if (!response.ok) {

            throw new Error(
                typeof data?.detail === "string"
                    ? data.detail
                    : `Request failed (HTTP ${response.status}).`
            );

        }

        return data;
    }

    /* =========================================================
       DATE HELPERS
    ========================================================= */

    function today() {

        const d = new Date();

        return [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0")
        ].join("-");

    }

    function currentMonth() {
        return today().slice(0, 7);
    }

    function daysInMonth(year, month) {

        return new Date(year, month, 0).getDate();

    }

    function dateForDay(year, month, day) {

        return [
            year,
            String(month).padStart(2, "0"),
            String(day).padStart(2, "0")
        ].join("-");

    }

    function formatDate(dateString) {

        const [year, month, day] = dateString.split("-").map(Number);

        return new Date(year, month - 1, day)
            .toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
            });

    }

    function formatMonth(monthString) {

        const [year, month] = monthString.split("-").map(Number);

        return new Date(year, month - 1, 1)
            .toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric"
            });

    }

    function isValidDate(value) {

        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }

        const [year, month, day] = value.split("-").map(Number);

        const d = new Date(year, month - 1, day);

        return d.getFullYear() === year &&
            d.getMonth() === month - 1 &&
            d.getDate() === day;

    }

    function isValidMonth(value) {

        return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

    }

    function getEligibleDays(year, month) {

        const totalDays = daysInMonth(year, month);

        const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;

        const now = today();

        if (selectedMonth > currentMonth()) {
            return 0;
        }

        if (selectedMonth === currentMonth()) {
            return Number(now.slice(8, 10));
        }

        return totalDays;

    }

    /* =========================================================
       INITIAL STATE
    ========================================================= */

    let currentTarget = "student";

    let currentView = "daily";

    let currentRoster = [];

    let loading = false;

    let requestVersion = 0;

    // Edit mode
    let editMode = false;          // the Edit Attendance switch
    let saving = false;
    let loadedDate = "";           // date the daily table was loaded for (used when saving)
    let applied = { date: "", month: "", cls: "ALL", sec: "ALL" };   // filters of the table on screen

    if (dateInput) {
        dateInput.value = today();
    }

    if (monthInput) {
        monthInput.value = currentMonth();
    }

    /* =========================================================
       STATUS HELPERS
    ========================================================= */

    function normalizeStatus(status) {

        const value = String(status ?? "").trim().toLowerCase();

        if (value === "present") return "Present";

        if (value === "absent") return "Absent";

        return "N/A";

    }

    function statusClass(status) {

        if (status === "Present") return "status-present";

        if (status === "Absent") return "status-absent";

        return "status-na";

    }

    function statusBadge(status) {

        const badge = document.createElement("span");

        badge.className =
            `attendance-status ${statusClass(status)}`;

        badge.textContent = status;

        return badge;

    }

    function statusSymbol(status) {

        const symbol = document.createElement("span");

        symbol.className =
            `status-symbol ${statusClass(status)}`;

        if (status === "Present") {
            symbol.textContent = "P";
            symbol.title = "Present";
        } else if (status === "Absent") {
            symbol.textContent = "A";
            symbol.title = "Absent";
        } else {
            symbol.textContent = "N";
            symbol.title = "Not Marked";
        }

        return symbol;

    }

    /* =========================================================
       TABLE HELPERS
    ========================================================= */

    function createCell(content, tag = "td", className = "") {

        const cell = document.createElement(tag);

        if (content instanceof Node) {
            cell.appendChild(content);
        } else {
            cell.textContent = String(content ?? "");
        }

        if (className) {
            cell.className = className;
        }

        return cell;

    }

    function setMessage(message, columns = 4, error = false) {

        tableHead.replaceChildren();
        tableBody.replaceChildren();

        const row = document.createElement("tr");

        const cell = document.createElement("td");

        cell.colSpan = columns;
        cell.className = "table-loading";

        cell.textContent = message;

        if (error) {
            cell.style.color = "#b91c1c";
        }

        row.appendChild(cell);

        tableBody.appendChild(row);

    }

    function setEmptyMessage(title, description, columns) {

        tableBody.replaceChildren();

        const row = document.createElement("tr");

        const cell = document.createElement("td");

        cell.colSpan = columns;
        cell.className = "empty-state";

        const strong = document.createElement("strong");
        strong.textContent = title;

        const span = document.createElement("span");
        span.textContent = description;

        cell.append(strong, span);

        row.appendChild(cell);

        tableBody.appendChild(row);

    }

    /* =========================================================
       ATTENDANCE DATA HELPERS
    ========================================================= */

    function getArrayResponse(data, key) {

        if (Array.isArray(data)) {
            return data;
        }

        if (Array.isArray(data?.[key])) {
            return data[key];
        }

        throw new Error(`Unexpected ${key} response.`);

    }

    function createAttendanceMap(attendance, idField) {

        const map = new Map();

        attendance.forEach((item) => {

            const id = item?.[idField];

            if (
                id !== undefined &&
                id !== null &&
                String(id).trim() !== ""
            ) {
                map.set(String(id), normalizeStatus(item.status));
            }

        });

        return map;

    }

    /* =========================================================
       VIEW SWITCHING
    ========================================================= */

    function switchView(view) {

        if (!["daily", "monthly"].includes(view)) {
            return;
        }

        if (view !== currentView && !confirmDiscard()) {
            return;
        }

        currentView = view;

        dailyViewBtn.classList.toggle("active", view === "daily");

        monthlyViewBtn.classList.toggle("active", view === "monthly");

        dailyViewBtn.setAttribute(
            "aria-selected",
            String(view === "daily")
        );

        monthlyViewBtn.setAttribute(
            "aria-selected",
            String(view === "monthly")
        );

        dailyDateGroup.classList.toggle(
            "hidden",
            view !== "daily"
        );

        monthlyDateGroup.classList.toggle(
            "hidden",
            view !== "monthly"
        );

        if (viewDescription) {

            viewDescription.textContent =
                view === "daily"
                    ? "View attendance records for a selected date."
                    : "Review attendance history for an entire month.";

        }

        if (summarySubtitle) {

            summarySubtitle.textContent =
                view === "daily"
                    ? "Daily attendance summary"
                    : "Monthly attendance summary";

        }

        if (tableTitle) {

            tableTitle.textContent =
                view === "daily"
                    ? "Daily Attendance Records"
                    : "Monthly Attendance Calendar";

        }

        if (tableSubtitle) {

            tableSubtitle.textContent =
                view === "daily"
                    ? "Attendance status of enrolled members."
                    : "Daily attendance history of each member.";

        }

        updateEditUI();

        fetchRosterAndAttendance();

    }

    dailyViewBtn?.addEventListener("click", () => {
        switchView("daily");
    });

    monthlyViewBtn?.addEventListener("click", () => {
        switchView("monthly");
    });

    /* =========================================================
       STUDENT / TEACHER SWITCHING
    ========================================================= */

    function switchTarget(target) {

        if (!["student", "teacher"].includes(target)) {
            return;
        }

        if (target !== currentTarget && !confirmDiscard()) {
            return;
        }

        currentTarget = target;

        targetStudentBtn.classList.toggle(
            "active",
            target === "student"
        );

        targetTeacherBtn.classList.toggle(
            "active",
            target === "teacher"
        );

        if (classFilterGroup) {
            classFilterGroup.style.display =
                target === "student" ? "flex" : "none";
        }

        if (sectionFilterGroup) {
            sectionFilterGroup.style.display =
                target === "student" ? "flex" : "none";
        }

        if (searchLabel) {

            searchLabel.textContent =
                target === "student"
                    ? "Search Student"
                    : "Search Teacher";

        }

        if (searchInput) {

            searchInput.placeholder =
                target === "student"
                    ? "Search by name or student ID..."
                    : "Search by name or teacher ID...";

        }

        if (kpiTotalLabel) {

            kpiTotalLabel.textContent =
                target === "student"
                    ? "Total Students"
                    : "Total Teachers";

        }

        fetchRosterAndAttendance();

    }

    targetStudentBtn?.addEventListener("click", () => {
        switchTarget("student");
    });

    targetTeacherBtn?.addEventListener("click", () => {
        switchTarget("teacher");
    });

    /* =========================================================
       FETCH ROSTER
    ========================================================= */

    async function fetchRoster() {

        const endpoint =
            currentTarget === "student"
                ? "/students"
                : "/teachers";

        const key =
            currentTarget === "student"
                ? "students"
                : "teachers";

        const response = await request(
            `${apiBase()}${endpoint}`
        );

        const data = await readResponse(response);

        return getArrayResponse(data, key);

    }

    /* =========================================================
       FILTER ROSTER
    ========================================================= */

    function filterRoster(roster) {

        if (currentTarget === "teacher") {

            return roster
                .filter((teacher) => {

                    const id = teacher.teacher_id;

                    return id !== undefined &&
                        id !== null &&
                        String(id).trim() !== "";

                })
                .map((teacher) => ({

                    id: String(teacher.teacher_id),

                    teacher_id: teacher.teacher_id,

                    teacher_name: String(
                        teacher.full_name || "—"
                    ),

                    post: String(
                        teacher.post || "Teacher"
                    ),

                    attendance: new Map()

                }));

        }

        const selectedClass =
            classSelect?.value || "ALL";

        const selectedSection =
            sectionSelect?.value || "ALL";

        return roster

            .filter((student) => {

                const cls = String(
                    student.class ?? student.class_name ?? ""
                ).trim().toUpperCase();

                const section = String(
                    student.section ?? ""
                ).trim().toUpperCase();

                return (

                    (
                        selectedClass === "ALL" ||
                        cls === selectedClass.trim().toUpperCase()
                    ) &&

                    (
                        selectedSection === "ALL" ||
                        section === selectedSection.trim().toUpperCase()
                    )

                );

            })

            .filter((student) => {

                const id = student.student_id;

                return id !== undefined &&
                    id !== null &&
                    String(id).trim() !== "";

            })

            .map((student) => ({

                id: String(student.student_id),

                student_id: student.student_id,

                student_name: String(
                    student.full_name || "—"
                ),

                class_name: String(
                    student.class ?? student.class_name ?? "—"
                ),

                section: String(
                    student.section ?? "—"
                ),

                attendance: new Map()

            }));

    }

    /* =========================================================
       FETCH ONE DAY'S ATTENDANCE
    ========================================================= */

    async function fetchAttendanceForDate(selectedDate) {

        const endpoint =
            currentTarget === "student"
                ? "/attendance"
                : "/teacher-attendance";

        const query = new URLSearchParams({
            date_val: selectedDate
        });

        if (currentTarget === "student") {

            const selectedClass =
                classSelect?.value || "ALL";

            const selectedSection =
                sectionSelect?.value || "ALL";

            if (selectedClass !== "ALL") {
                query.set("class_name", selectedClass);
            }

            if (selectedSection !== "ALL") {
                query.set("section", selectedSection);
            }

        }

        const response = await request(
            `${apiBase()}${endpoint}?${query.toString()}`
        );

        const data = await readResponse(response);

        const key =
            currentTarget === "student"
                ? "attendance"
                : "attendance";

        return getArrayResponse(data, key);

    }

    /* =========================================================
       DAILY VIEW
    ========================================================= */

    async function loadDailyAttendance(roster, selectedDate) {

        const attendance = await fetchAttendanceForDate(
            selectedDate
        );

        const idField =
            currentTarget === "student"
                ? "student_id"
                : "teacher_id";

        const attendanceMap = createAttendanceMap(
            attendance,
            idField
        );

        roster.forEach((record) => {

            record.status =
                attendanceMap.get(record.id) || "N/A";

            record.originalStatus = record.status;   // what is saved in the database

        });

        loadedDate = selectedDate;

        currentRoster = roster;

        renderDailyTable();

        updateKPIs();

        if (summaryPeriod) {
            summaryPeriod.textContent = formatDate(selectedDate);
        }

    }

    /* =========================================================
       MONTHLY VIEW
    ========================================================= */

    async function loadMonthlyAttendance(roster, selectedMonth) {

        const [year, month] = selectedMonth
            .split("-")
            .map(Number);

        const totalDays = daysInMonth(year, month);

        const eligibleDays = getEligibleDays(year, month);

        const dates = Array.from(
            { length: eligibleDays },
            (_, index) => dateForDay(year, month, index + 1)
        );

        /*
         * The existing backend supports daily attendance GET.
         * Therefore, monthly attendance is temporarily fetched
         * by requesting each eligible date.
         */

        const dailyResults = await Promise.all(

            dates.map(async (date) => {

                const attendance =
                    await fetchAttendanceForDate(date);

                return {
                    date,
                    attendance
                };

            })

        );

        const idField =
            currentTarget === "student"
                ? "student_id"
                : "teacher_id";

        dailyResults.forEach(({ date, attendance }) => {

            const attendanceMap = createAttendanceMap(
                attendance,
                idField
            );

            roster.forEach((record) => {

                record.attendance.set(
                    date,
                    attendanceMap.get(record.id) || "N/A"
                );

            });

        });

        /*
         * Future days are intentionally excluded from
         * monthly statistics and represented by a dash.
         */

        currentRoster = roster;

        renderMonthlyTable(
            year,
            month,
            totalDays,
            eligibleDays
        );

        updateKPIs();

        if (summaryPeriod) {
            summaryPeriod.textContent = formatMonth(selectedMonth);
        }

    }

    /* =========================================================
       MAIN DATA LOADING
    ========================================================= */

    async function fetchRosterAndAttendance() {

        if (loading) {
            requestVersion++;
        }

        const version = ++requestVersion;

        loading = true;

        loadBtn.disabled = true;
        loadBtn.textContent = "Loading...";

        const columns =
            currentView === "monthly"
                ? 2
                : currentTarget === "student"
                    ? 4
                    : 4;

        setMessage(
            "Loading attendance records...",
            columns
        );

        try {

            let selectedValue;

            if (currentView === "daily") {

                selectedValue =
                    dateInput?.value || today();

                if (!isValidDate(selectedValue)) {
                    throw new Error("Please select a valid date.");
                }

            } else {

                selectedValue =
                    monthInput?.value || currentMonth();

                if (!isValidMonth(selectedValue)) {
                    throw new Error("Please select a valid month.");
                }

            }

            applied = {
                date: dateInput?.value || "",
                month: monthInput?.value || "",
                cls: classSelect?.value || "ALL",
                sec: sectionSelect?.value || "ALL"
            };

            /*
             * Load roster first.
             */

            const rawRoster = await fetchRoster();

            if (version !== requestVersion) {
                return;
            }

            const roster = filterRoster(rawRoster);

            if (currentView === "daily") {

                await loadDailyAttendance(
                    roster,
                    selectedValue
                );

            } else {

                await loadMonthlyAttendance(
                    roster,
                    selectedValue
                );

            }

        } catch (error) {

            if (version !== requestVersion) {
                return;
            }

            console.error(
                "Attendance loading error:",
                error
            );

            setMessage(
                error.message || "Unable to load attendance records.",
                columns,
                true
            );

            currentRoster = [];

            updateKPIs();

        } finally {

            if (version === requestVersion) {

                loading = false;

                loadBtn.disabled = false;

                loadBtn.innerHTML = "<span>↻</span> Load Records";

                updateEditUI();

            }

        }

    }

    /* =========================================================
       SEARCH FILTER
    ========================================================= */

    function filteredRoster() {

        const term = (
            searchInput?.value || ""
        ).toLowerCase().trim();

        if (!term) {
            return currentRoster;
        }

        return currentRoster.filter((record) => {

            const values = currentTarget === "student"

                ? [
                    record.student_name,
                    record.student_id,
                    record.class_name,
                    record.section
                ]

                : [
                    record.teacher_name,
                    record.teacher_id,
                    record.post
                ];

            return values.some((value) =>

                String(value ?? "")
                    .toLowerCase()
                    .includes(term)

            );

        });

    }

    /* =========================================================
       DAILY TABLE RENDERING
    ========================================================= */

    function renderDailyTable() {

        if (!tableHead || !tableBody) return;

        table.classList.remove("monthly-attendance-table");

        tableHead.replaceChildren();
        tableBody.replaceChildren();

        const columns = currentTarget === "student"

            ? [
                "Student ID",
                "Student Name",
                "Class & Section",
                "Attendance Status"
            ]

            : [
                "Teacher ID",
                "Teacher Name",
                "Designation / Post",
                "Attendance Status"
            ];

        const headerRow = document.createElement("tr");

        columns.forEach((column) => {

            headerRow.appendChild(
                createCell(column, "th")
            );

        });

        tableHead.appendChild(headerRow);

        const records = filteredRoster();

        if (!records.length) {

            setEmptyMessage(
                "No records found",
                "No members match the selected filters.",
                columns.length
            );

            recordCount.textContent = "0 Records";

            return;

        }

        records.forEach((record) => {

            const row = document.createElement("tr");

            if (currentTarget === "student") {

                row.appendChild(
                    createCell(`#${record.student_id}`)
                );

                row.appendChild(
                    createCell(record.student_name)
                );

                row.appendChild(
                    createCell(
                        `${record.class_name} - ${record.section}`
                    )
                );

            } else {

                row.appendChild(
                    createCell(`#${record.teacher_id}`)
                );

                row.appendChild(
                    createCell(record.teacher_name)
                );

                row.appendChild(
                    createCell(record.post)
                );

            }

            const editing = isEditing();

            const statusCell = createCell(
                editing
                    ? statusChoice(record, row)
                    : statusBadge(record.status)
            );

            statusCell.style.textAlign = "center";

            row.appendChild(statusCell);

            if (editing && isChanged(record)) {
                row.classList.add("row-changed");
            }

            tableBody.appendChild(row);

        });

        recordCount.textContent =
            `${records.length} Records`;

    }

    /* =========================================================
       MONTHLY TABLE RENDERING
    ========================================================= */

    function renderMonthlyTable(
        year,
        month,
        totalDays,
        eligibleDays
    ) {

        if (!tableHead || !tableBody) return;

        table.classList.add("monthly-attendance-table");

        tableHead.replaceChildren();
        tableBody.replaceChildren();

        const headerRow = document.createElement("tr");

        headerRow.appendChild(
            createCell(
                currentTarget === "student"
                    ? "Student Name"
                    : "Teacher Name",
                "th"
            )
        );

        if (currentTarget === "student") {

            headerRow.appendChild(
                createCell("Class", "th")
            );

        } else {

            headerRow.appendChild(
                createCell("Post", "th")
            );

        }

        /*
         * Create one column for each calendar date.
         */

        for (let day = 1; day <= totalDays; day++) {

            const th = createCell(
                String(day),
                "th",
                "day-column"
            );

            const date = dateForDay(year, month, day);

            const dateObject = new Date(year, month - 1, day);

            const weekday = dateObject.toLocaleDateString(
                "en-IN",
                { weekday: "short" }
            );

            th.title = `${formatDate(date)} (${weekday})`;

            headerRow.appendChild(th);

        }

        /*
         * Summary columns.
         */

        const summaryHeaders = [
            "Present",
            "Absent",
            "N/A",
            "Rate"
        ];

        summaryHeaders.forEach((header) => {

            headerRow.appendChild(
                createCell(header, "th", "summary-column")
            );

        });

        tableHead.appendChild(headerRow);

        const records = filteredRoster();

        if (!records.length) {

            setEmptyMessage(
                "No records found",
                "No members match the selected filters.",
                headerRow.children.length
            );

            recordCount.textContent = "0 Records";

            return;

        }

        records.forEach((record) => {

            const row = document.createElement("tr");

            row.appendChild(
                createCell(
                    currentTarget === "student"
                        ? record.student_name
                        : record.teacher_name
                )
            );

            row.appendChild(
                createCell(
                    currentTarget === "student"
                        ? record.class_name
                        : record.post
                )
            );

            let present = 0;
            let absent = 0;
            let notMarked = 0;

            /*
             * Calendar cells.
             */

            for (let day = 1; day <= totalDays; day++) {

                const cell = document.createElement("td");

                cell.className = "day-column";

                const date = dateForDay(year, month, day);

                if (day > eligibleDays) {

                    const dash = document.createElement("span");

                    dash.textContent = "—";
                    dash.style.color = "#cbd5e1";
                    dash.title = "Future date";

                    cell.appendChild(dash);

                } else {

                    const status =
                        record.attendance.get(date) || "N/A";

                    if (status === "Present") {
                        present++;
                    } else if (status === "Absent") {
                        absent++;
                    } else {
                        notMarked++;
                    }

                    cell.appendChild(
                        statusSymbol(status)
                    );

                }

                row.appendChild(cell);

            }

            /*
             * Summary cells.
             */

            const marked = present + absent;

            const rate = marked
                ? Math.round((present / marked) * 100)
                : 0;

            row.appendChild(
                createCell(present, "td", "summary-column present-total")
            );

            row.appendChild(
                createCell(absent, "td", "summary-column absent-total")
            );

            row.appendChild(
                createCell(notMarked, "td", "summary-column na-total")
            );

            row.appendChild(
                createCell(`${rate}%`, "td", "summary-column")
            );

            tableBody.appendChild(row);

        });

        recordCount.textContent =
            `${records.length} Records`;

        if (eligibleDays === 0) {

            tableSubtitle.textContent =
                "No dates in this month are eligible for attendance yet.";

        } else {

            tableSubtitle.textContent =
                `Attendance history from 1 to ${eligibleDays} ${formatMonth(
                    `${year}-${String(month).padStart(2, "0")}`
                )}.`;

        }

    }

    /* =========================================================
       EDIT MODE
       Daily view only. Statuses can be set to Present or Absent
       and are saved with the Save Attendance button.
    ========================================================= */

    const SAVE_CHUNK_SIZE = 200;

    function isFutureDate(value) {
        return Boolean(value) && value > today();
    }

    // true when the table on screen can be edited
    function canEdit() {
        return currentView === "daily" && !isFutureDate(loadedDate || dateInput?.value);
    }

    function isEditing() {
        return editMode && canEdit();
    }

    function isChanged(record) {
        return (record.status === "Present" || record.status === "Absent") &&
            record.status !== record.originalStatus;
    }

    function changedRecords() {
        return currentView === "daily" ? currentRoster.filter(isChanged) : [];
    }

    function hasUnsavedChanges() {
        return changedRecords().length > 0;
    }

    function discardChanges() {
        currentRoster.forEach((record) => {
            if (record.originalStatus !== undefined) {
                record.status = record.originalStatus;
            }
        });
    }

    // Ask before throwing away unsaved changes. Returns true if it is fine to continue.
    function confirmDiscard() {

        if (!hasUnsavedChanges()) {
            return true;
        }

        const ok = window.confirm(
            "You have unsaved attendance changes. Discard them?"
        );

        if (ok) {
            discardChanges();
            updateEditUI();
        }

        return ok;

    }

    function showBanner(kind, message) {

        if (!feedbackBanner) return;

        feedbackBanner.textContent = message;
        feedbackBanner.dataset.kind = kind;
        feedbackBanner.className = `attendance-feedback-banner ${kind}`;

    }

    function hideBanner(onlyKind) {

        if (!feedbackBanner) return;

        if (onlyKind && feedbackBanner.dataset.kind !== onlyKind) {
            return;
        }

        feedbackBanner.className = "attendance-feedback-banner hidden";
        feedbackBanner.textContent = "";
        delete feedbackBanner.dataset.kind;

    }

    // Tell other open pages (e.g. a student's profile) that attendance changed.
    function notifyAttendanceUpdated() {
        try { localStorage.setItem("school_attendance_updated", String(Date.now())); } catch (_) {}
        try {
            if ("BroadcastChannel" in window) {
                const channel = new BroadcastChannel("school-attendance");
                channel.postMessage({ type: "attendance-updated" });
                channel.close();
            }
        } catch (_) {}
    }

    function updateLegendNote() {

        if (!legendNote) return;

        if (currentView === "monthly") {
            legendNote.textContent = "Scroll horizontally to view all dates.";
        } else if (isEditing()) {
            legendNote.textContent =
                "Edit mode is ON: choose Present or Absent for each member, then click Save Attendance.";
        } else {
            legendNote.textContent = "Attendance is displayed in read-only mode.";
        }

    }

    // Keeps the switch, Save button, quick actions and hints in sync with the state.
    function updateEditUI() {

        const editing = isEditing();
        const count = changedRecords().length;

        if (toggleEditBtn) {
            toggleEditBtn.classList.toggle("is-on", editMode);
            toggleEditBtn.setAttribute("aria-checked", String(editMode));
        }

        if (toggleModeStatus) {
            toggleModeStatus.textContent = editMode ? "ON" : "OFF";
        }

        saveBtn?.classList.toggle("hidden", !editing);
        editQuickActions?.classList.toggle("hidden", !editing);

        if (saveBtn) {
            saveBtn.disabled = saving || count === 0;
        }

        if (unsavedBadge) {
            unsavedBadge.textContent = String(count);
            unsavedBadge.classList.toggle("hidden", count === 0);
        }

        table?.classList.toggle("editing", editing);

        // Explain why editing is not available instead of failing silently.
        if (editMode && !canEdit()) {
            showBanner(
                "info",
                currentView === "monthly"
                    ? "Attendance can only be edited in the Daily View. Switch to Daily View to make changes."
                    : "Attendance cannot be marked for a future date. Choose today or an earlier date."
            );
        } else {
            hideBanner("info");
        }

        updateLegendNote();

    }

    // The Present / Absent buttons shown in a row while editing.
    function statusChoice(record, row) {

        const group = document.createElement("div");

        group.className = "status-toggle";
        group.setAttribute("role", "group");
        group.setAttribute(
            "aria-label",
            `Attendance status for ${record.student_name || record.teacher_name || "member"}`
        );

        const buttons = {};

        ["Present", "Absent"].forEach((status) => {

            const button = document.createElement("button");

            button.type = "button";
            button.className = `status-choice ${status.toLowerCase()}`;
            button.textContent = status;
            button.addEventListener("click", () => {
                setStatus(record, status, row, buttons);
            });

            buttons[status] = button;
            group.appendChild(button);

        });

        syncChoice(record, row, buttons);

        return group;

    }

    function syncChoice(record, row, buttons) {

        Object.entries(buttons).forEach(([status, button]) => {

            const active = record.status === status;

            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));

        });

        row.classList.toggle("row-changed", isChanged(record));

    }

    function setStatus(record, status, row, buttons) {

        if (saving) return;

        record.status = status;

        syncChoice(record, row, buttons);

        hideBanner();   // a new change makes an old success/error message out of date

        updateKPIs();

        updateEditUI();

    }

    function markAll(status) {

        if (!isEditing() || saving) return;

        filteredRoster().forEach((record) => {
            record.status = status;
        });

        hideBanner();

        renderDailyTable();

        updateKPIs();

        updateEditUI();

    }

    function toggleEditMode() {

        if (saving) return;

        if (editMode && !confirmDiscard()) {
            return;
        }

        editMode = !editMode;

        hideBanner();

        updateEditUI();

        if (currentView === "daily") {
            renderDailyTable();
            updateKPIs();
        }

    }

    function buildPayload(records) {

        const clean = (value) => (value === "—" ? "" : String(value ?? ""));

        if (currentTarget === "student") {

            return records.map((record) => ({
                student_id: Number(record.student_id),
                student_name: record.student_name,
                class_name: clean(record.class_name),
                section: clean(record.section),
                date: loadedDate,
                status: record.status
            }));

        }

        // Teacher times are left out on purpose: the server keeps the stored
        // times of an existing record and uses the defaults for a new one.
        return records.map((record) => ({
            teacher_id: Number(record.teacher_id),
            teacher_name: record.teacher_name,
            post: record.post,
            date: loadedDate,
            status: record.status
        }));

    }

    async function saveAttendance() {

        if (saving || !isEditing()) return;

        const records = changedRecords();

        if (!records.length) return;

        if (isFutureDate(loadedDate)) {
            showBanner("error", "Attendance cannot be marked for a future date.");
            return;
        }

        saving = true;

        const originalLabel = saveBtn.querySelector(".save-btn-text");

        if (originalLabel) originalLabel.textContent = "Saving...";

        updateEditUI();

        const endpoint =
            currentTarget === "student" ? "/attendance" : "/teacher-attendance";

        const noun = currentTarget === "student" ? "student" : "teacher";

        let savedCount = 0;

        try {

            for (let start = 0; start < records.length; start += SAVE_CHUNK_SIZE) {

                const chunk = records.slice(start, start + SAVE_CHUNK_SIZE);

                const response = await request(`${apiBase()}${endpoint}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(buildPayload(chunk))
                });

                await readResponse(response);

                chunk.forEach((record) => {
                    record.originalStatus = record.status;   // now saved
                });

                savedCount += chunk.length;

                notifyAttendanceUpdated();

            }

            showBanner(
                "success",
                `Attendance saved for ${savedCount} ${noun}${savedCount === 1 ? "" : "s"} on ${formatDate(loadedDate)}.`
            );

        } catch (error) {

            console.error("Attendance save error:", error);

            showBanner(
                "error",
                savedCount
                    ? `Saved ${savedCount} of ${records.length}, then failed: ${error.message}. The remaining changes are still unsaved.`
                    : `Could not save attendance: ${error.message}`
            );

        } finally {

            saving = false;

            if (originalLabel) originalLabel.textContent = "Save Attendance";

            renderDailyTable();

            updateKPIs();

            updateEditUI();

        }

    }

    /* =========================================================
       KPI CALCULATIONS
    ========================================================= */

    function updateKPIs() {

        const total = currentRoster.length;

        let present = 0;
        let absent = 0;
        let notMarked = 0;

        if (currentView === "daily") {

            currentRoster.forEach((record) => {

                if (record.status === "Present") {
                    present++;
                } else if (record.status === "Absent") {
                    absent++;
                } else {
                    notMarked++;
                }

            });

        } else {

            currentRoster.forEach((record) => {

                record.attendance.forEach((status) => {

                    if (status === "Present") {
                        present++;
                    } else if (status === "Absent") {
                        absent++;
                    } else {
                        notMarked++;
                    }

                });

            });

        }

        const marked = present + absent;

        const rate = marked
            ? Math.round((present / marked) * 100)
            : 0;

        if (kpiTotal) {
            kpiTotal.textContent = String(total);
        }

        if (kpiPresent) {
            kpiPresent.textContent = String(present);
        }

        if (kpiAbsent) {
            kpiAbsent.textContent = String(absent);
        }

        if (kpiNotMarked) {
            kpiNotMarked.textContent = String(notMarked);
        }

        if (kpiRate) {
            kpiRate.textContent = `${rate}%`;
        }

    }

    /* =========================================================
       EVENT LISTENERS
    ========================================================= */

    loadBtn?.addEventListener(
        "click",
        () => {
            if (confirmDiscard()) {
                fetchRosterAndAttendance();
            }
        }
    );

    dateInput?.addEventListener(
        "change",
        () => {
            if (currentView === "daily") {
                if (!confirmDiscard()) {
                    dateInput.value = applied.date;   // keep showing the table that has the changes
                    return;
                }
                fetchRosterAndAttendance();
            }
        }
    );

    monthInput?.addEventListener(
        "change",
        () => {
            if (currentView === "monthly") {
                fetchRosterAndAttendance();
            }
        }
    );

    classSelect?.addEventListener(
        "change",
        () => {
            if (!confirmDiscard()) {
                classSelect.value = applied.cls;
                return;
            }
            fetchRosterAndAttendance();
        }
    );

    sectionSelect?.addEventListener(
        "change",
        () => {
            if (!confirmDiscard()) {
                sectionSelect.value = applied.sec;
                return;
            }
            fetchRosterAndAttendance();
        }
    );

    toggleEditBtn?.addEventListener("click", toggleEditMode);

    saveBtn?.addEventListener("click", saveAttendance);

    markAllPresentBtn?.addEventListener("click", () => markAll("Present"));

    markAllAbsentBtn?.addEventListener("click", () => markAll("Absent"));

    // Warn before leaving the page with unsaved changes.
    window.addEventListener("beforeunload", (event) => {
        if (hasUnsavedChanges()) {
            event.preventDefault();
            event.returnValue = "";
        }
    });

    searchInput?.addEventListener(
        "input",
        () => {

            if (currentView === "daily") {
                renderDailyTable();
            } else {
                const value = monthInput?.value || currentMonth();

                const [year, month] = value.split("-").map(Number);

                renderMonthlyTable(
                    year,
                    month,
                    daysInMonth(year, month),
                    getEligibleDays(year, month)
                );
            }

        }
    );

    /* =========================================================
       INITIAL LOAD
       Optional link parameters (used by a student's profile page):
       ?date=YYYY-MM-DD&class=9&section=A&q=<name or id>&edit=1&from=profile&student_id=<id>
    ========================================================= */

    const linkParams = new URLSearchParams(window.location.search);
    const hasOption = (select, value) => Boolean(select) && [...select.options].some((option) => option.value === value);

    const linkedDate = linkParams.get("date") || "";
    if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate) && linkedDate <= today()) {
        dateInput.value = linkedDate;
    }
    if (hasOption(classSelect, linkParams.get("class") || "")) classSelect.value = linkParams.get("class");
    if (hasOption(sectionSelect, linkParams.get("section") || "")) sectionSelect.value = linkParams.get("section");
    if (searchInput && linkParams.get("q")) searchInput.value = linkParams.get("q");
    if (linkParams.get("edit") === "1") editMode = true;

    const backToProfile = $("backToProfileLink");
    if (backToProfile && linkParams.get("from") === "profile" && /^\d+$/.test(linkParams.get("student_id") || "")) {
        const back = new URLSearchParams({ student_id: linkParams.get("student_id"), tab: "attendance" });
        if (linkParams.get("return_url")) back.set("return_url", linkParams.get("return_url"));
        backToProfile.href = `student_details.html?${back.toString()}`;
        backToProfile.classList.remove("hidden");
    }

    switchTarget("student");

});