/* ==========================================================================
   STUDENT DETAILS VIEW
   Displays student profile (overview, attendance, fees, marks) and provides
   print, edit, and delete actions.
   Requires api.js, sidebar.js, and script.js.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const params = new URLSearchParams(window.location.search);
    const currentStudentId = params.get("student_id");
    const rawReturnUrl = params.get("return_url");

    function getApiBase() {
        return (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    }

    function validStudentId(id) {
        return /^\d+$/.test(String(id ?? "").trim()) && Number(id) > 0;
    }

    function safeReturnUrl(value) {
        if (!value) return null;
        try {
            const parsed = new URL(value, window.location.href);
            if (parsed.origin !== window.location.origin) return null;
            if (parsed.username || parsed.password) return null;

            const path = parsed.pathname.toLowerCase();
            const allowed =
                path.endsWith("/section_details.html") ||
                path.endsWith("/class_details.html") ||
                path.endsWith("/student.html");

            if (!allowed) return null;
            return parsed.pathname + parsed.search + parsed.hash;
        } catch (_) {
            return null;
        }
    }

    const returnUrl = safeReturnUrl(rawReturnUrl);

    function goBackToStudents() {
        window.location.href = returnUrl || "student.html";
    }

    // Back button
    const backToStudents = document.getElementById("backToStudents");
    if (backToStudents) {
        if (returnUrl && returnUrl.toLowerCase().includes("section_details")) {
            backToStudents.textContent = "← Back to Section";
        } else if (returnUrl && returnUrl.toLowerCase().includes("class_details")) {
            backToStudents.textContent = "← Back to Class";
        }
        backToStudents.addEventListener("click", goBackToStudents);
    }

    // Print button
    const printStudentBtn = document.getElementById("printStudentBtn");
    if (printStudentBtn) {
        printStudentBtn.addEventListener("click", () => window.print());
    }

    // Edit button
    const editStudentBtn = document.getElementById("editStudentBtn");
    if (editStudentBtn) {
        editStudentBtn.addEventListener("click", () => {
            if (!validStudentId(currentStudentId)) {
                alert("A valid student ID was not provided.");
                return;
            }
            const query = new URLSearchParams({ student_id: currentStudentId });
            if (returnUrl) query.set("return_url", returnUrl);
            window.location.href = `edit_student.html?${query.toString()}`;
        });
    }

    // Delete button
    const deleteStudentBtn = document.getElementById("deleteStudentBtn");
    if (deleteStudentBtn) {
        deleteStudentBtn.addEventListener("click", () => {
            if (!validStudentId(currentStudentId)) {
                alert("A valid student ID was not provided.");
                return;
            }
            deleteStudent(currentStudentId);
        });
    }

    function deleteStudent(studentId) {
        if (typeof window.showDeleteConfirmationModal !== "function") {
            alert("Delete confirmation modal is unavailable.");
            return;
        }

        window.showDeleteConfirmationModal({
            title: "Delete Student?",
            initialMessage: "Please wait before confirmation.",
            confirmMessage: "Are you sure you want to permanently delete this student?",
            countdownSeconds: 5,

            onConfirm: async () => {
                try {
                    const response = await window.authenticatedFetch(
                        `${getApiBase()}/students/${encodeURIComponent(studentId)}`,
                        { method: "DELETE" }
                    );

                    if (!response.ok) {
                        let message = `Failed to delete student (HTTP ${response.status}).`;
                        try {
                            const result = await response.json();
                            if (typeof result.detail === "string") message = result.detail;
                        } catch (_) {}
                        alert(message);
                        return;
                    }

                    alert("Student deleted successfully!");
                    goBackToStudents();
                } catch (error) {
                    console.error("Error deleting student:", error);
                    alert("Unable to connect to the backend. Check your session and try again.");
                }
            }
        });
    }

    // Generic Authenticated API GET helper
    async function apiGet(path) {
        if (typeof window.authenticatedFetch !== "function") {
            throw new Error("Authentication helper is unavailable. Check api.js.");
        }
        const response = await window.authenticatedFetch(`${getApiBase()}${path}`);
        if (!response.ok) {
            const error = new Error(`Request failed (HTTP ${response.status})`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent =
                value === null || value === undefined || value === ""
                    ? "-"
                    : String(value);
        }
    }

    // Load Basic Student Overview
    async function loadStudentOverview() {
        if (!validStudentId(currentStudentId)) {
            alert("A valid student ID was not provided.");
            goBackToStudents();
            return null;
        }

        try {
            const student = await apiGet(
                `/students/details?student_id=${encodeURIComponent(currentStudentId)}`
            );

            if (!student || typeof student !== "object" || Array.isArray(student)) {
                throw new Error("Unexpected student details response format.");
            }

            const fullName = student.full_name || "Student";
            setText("profileName", fullName);
            setText(
                "studentAvatar",
                fullName.trim().charAt(0).toUpperCase() || "S"
            );
            setText(
                "profileClassLine",
                `Class ${student.class ?? "-"} | Section ${student.section ?? "-"} | Roll No. ${student.roll_no ?? student.admission_no ?? student.student_id ?? "-"}`
            );
            document.title = `${fullName} - Student Profile`;

            const fields = {
                studentId: student.student_id,
                dateOfBirth: student.date_of_birth,
                gender: student.gender,
                category: student.category,
                bloodGroup: student.blood_group,
                bpl: student.bpl,

                fatherName: student.father_name,
                fatherPhone: student.father_phone,
                motherName: student.mother_name,
                motherPhone: student.mother_phone,

                admissionDate: student.admission_date,
                admissionNo: student.admission_no,
                className: student.class,
                section: student.section,
                apaarNo: student.apaar_no,
                penNo: student.pen_no,
                aadharLastFour: student.aadhar_no_last_four,

                houseNo: student.house_no,
                street: student.street,
                city: student.city,
                state: student.state,
                pincode: student.pincode,

                fatherAadhar: student.father_aadhar_last_four,
                motherAadhar: student.mother_aadhar_last_four
            };

            Object.entries(fields).forEach(([elementId, value]) => {
                setText(elementId, value);
            });
            return student;
        } catch (error) {
            console.error("Error loading student overview:", error);
            alert("Unable to load student details. Check your session and backend connection.");
            return null;
        }
    }

    /* ==========================================================================
       TAB SWITCHING & DATA LOADING (ATTENDANCE, FEES, MARKS)
       ========================================================================== */

    const cache = {
        marks: null
    };

    const tabButtons = document.querySelectorAll(".profile-tab");
    const tabPanels = document.querySelectorAll(".profile-tab-panel");

    function activateTab(tabName) {
        tabButtons.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-selected", String(isActive));
            btn.tabIndex = isActive ? 0 : -1;
        });

        tabPanels.forEach(panel => {
            const isTarget = panel.id === `panel-${tabName}`;
            panel.hidden = !isTarget;
        });

        if (tabName === "fees") {
            loadFees();            // always fetch fresh fee details
        } else if (tabName === "attendance") {
            loadAttendance();      // always fetch fresh attendance
        } else if (tabName !== "overview") {
            loadRecords(tabName);
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => activateTab(btn.dataset.tab));

        // Keyboard navigation across tabs
        btn.addEventListener("keydown", event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const tabs = Array.from(tabButtons);
            const index = tabs.indexOf(btn);
            let nextIndex = index;

            if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = tabs.length - 1;
            else if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;

            tabs[nextIndex].focus();
            activateTab(tabs[nextIndex].dataset.tab);
        });
    });

    // Refresh buttons
    document.querySelectorAll(".refresh-records-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const type = btn.dataset.refresh;
            if (type && cache.hasOwnProperty(type)) {
                cache[type] = null;
                loadRecords(type, true);
            }
        });
    });

    // Normalizes list responses
    function asRows(payload) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== "object") return [];
        for (const key of ["records", "data", "items", "attendance", "fees", "payments", "marks", "results"]) {
            if (Array.isArray(payload[key])) return payload[key];
        }
        return [];
    }

    function createSummaryCard(label, value) {
        const card = document.createElement("div");
        card.className = "summary-card";

        const span = document.createElement("span");
        span.textContent = label;

        const strong = document.createElement("strong");
        strong.textContent = String(value);

        card.append(span, strong);
        return card;
    }

    function formatCurrency(num) {
        const n = Number(num);
        if (!Number.isFinite(n)) return "₹0.00";
        return n.toLocaleString("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        });
    }

    /* ----------------------------------------
       ATTENDANCE (read-only; changed in the Attendance section)
       ---------------------------------------- */
    const attendanceMessageEl = document.getElementById("attendanceMessage");
    const attendanceContentEl = document.getElementById("attendanceContent");
    const manageAttendanceLink = document.getElementById("manageAttendanceBtn");
    const attendanceMonthFilter = document.getElementById("attendanceMonthFilter");
    let attendanceLoaded = false, attendanceLoading = false, attendanceReloadQueued = false;
    let attendanceRows = [], attendanceYear = "";

    function todayIso() {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    function monthLabel(key) {   // "2026-04" -> "Apr 2026"
        return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    }

    function ratePercent(present, absent) {
        const marked = present + absent;
        return marked ? `${((present / marked) * 100).toFixed(1)}%` : "-";
    }

    // The "Manage Attendance" button opens the Attendance section for this student's class,
    // with the student searched and Edit Attendance already switched on.
    function updateManageAttendanceLink() {
        if (!manageAttendanceLink) return;
        if (!validStudentId(currentStudentId)) {
            manageAttendanceLink.setAttribute("aria-disabled", "true");
            manageAttendanceLink.removeAttribute("href");
            return;
        }
        const query = new URLSearchParams({ target: "student", date: todayIso(), q: currentStudentId, edit: "1", from: "profile", student_id: currentStudentId });
        const classKey = String(studentInfo?.class ?? "").trim();
        const section = String(studentInfo?.section ?? "").trim();
        if (classKey) query.set("class", classKey);
        if (section) query.set("section", section);
        if (returnUrl) query.set("return_url", returnUrl);
        manageAttendanceLink.href = `attendance.html?${query.toString()}`;
        manageAttendanceLink.removeAttribute("aria-disabled");
    }

    function showAttendanceMessage(text, isError = false) {
        attendanceMessageEl.textContent = text;
        attendanceMessageEl.classList.toggle("is-error", isError);
        attendanceMessageEl.hidden = false;
        attendanceContentEl.hidden = true;
    }

    function renderAttendanceDays() {
        const bodyEl = document.getElementById("attendanceBody");
        const month = attendanceMonthFilter ? attendanceMonthFilter.value : "";
        const rows = attendanceRows
            .filter(row => !month || row.date.startsWith(month))
            .sort((a, b) => b.date.localeCompare(a.date));

        bodyEl.replaceChildren();
        if (!rows.length) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 4; td.className = "table-empty";
            td.textContent = "No attendance has been recorded for this student yet.";
            tr.appendChild(td); bodyEl.appendChild(tr);
            return;
        }
        rows.forEach(row => {
            const tr = document.createElement("tr");
            appendCells(tr, [
                formatDate(row.date),
                new Date(`${row.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" })
            ]);
            appendStatus(tr, row.status);
            appendCells(tr, [`${row.class_name || ""} ${row.section || ""}`.trim()]);
            bodyEl.appendChild(tr);
        });
    }

    function renderAttendance() {
        const present = attendanceRows.filter(row => row.status.toLowerCase() === "present").length;
        const absent = attendanceRows.filter(row => row.status.toLowerCase() === "absent").length;

        document.getElementById("attendanceSummary").replaceChildren(
            createSummaryCard("Days Marked", present + absent),
            createSummaryCard("Days Present", present),
            createSummaryCard("Days Absent", absent),
            createSummaryCard("Attendance Rate", ratePercent(present, absent))
        );

        // month-wise summary (only months that have records)
        const byMonth = new Map();
        attendanceRows.forEach(row => {
            const key = row.date.slice(0, 7);
            const entry = byMonth.get(key) || { present: 0, absent: 0 };
            if (row.status.toLowerCase() === "present") entry.present += 1;
            else if (row.status.toLowerCase() === "absent") entry.absent += 1;
            byMonth.set(key, entry);
        });
        const months = [...byMonth.keys()].sort();

        const monthlyBody = document.getElementById("attendanceMonthlyBody");
        monthlyBody.replaceChildren();
        if (!months.length) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 5; td.className = "table-empty";
            td.textContent = "No attendance has been recorded for this academic year.";
            tr.appendChild(td); monthlyBody.appendChild(tr);
        }
        months.forEach(key => {
            const { present: p, absent: a } = byMonth.get(key);
            const tr = document.createElement("tr");
            appendCells(tr, [monthLabel(key), p, a, p + a, ratePercent(p, a)]);
            monthlyBody.appendChild(tr);
        });

        // month filter for the daily records (keeps the current choice when possible)
        if (attendanceMonthFilter) {
            const previous = attendanceMonthFilter.value;
            attendanceMonthFilter.replaceChildren();
            [["", "All months"], ...months.slice().reverse().map(key => [key, monthLabel(key)])].forEach(([value, text]) => {
                const option = document.createElement("option");
                option.value = value; option.textContent = text;
                attendanceMonthFilter.appendChild(option);
            });
            attendanceMonthFilter.value = months.includes(previous) ? previous : "";
        }
        renderAttendanceDays();

        const note = document.getElementById("attendanceYearNote");
        if (note) note.textContent = `Attendance history for Academic Year ${attendanceYear}`;
        attendanceMessageEl.hidden = true;
        attendanceContentEl.hidden = false;
    }

    async function loadAttendance() {
        if (!validStudentId(currentStudentId)) return;
        if (attendanceLoading) { attendanceReloadQueued = true; return; }
        attendanceLoading = true;
        attendanceYear = currentAcademicYear();
        updateManageAttendanceLink();
        if (!attendanceLoaded) showAttendanceMessage("Loading attendance…");
        try {
            const data = await apiGet(`/attendance?student_id=${encodeURIComponent(currentStudentId)}`);
            const start = Number(attendanceYear.slice(0, 4));
            const from = `${start}-04-01`, to = `${start + 1}-03-31`;   // academic year runs April to March
            attendanceRows = asRows(data)
                .map(row => ({ date: String(row.date ?? "").slice(0, 10), status: String(row.status ?? ""),
                               class_name: row.class_name || row.class || "", section: row.section || "" }))
                .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date >= from && row.date <= to);
            renderAttendance();
            attendanceLoaded = true;
        } catch (error) {
            console.error("Error loading attendance:", error);
            // keep showing the last good data if a background update fails
            if (!attendanceLoaded) showAttendanceMessage("Could not load attendance. Please check your connection and try again.", true);
        } finally {
            attendanceLoading = false;
            if (attendanceReloadQueued) { attendanceReloadQueued = false; loadAttendance(); }
        }
    }

    attendanceMonthFilter?.addEventListener("change", renderAttendanceDays);

    // Keep the Attendance tab up to date (no Refresh button), same as the Fees tab.
    let attendanceRefreshTimer = null;
    function refreshAttendanceIfVisible() {
        const panel = document.getElementById("panel-attendance");
        if (!panel || panel.hidden) return;
        clearTimeout(attendanceRefreshTimer);
        attendanceRefreshTimer = setTimeout(loadAttendance, 150);
    }
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAttendanceIfVisible(); });
    window.addEventListener("focus", refreshAttendanceIfVisible);
    window.addEventListener("pageshow", event => { if (event.persisted) refreshAttendanceIfVisible(); });
    window.addEventListener("storage", event => { if (event.key === "school_attendance_updated") refreshAttendanceIfVisible(); });
    if ("BroadcastChannel" in window) new BroadcastChannel("school-attendance").addEventListener("message", refreshAttendanceIfVisible);

    /* ----------------------------------------
       FEES (read-only; status is changed in the Fees section)
       ---------------------------------------- */
    const FREQUENCY_LABELS = { monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", yearly: "Yearly", one_time: "One time" };
    const feesMessageEl = document.getElementById("feesMessage");
    const feesContentEl = document.getElementById("feesContent");
    const manageFeesLink = document.getElementById("manageFeesBtn");
    let feesLoaded = false, feesLoading = false, feesReloadQueued = false, feesYear = "";
    let studentInfo = null;

    function currentAcademicYear() {
        const saved = localStorage.getItem("school_academic_year");
        if (saved && /^\d{4}-\d{4}$/.test(saved)) return saved;
        const now = new Date();
        const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        return `${start}-${start + 1}`;
    }

    function formatDate(iso) {
        if (!iso) return "-";
        const date = new Date(`${iso}T00:00:00`);
        return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }

    // The "Manage Fees" button opens this student's payment page in the Fees section.
    function updateManageFeesLink() {
        if (!manageFeesLink) return;
        const classKey = String(studentInfo?.class ?? "").trim();
        if (!classKey || !validStudentId(currentStudentId)) {
            manageFeesLink.setAttribute("aria-disabled", "true");
            manageFeesLink.removeAttribute("href");
            manageFeesLink.title = classKey ? "" : "Assign a class to this student to manage fees";
            return;
        }
        const query = new URLSearchParams({ class: classKey, student_id: currentStudentId, from: "profile", academic_year: feesYear || currentAcademicYear() });
        if (returnUrl) query.set("return_url", returnUrl);
        manageFeesLink.href = `fee_class_students.html?${query.toString()}`;
        manageFeesLink.removeAttribute("aria-disabled");
        manageFeesLink.removeAttribute("title");
    }

    function showFeesMessage(text, isError = false) {
        feesMessageEl.textContent = text;
        feesMessageEl.classList.toggle("is-error", isError);
        feesMessageEl.hidden = false;
        feesContentEl.hidden = true;
    }

    function appendCells(row, values) {
        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value === null || value === undefined || value === "" ? "-" : String(value);
            row.appendChild(cell);
        });
    }

    function appendStatus(row, status) {
        const cell = document.createElement("td");
        const badge = document.createElement("span");
        const label = String(status ?? "-");
        badge.className = `record-status status-${label.toLowerCase()}`;
        badge.textContent = label;
        cell.appendChild(badge);
        row.appendChild(cell);
    }

    function fillRows(body, rows, columns, emptyText, build) {
        body.replaceChildren();
        if (!rows.length) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = columns; td.className = "table-empty"; td.textContent = emptyText;
            tr.appendChild(td); body.appendChild(tr);
            return;
        }
        rows.forEach(item => { const tr = document.createElement("tr"); build(tr, item); body.appendChild(tr); });
    }

    function renderFees(data) {
        const summary = data.summary || {};
        const summaryEl = document.getElementById("feesSummary");
        summaryEl.replaceChildren(
            createSummaryCard("Total Fee", formatCurrency(summary.total_fee)),
            createSummaryCard("Paid", formatCurrency(summary.paid_amount)),
            createSummaryCard("Pending", formatCurrency(summary.pending_amount))
        );

        fillRows(document.getElementById("feesMonthlyBody"), data.schedule || [], 7,
            "No monthly fee is set for this student's class.", (tr, item) => {
                appendCells(tr, [item.period, formatCurrency(item.amount), formatCurrency(item.paid_amount), formatDate(item.due_date)]);
                appendStatus(tr, item.status);
                appendCells(tr, [formatDate(item.payment_date), item.payment_mode]);
            });

        fillRows(document.getElementById("feesOtherBody"), data.other_fees || [], 8,
            "No other fees are set for this student's class.", (tr, item) => {
                const frequency = `${FREQUENCY_LABELS[item.frequency] || item.frequency}${item.installments > 1 ? ` · ${formatCurrency(item.unit_amount)} × ${item.installments}` : ""}`;
                appendCells(tr, [item.fee_type, frequency, formatCurrency(item.total_amount), formatCurrency(item.paid_amount), formatDate(item.due_date)]);
                appendStatus(tr, item.status);
                appendCells(tr, [formatDate(item.payment_date), item.payment_mode]);
            });

        fillRows(document.getElementById("feesReceiptsBody"), data.payments || [], 7,
            "No payments have been recorded yet.", (tr, item) => {
                appendCells(tr, [item.month, item.fee_type, formatCurrency(item.amount_paid), formatDate(item.payment_date), item.payment_mode]);
                appendStatus(tr, item.status);
                appendCells(tr, [item.remarks]);
            });

        const note = document.getElementById("feesYearNote");
        if (note) note.textContent = `Fee dues and payment history for Academic Year ${data.academic_year}`;
        feesMessageEl.hidden = true;
        feesContentEl.hidden = false;
    }

    async function loadFees() {
        if (!validStudentId(currentStudentId)) return;
        if (feesLoading) { feesReloadQueued = true; return; }
        feesLoading = true;
        feesYear = currentAcademicYear();
        updateManageFeesLink();
        if (!feesLoaded) showFeesMessage("Loading fee details…");
        try {
            const data = await apiGet(`/fees/student-payments?student_id=${encodeURIComponent(currentStudentId)}&academic_year=${encodeURIComponent(feesYear)}`);
            renderFees(data);
            feesLoaded = true;
        } catch (error) {
            console.error("Error loading fee details:", error);
            // keep showing the last good data if a background update fails
            if (!feesLoaded) showFeesMessage("Could not load fee details. Please check your connection and try again.", true);
        } finally {
            feesLoading = false;
            if (feesReloadQueued) { feesReloadQueued = false; loadFees(); }
        }
    }

    // Keep the Fees tab up to date without a Refresh button: reload whenever the page
    // comes back into view, or the Fees section reports a change.
    let feesRefreshTimer = null;
    function refreshFeesIfVisible() {
        const panel = document.getElementById("panel-fees");
        if (!panel || panel.hidden) return;
        clearTimeout(feesRefreshTimer);
        feesRefreshTimer = setTimeout(loadFees, 150);
    }
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshFeesIfVisible(); });
    window.addEventListener("focus", refreshFeesIfVisible);
    window.addEventListener("pageshow", event => { if (event.persisted) refreshFeesIfVisible(); });
    window.addEventListener("storage", event => { if (event.key === "school_fees_updated") refreshFeesIfVisible(); });
    if ("BroadcastChannel" in window) new BroadcastChannel("school-fees").addEventListener("message", refreshFeesIfVisible);

    /* ----------------------------------------
       MARKS
       ---------------------------------------- */
    function renderMarks(rows) {
        const summaryEl = document.getElementById("marksSummary");
        const headEl = document.getElementById("marksHead");
        const bodyEl = document.getElementById("marksBody");

        if (summaryEl) {
            summaryEl.replaceChildren();
            let totalObtained = 0;
            let totalMax = 0;

            rows.forEach(r => {
                const obtained = Number(r.marks_obtained ?? r.marks);
                const max = Number(r.max_marks);
                if (Number.isFinite(obtained) && Number.isFinite(max) && max > 0) {
                    totalObtained += obtained;
                    totalMax += max;
                }
            });

            const percentage = totalMax > 0 ? `${((totalObtained / totalMax) * 100).toFixed(1)}%` : "-";

            summaryEl.append(
                createSummaryCard("Exams Taken", rows.length),
                createSummaryCard("Total Marks", totalMax > 0 ? `${totalObtained} / ${totalMax}` : "-"),
                createSummaryCard("Overall Percentage", percentage)
            );
        }

        if (headEl) {
            headEl.replaceChildren();
            const tr = document.createElement("tr");
            ["Exam", "Subject", "Marks Obtained", "Maximum Marks", "Grade", "Exam Date"].forEach(text => {
                const th = document.createElement("th");
                th.textContent = text;
                tr.appendChild(th);
            });
            headEl.appendChild(tr);
        }

        if (bodyEl) {
            bodyEl.replaceChildren();
            if (!rows.length) {
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 6;
                td.className = "table-empty";
                td.textContent = "No examination results found for this student.";
                tr.appendChild(td);
                bodyEl.appendChild(tr);
                return;
            }

            rows.forEach(r => {
                const tr = document.createElement("tr");

                // Exam Name
                const tdExam = document.createElement("td");
                tdExam.textContent = r.exam_name ?? r.exam ?? "-";
                tr.appendChild(tdExam);

                // Subject
                const tdSubject = document.createElement("td");
                tdSubject.textContent = r.subject ?? r.subject_name ?? "-";
                tr.appendChild(tdSubject);

                // Marks Obtained
                const tdMarks = document.createElement("td");
                tdMarks.textContent = r.marks_obtained !== null && r.marks_obtained !== undefined ? String(r.marks_obtained) : "-";
                tr.appendChild(tdMarks);

                // Maximum Marks
                const tdMax = document.createElement("td");
                tdMax.textContent = r.max_marks !== null && r.max_marks !== undefined ? String(r.max_marks) : "-";
                tr.appendChild(tdMax);

                // Grade
                const tdGrade = document.createElement("td");
                tdGrade.textContent = r.grade ?? "-";
                tr.appendChild(tdGrade);

                // Exam Date
                const tdDate = document.createElement("td");
                tdDate.textContent = r.exam_date ?? "-";
                tr.appendChild(tdDate);

                bodyEl.appendChild(tr);
            });
        }
    }

    // Generic Record Loader dispatcher
    async function loadRecords(type, force = false) {
        if (!validStudentId(currentStudentId)) return;

        if (!force && cache[type] !== null) {
            if (type === "marks") renderMarks(cache.marks);
            return;
        }

        const bodyEl = document.getElementById(`${type}Body`);
        if (bodyEl) {
            bodyEl.replaceChildren();
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 6;
            td.className = "table-empty";
            td.textContent = `Loading ${type} records...`;
            tr.appendChild(td);
            bodyEl.appendChild(tr);
        }

        const endpoints = {
            marks: `/students/${encodeURIComponent(currentStudentId)}/marks`
        };

        try {
            const data = await apiGet(endpoints[type]);
            const rows = asRows(data);
            cache[type] = rows;

            if (type === "marks") renderMarks(rows);
        } catch (error) {
            console.error(`Error loading ${type} records:`, error);
            if (bodyEl) {
                bodyEl.replaceChildren();
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 6;
                td.className = "table-empty";
                td.textContent = `Could not load ${type} records. Please check your connection and try again.`;
                tr.appendChild(td);
                bodyEl.appendChild(tr);
            }
        }
    }

    // Initial load
    loadStudentOverview().then(student => {
        studentInfo = student;
        updateManageFeesLink();
        updateManageAttendanceLink();
    });

    // e.g. student_details.html?student_id=10082&tab=fees (used when returning from the Fees section)
    const initialTab = params.get("tab");
    if (["attendance", "fees", "marks"].includes(initialTab)) activateTab(initialTab);
});