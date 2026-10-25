
/* ==========================================================================
   ATTENDANCE MANAGEMENT
   Secure student/teacher attendance, rendering, filtering, and saving.
   Requires api.js with authenticatedFetch().
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const dateInput = $("attDate");
    const classSelect = $("attClass");
    const sectionSelect = $("attSection");
    const classFilterGroup = $("classFilterGroup");
    const sectionFilterGroup = $("sectionFilterGroup");
    const searchInput = $("attSearch");
    const searchLabel = $("searchLabel");
    const loadBtn = $("loadAttendanceBtn");
    const markAllBtn = $("markAllPresentBtn");
    const saveBtn = $("saveAttendanceBtn");
    const tableHead = $("attendanceTableHead");
    const tableBody = $("attendanceTableBody");
    const targetStudentBtn = $("targetStudentBtn");
    const targetTeacherBtn = $("targetTeacherBtn");
    const kpiTotalLabel = $("kpiTotalLabel");
    const kpiTotal = $("kpiTotal");
    const kpiPresent = $("kpiPresent");
    const kpiAbsent = $("kpiAbsent");
    const kpiRate = $("kpiRate");

    const apiBase = () =>
        (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    if (dateInput && !dateInput.value) dateInput.value = today();

    let currentTarget = "student";
    let currentRoster = [];
    let loading = false;

    function validId(id) {
        return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
    }

    function setMessage(message, columns) {
        if (!tableBody) return;
        tableBody.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = columns;
        cell.className = "table-loading";
        cell.textContent = message;
        row.appendChild(cell);
        tableBody.appendChild(row);
    }

    function request(url, options) {
        if (typeof window.authenticatedFetch !== "function") {
            throw new Error("Authentication helper unavailable. Check api.js.");
        }
        return window.authenticatedFetch(url, options);
    }

    async function readResponse(response) {
        let data = null;
        try {
            data = await response.json();
        } catch (_) {}
        if (!response.ok) {
            throw new Error(
                typeof data?.detail === "string"
                    ? data.detail
                    : `Request failed (HTTP ${response.status}).`
            );
        }
        return data;
    }

    function switchTarget(target) {
        if (target !== "student" && target !== "teacher") return;
        currentTarget = target;

        targetStudentBtn?.classList.toggle("active", target === "student");
        targetTeacherBtn?.classList.toggle("active", target === "teacher");

        if (classFilterGroup) classFilterGroup.style.display = target === "student" ? "flex" : "none";
        if (sectionFilterGroup) sectionFilterGroup.style.display = target === "student" ? "flex" : "none";
        if (searchLabel) searchLabel.textContent = target === "student" ? "Search Student" : "Search Teacher";
        if (searchInput) searchInput.placeholder = target === "student"
            ? "Type name or student ID..."
            : "Type name, ID, or post...";
        if (kpiTotalLabel) kpiTotalLabel.textContent = target === "student" ? "Total Enrolled" : "Total Teachers";

        fetchRosterAndAttendance();
    }

    targetStudentBtn?.addEventListener("click", () => switchTarget("student"));
    targetTeacherBtn?.addEventListener("click", () => switchTarget("teacher"));

    async function fetchRosterAndAttendance() {
        if (!tableBody || loading) return;
        loading = true;
        const columns = currentTarget === "student" ? 4 : 6;
        setMessage("Loading roster and attendance...", columns);

        try {
            const selectedDate = dateInput?.value || today();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
                throw new Error("Please select a valid date.");
            }

            if (currentTarget === "student") {
                await fetchStudentsAttendance(selectedDate);
            } else {
                await fetchTeachersAttendance(selectedDate);
            }
        } catch (error) {
            console.error("Attendance loading error:", error);
            setMessage("Unable to load attendance. Check your session and backend connection.", columns);
        } finally {
            loading = false;
        }
    }

    async function fetchStudentsAttendance(selectedDate) {
        const selectedClass = classSelect?.value || "ALL";
        const selectedSection = sectionSelect?.value || "ALL";

        const studentsResponse = await request(`${apiBase()}/students`);
        const studentsData = await readResponse(studentsResponse);
        const studentList = Array.isArray(studentsData)
            ? studentsData
            : studentsData?.students;

        if (!Array.isArray(studentList)) throw new Error("Unexpected students response.");

        const filteredStudents = studentList.filter((s) => {
            const cls = String(s.class ?? s.class_name ?? "").trim().toUpperCase();
            const section = String(s.section ?? "").trim().toUpperCase();
            return (selectedClass === "ALL" || cls === selectedClass.trim().toUpperCase()) &&
                (selectedSection === "ALL" || section === selectedSection.trim().toUpperCase());
        });

        const query = new URLSearchParams({ date_val: selectedDate });
        if (selectedClass !== "ALL") query.set("class_name", selectedClass);
        if (selectedSection !== "ALL") query.set("section", selectedSection);

        const attendanceResponse = await request(`${apiBase()}/attendance?${query}`);
        const attendanceData = await readResponse(attendanceResponse);
        const attendance = Array.isArray(attendanceData) ? attendanceData : [];
        const attendanceMap = new Map();

        attendance.forEach((item) => {
            if (validId(item.student_id) && ["Present", "Absent"].includes(item.status)) {
                attendanceMap.set(String(item.student_id), item.status);
            }
        });

        currentRoster = filteredStudents
            .filter((s) => validId(s.student_id))
            .map((s) => ({
                student_id: Number(s.student_id),
                student_name: String(s.full_name || "—"),
                class_name: String(s.class ?? s.class_name ?? "—"),
                section: String(s.section ?? "—"),
                status: attendanceMap.get(String(s.student_id)) || "Present"
            }));

        renderCurrentTable();
        updateKPIs();
    }

    async function fetchTeachersAttendance(selectedDate) {
        const teachersResponse = await request(`${apiBase()}/teachers`);
        const teachersData = await readResponse(teachersResponse);
        const teacherList = Array.isArray(teachersData) ? teachersData : teachersData?.teachers;

        if (!Array.isArray(teacherList)) throw new Error("Unexpected teachers response.");

        const query = new URLSearchParams({ date_val: selectedDate });
        const attendanceResponse = await request(`${apiBase()}/teacher-attendance?${query}`);
        const attendanceData = await readResponse(attendanceResponse);
        const attendance = Array.isArray(attendanceData) ? attendanceData : [];
        const attendanceMap = new Map();

        attendance.forEach((item) => {
            if (validId(item.teacher_id)) attendanceMap.set(String(item.teacher_id), item);
        });

        currentRoster = teacherList
            .filter((t) => validId(t.teacher_id))
            .map((t) => {
                const record = attendanceMap.get(String(t.teacher_id));
                return {
                    teacher_id: Number(t.teacher_id),
                    teacher_name: String(t.full_name || "—"),
                    post: String(t.post || "Teacher"),
                    status: ["Present", "Absent"].includes(record?.status) ? record.status : "Present",
                    time_in: /^\d{2}:\d{2}$/.test(record?.time_in || "") ? record.time_in : "09:00",
                    time_out: /^\d{2}:\d{2}$/.test(record?.time_out || "") ? record.time_out : "16:00"
                };
            });

        renderCurrentTable();
        updateKPIs();
    }

    function createCell(text, tag = "td") {
        const cell = document.createElement(tag);
        cell.textContent = String(text ?? "");
        return cell;
    }

    function statusButton(label, selected, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `status-pill ${selected ? (label === "Present" ? "selected-present" : "selected-absent") : ""}`;
        button.textContent = label;
        button.setAttribute("aria-pressed", String(selected));
        button.addEventListener("click", onClick);
        return button;
    }

    function filteredRoster() {
        const term = (searchInput?.value || "").toLowerCase().trim();
        return currentRoster.filter((r) => {
            const name = currentTarget === "student" ? r.student_name : r.teacher_name;
            const id = currentTarget === "student" ? r.student_id : r.teacher_id;
            return [name, id, r.class_name, r.section, r.post]
                .some((value) => String(value ?? "").toLowerCase().includes(term));
        });
    }

    function renderCurrentTable() {
        if (!tableHead || !tableBody) return;
        tableHead.replaceChildren();
        tableBody.replaceChildren();

        const columns = currentTarget === "student"
            ? ["Student ID", "Student Name", "Class & Section", "Attendance Status"]
            : ["Teacher ID", "Teacher Name", "Designation / Post", "Time In (Arrival)", "Time Out (Departure)", "Attendance Status"];

        const headRow = document.createElement("tr");
        columns.forEach((column) => headRow.appendChild(createCell(column, "th")));
        tableHead.appendChild(headRow);

        const filtered = filteredRoster();
        if (!filtered.length) {
            setMessage(`No ${currentTarget}s found matching filters.`, columns.length);
            return;
        }

        filtered.forEach((record) => {
            const row = document.createElement("tr");
            const id = currentTarget === "student" ? record.student_id : record.teacher_id;
            row.dataset[currentTarget + "Id"] = String(id);

            row.appendChild(createCell(`#${id}`));
            row.appendChild(createCell(currentTarget === "student" ? record.student_name : record.teacher_name));

            if (currentTarget === "student") {
                row.appendChild(createCell(`${record.class_name} ${record.section}`.trim()));
            } else {
                row.appendChild(createCell(record.post));

                ["time_in", "time_out"].forEach((field) => {
                    const cell = document.createElement("td");
                    const input = document.createElement("input");
                    input.type = "time";
                    input.className = "time-input";
                    input.value = record[field];
                    input.addEventListener("change", () => {
                        if (/^\d{2}:\d{2}$/.test(input.value)) record[field] = input.value;
                    });
                    cell.appendChild(input);
                    row.appendChild(cell);
                });
            }

            const statusCell = document.createElement("td");
            statusCell.style.textAlign = "center";
            const group = document.createElement("div");
            group.className = "status-pill-group";
            group.style.justifyContent = "center";

            ["Present", "Absent"].forEach((status) => {
                group.appendChild(statusButton(status, record.status === status, () => {
                    record.status = status;
                    renderCurrentTable();
                    updateKPIs();
                }));
            });

            statusCell.appendChild(group);
            row.appendChild(statusCell);
            tableBody.appendChild(row);
        });
    }

    function updateKPIs() {
        const total = currentRoster.length;
        const present = currentRoster.filter((r) => r.status === "Present").length;
        const absent = currentRoster.filter((r) => r.status === "Absent").length;

        if (kpiTotal) kpiTotal.textContent = String(total);
        if (kpiPresent) kpiPresent.textContent = String(present);
        if (kpiAbsent) kpiAbsent.textContent = String(absent);
        if (kpiRate) kpiRate.textContent = `${total ? Math.round((present / total) * 100) : 0}%`;
    }

    markAllBtn?.addEventListener("click", () => {
        currentRoster.forEach((r) => { r.status = "Present"; });
        renderCurrentTable();
        updateKPIs();
    });

    saveBtn?.addEventListener("click", async () => {
        if (!currentRoster.length) {
            alert(`No ${currentTarget}s in the current roster to save.`);
            return;
        }

        const selectedDate = dateInput?.value || today();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
            alert("Please select a valid date.");
            return;
        }

        if (currentRoster.some((r) => !["Present", "Absent"].includes(r.status))) {
            alert("Please select a valid status for every record.");
            return;
        }

        saveBtn.disabled = true;
        const oldText = saveBtn.textContent;
        saveBtn.textContent = "Saving...";

        try {
            const endpoint = currentTarget === "student" ? "/attendance" : "/teacher-attendance";
            const payload = currentRoster.map((r) => currentTarget === "student"
                ? {
                    student_id: r.student_id,
                    student_name: r.student_name,
                    class_name: r.class_name,
                    section: r.section,
                    date: selectedDate,
                    status: r.status
                }
                : {
                    teacher_id: r.teacher_id,
                    teacher_name: r.teacher_name,
                    post: r.post,
                    date: selectedDate,
                    status: r.status,
                    time_in: r.time_in,
                    time_out: r.time_out
                });

            const response = await request(`${apiBase()}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            await readResponse(response);
            alert(`Attendance saved successfully for ${payload.length} ${currentTarget}s on ${selectedDate}.`);
        } catch (error) {
            console.error("Save attendance error:", error);
            alert(`Unable to save attendance: ${error.message}`);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = oldText || "Save Attendance";
        }
    });

    loadBtn?.addEventListener("click", fetchRosterAndAttendance);
    classSelect?.addEventListener("change", fetchRosterAndAttendance);
    sectionSelect?.addEventListener("change", fetchRosterAndAttendance);
    dateInput?.addEventListener("change", fetchRosterAndAttendance);
    searchInput?.addEventListener("input", renderCurrentTable);

    fetchRosterAndAttendance();
});
