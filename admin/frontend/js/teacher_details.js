/* ==========================================================================
   TEACHER DETAILS VIEW
   Displays teacher profile: Overview, Academic Details, Attendance, and Salary.
   Provides print, edit, and delete actions.
   Requires api.js, sidebar.js, and script.js.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const params = new URLSearchParams(window.location.search);
    const currentTeacherId = params.get("teacher_id");
    const rawReturnUrl = params.get("return_url");

    function getApiBase() {
        return (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    }

    function validTeacherId(id) {
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
                path.endsWith("/teacher.html") ||
                path.endsWith("/attendance.html") ||
                path.endsWith("/timetable.html") ||
                path.endsWith("/dashboard.html");

            if (!allowed) return null;
            return parsed.pathname + parsed.search + parsed.hash;
        } catch (_) {
            return null;
        }
    }

    const returnUrl = safeReturnUrl(rawReturnUrl);

    function goBackToTeachers() {
        window.location.href = returnUrl || "teacher.html";
    }

    // Back button
    const backToTeachers = document.getElementById("backToTeachers");
    if (backToTeachers) {
        if (returnUrl && returnUrl.toLowerCase().includes("attendance")) {
            backToTeachers.textContent = "← Back to Attendance";
        } else if (returnUrl && returnUrl.toLowerCase().includes("timetable")) {
            backToTeachers.textContent = "← Back to Timetable";
        }
        backToTeachers.addEventListener("click", goBackToTeachers);
    }

    // Print button
    const printTeacherBtn = document.getElementById("printTeacherBtn");
    if (printTeacherBtn) {
        printTeacherBtn.addEventListener("click", () => window.print());
    }

    // Edit button
    const editTeacherBtn = document.getElementById("editTeacherBtn");
    if (editTeacherBtn) {
        editTeacherBtn.addEventListener("click", () => {
            if (!validTeacherId(currentTeacherId)) {
                alert("A valid teacher ID was not provided.");
                return;
            }
            const query = new URLSearchParams({ teacher_id: currentTeacherId });
            if (returnUrl) query.set("return_url", returnUrl);
            window.location.href = `edit_teacher.html?${query.toString()}`;
        });
    }

    // Delete button
    const deleteTeacherBtn = document.getElementById("deleteTeacherBtn");
    if (deleteTeacherBtn) {
        deleteTeacherBtn.addEventListener("click", () => {
            if (!validTeacherId(currentTeacherId)) {
                alert("A valid teacher ID was not provided.");
                return;
            }
            deleteTeacher(currentTeacherId);
        });
    }

    function deleteTeacher(teacherId) {
        if (typeof window.showDeleteConfirmationModal !== "function") {
            alert("Delete confirmation modal is unavailable.");
            return;
        }

        window.showDeleteConfirmationModal({
            title: "Delete Teacher?",
            initialMessage: "Please wait before confirmation.",
            confirmMessage: "Are you sure you want to permanently delete this teacher?",
            countdownSeconds: 5,

            onConfirm: async () => {
                try {
                    const response = await window.authenticatedFetch(
                        `${getApiBase()}/teachers/${encodeURIComponent(teacherId)}`,
                        { method: "DELETE" }
                    );

                    if (!response.ok) {
                        let message = `Failed to delete teacher (HTTP ${response.status}).`;
                        try {
                            const result = await response.json();
                            if (typeof result.detail === "string") message = result.detail;
                        } catch (_) {}
                        alert(message);
                        return;
                    }

                    alert("Teacher deleted successfully!");
                    goBackToTeachers();
                } catch (error) {
                    console.error("Error deleting teacher:", error);
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

    function formatCurrency(num) {
        const n = Number(num);
        if (!Number.isFinite(n)) return "₹0.00";
        return n.toLocaleString("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        });
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

    // Load Basic Teacher Overview
    async function loadTeacherOverview() {
        if (!validTeacherId(currentTeacherId)) {
            alert("A valid teacher ID was not provided.");
            goBackToTeachers();
            return;
        }

        try {
            const teacher = await apiGet(
                `/teachers/details?teacher_id=${encodeURIComponent(currentTeacherId)}`
            );

            if (!teacher || typeof teacher !== "object" || Array.isArray(teacher)) {
                throw new Error("Unexpected teacher details response format.");
            }

            const fullName = teacher.full_name || "Teacher";
            setText("profileName", fullName);
            setText(
                "teacherAvatar",
                fullName.trim().charAt(0).toUpperCase() || "T"
            );
            setText(
                "profileSubtitle",
                `${teacher.post || "Teacher"} | ID: ${teacher.teacher_id ?? "-"} | ${teacher.qualification || "Faculty"}`
            );
            document.title = `${fullName} - Teacher Profile`;

            const fields = {
                teacherId: teacher.teacher_id,
                dateOfBirth: teacher.date_of_birth,
                gender: teacher.gender,
                category: teacher.category,
                bloodGroup: teacher.blood_group,
                phone: teacher.phone,
                email: teacher.email,

                post: teacher.post,
                qualification: teacher.qualification,
                dateOfJoining: teacher.date_of_joining,
                joiningNo: teacher.joining_no,
                aadharNo: teacher.aadhar_no,
                cl: teacher.cl,

                houseNo: teacher.house_no,
                street: teacher.street,
                city: teacher.city,
                state: teacher.state,
                pincode: teacher.pincode
            };

            Object.entries(fields).forEach(([elementId, value]) => {
                setText(elementId, value);
            });
        } catch (error) {
            console.error("Error loading teacher overview:", error);
            alert("Unable to load teacher details. Check your session and backend connection.");
        }
    }

    /* ==========================================================================
       TAB SWITCHING & DATA LOADING
       Tabs: Overview -> Academic Details -> Attendance -> Salary
       ========================================================================== */

    const cache = {
        academic: null,
        attendance: null,
        salary: null
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

        if (tabName !== "overview") {
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

    function asRows(payload) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== "object") return [];
        for (const key of ["records", "data", "items", "attendance", "assigned_classes", "payslips"]) {
            if (Array.isArray(payload[key])) return payload[key];
        }
        return [];
    }

    /* --------------------------------------------------------------------------
       TAB 2: ACADEMIC DETAILS
       -------------------------------------------------------------------------- */
    function renderAcademic(data) {
        const summaryEl = document.getElementById("academicSummary");
        const classesBodyEl = document.getElementById("assignedClassesBody");
        const timetableBodyEl = document.getElementById("academicTimetableBody");

        const assignedClasses = Array.isArray(data?.assigned_classes) ? data.assigned_classes : [];
        const timetable = Array.isArray(data?.timetable) ? data.timetable : [];
        const subjects = Array.isArray(data?.subjects) ? data.subjects : [];

        // Summary cards
        if (summaryEl) {
            summaryEl.replaceChildren();
            summaryEl.append(
                createSummaryCard("Assigned Classes", assignedClasses.length ? `${assignedClasses.length} Classes` : "None Assigned"),
                createSummaryCard("Subjects Taught", subjects.length ? subjects.join(", ") : "General"),
                createSummaryCard("Weekly Lecture Load", `${data?.total_periods ?? timetable.length} Periods / Wk`),
                createSummaryCard("Academic Post", data?.post || "Faculty Member")
            );
        }

        // Assigned Classes table
        if (classesBodyEl) {
            classesBodyEl.replaceChildren();
            if (!assignedClasses.length) {
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 5;
                td.className = "table-empty";
                td.textContent = "No specific class assignments recorded for this teacher.";
                tr.appendChild(td);
                classesBodyEl.appendChild(tr);
            } else {
                assignedClasses.forEach(item => {
                    const tr = document.createElement("tr");

                    const tdClass = document.createElement("td");
                    tdClass.textContent = `Class ${item.class_name}`;
                    tr.appendChild(tdClass);

                    const tdSection = document.createElement("td");
                    tdSection.textContent = `Section ${item.section}`;
                    tr.appendChild(tdSection);

                    const tdSubject = document.createElement("td");
                    const subBadge = document.createElement("span");
                    subBadge.className = "badge-subject";
                    subBadge.textContent = item.subject || "-";
                    tdSubject.appendChild(subBadge);
                    tr.appendChild(tdSubject);

                    const tdPeriods = document.createElement("td");
                    tdPeriods.textContent = `${item.periods_per_week || 0} periods / wk`;
                    tr.appendChild(tdPeriods);

                    const tdRole = document.createElement("td");
                    const roleBadge = document.createElement("span");
                    roleBadge.className = "badge-role";
                    roleBadge.textContent = item.role || "Subject Teacher";
                    tdRole.appendChild(roleBadge);
                    tr.appendChild(tdRole);

                    classesBodyEl.appendChild(tr);
                });
            }
        }

        // Timetable schedule table
        if (timetableBodyEl) {
            timetableBodyEl.replaceChildren();
            if (!timetable.length) {
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 5;
                td.className = "table-empty";
                td.textContent = "No weekly timetable slots recorded for this teacher.";
                tr.appendChild(td);
                timetableBodyEl.appendChild(tr);
            } else {
                timetable.forEach(slot => {
                    const tr = document.createElement("tr");

                    const tdDay = document.createElement("td");
                    tdDay.textContent = slot.day_of_week || "-";
                    tr.appendChild(tdDay);

                    const tdPeriod = document.createElement("td");
                    tdPeriod.textContent = `Period ${slot.period_number ?? "-"}`;
                    tr.appendChild(tdPeriod);

                    const tdClass = document.createElement("td");
                    tdClass.textContent = `Class ${slot.class_name ?? "-"} - ${slot.section ?? "-"}`;
                    tr.appendChild(tdClass);

                    const tdSubject = document.createElement("td");
                    const badge = document.createElement("span");
                    badge.className = "badge-subject";
                    badge.textContent = slot.subject || "-";
                    tdSubject.appendChild(badge);
                    tr.appendChild(tdSubject);

                    const tdTime = document.createElement("td");
                    tdTime.textContent = (slot.start_time && slot.end_time)
                        ? `${slot.start_time} - ${slot.end_time}`
                        : "-";
                    tr.appendChild(tdTime);

                    timetableBodyEl.appendChild(tr);
                });
            }
        }
    }

    /* --------------------------------------------------------------------------
       TAB 3: ATTENDANCE
       -------------------------------------------------------------------------- */
    function renderAttendance(rows) {
        const summaryEl = document.getElementById("attendanceSummary");
        const headEl = document.getElementById("attendanceHead");
        const bodyEl = document.getElementById("attendanceBody");

        if (summaryEl) {
            summaryEl.replaceChildren();
            const total = rows.length;
            const present = rows.filter(r => String(r.status ?? "").toLowerCase() === "present").length;
            const absent = rows.filter(r => String(r.status ?? "").toLowerCase() === "absent").length;
            const rate = total > 0 ? `${((present / total) * 100).toFixed(1)}%` : "-";

            summaryEl.append(
                createSummaryCard("Total Recorded Days", total),
                createSummaryCard("Days Present", present),
                createSummaryCard("Days Absent", absent),
                createSummaryCard("Attendance Rate", rate)
            );
        }

        if (headEl) {
            headEl.replaceChildren();
            const tr = document.createElement("tr");
            ["Date", "Status", "Time In", "Time Out"].forEach(text => {
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
                td.colSpan = 4;
                td.className = "table-empty";
                td.textContent = "No attendance records found for this teacher.";
                tr.appendChild(td);
                bodyEl.appendChild(tr);
                return;
            }

            rows.forEach(r => {
                const tr = document.createElement("tr");

                const tdDate = document.createElement("td");
                tdDate.textContent = r.date ?? "-";
                tr.appendChild(tdDate);

                const tdStatus = document.createElement("td");
                const statusStr = String(r.status ?? "-");
                const badge = document.createElement("span");
                badge.className = `record-status status-${statusStr.toLowerCase()}`;
                badge.textContent = statusStr;
                tdStatus.appendChild(badge);
                tr.appendChild(tdStatus);

                const tdIn = document.createElement("td");
                tdIn.textContent = r.time_in ?? "-";
                tr.appendChild(tdIn);

                const tdOut = document.createElement("td");
                tdOut.textContent = r.time_out ?? "-";
                tr.appendChild(tdOut);

                bodyEl.appendChild(tr);
            });
        }
    }

    /* --------------------------------------------------------------------------
       TAB 4: SALARY
       -------------------------------------------------------------------------- */
    function renderSalary(data) {
        const summaryEl = document.getElementById("salarySummary");
        const historyBodyEl = document.getElementById("salaryHistoryBody");

        const struct = data?.structure || {};
        const bank = data?.bank_details || {};
        const payslips = Array.isArray(data?.payslips) ? data.payslips : [];

        // Summary Cards
        if (summaryEl) {
            summaryEl.replaceChildren();
            summaryEl.append(
                createSummaryCard("Monthly Basic Pay", formatCurrency(struct.basic_pay)),
                createSummaryCard("Gross Monthly Salary", formatCurrency(struct.gross_salary)),
                createSummaryCard("Total Deductions", formatCurrency(struct.total_deductions)),
                createSummaryCard("Net Take Home", formatCurrency(struct.net_salary))
            );
        }

        // Structure breakdown fields
        setText("salaryBasicPay", formatCurrency(struct.basic_pay));
        setText("salaryHra", formatCurrency(struct.hra));
        setText("salaryDa", formatCurrency(struct.da));
        setText("salarySpecial", formatCurrency(struct.special_allowance));
        setText("salaryGross", formatCurrency(struct.gross_salary));

        setText("salaryPf", formatCurrency(struct.pf));
        setText("salaryTax", formatCurrency(struct.tax_tds));
        setText("salaryPt", formatCurrency(struct.professional_tax));
        setText("salaryCl", struct.cl_balance !== undefined ? `${struct.cl_balance} Days` : "12 Days");
        setText("salaryDeductions", formatCurrency(struct.total_deductions));
        setText("salaryNet", formatCurrency(struct.net_salary));

        // Bank details fields
        setText("salaryBankName", bank.bank_name || "State Bank of India");
        setText("salaryAccountNo", bank.account_number || "-");
        setText("salaryIfsc", bank.ifsc_code || "-");
        setText("salaryPan", bank.pan_number || "-");
        setText("salaryPaymentMode", bank.payment_mode || "Direct Bank Transfer (NEFT)");

        // Payslips history table
        if (historyBodyEl) {
            historyBodyEl.replaceChildren();
            if (!payslips.length) {
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 8;
                td.className = "table-empty";
                td.textContent = "No salary disbursement history found for this teacher.";
                tr.appendChild(td);
                historyBodyEl.appendChild(tr);
                return;
            }

            payslips.forEach(p => {
                const tr = document.createElement("tr");

                const tdMonth = document.createElement("td");
                tdMonth.style.fontWeight = "600";
                tdMonth.textContent = p.month || "-";
                tr.appendChild(tdMonth);

                const tdDate = document.createElement("td");
                tdDate.textContent = p.payment_date || "-";
                tr.appendChild(tdDate);

                const tdGross = document.createElement("td");
                tdGross.textContent = formatCurrency(p.gross_salary);
                tr.appendChild(tdGross);

                const tdDed = document.createElement("td");
                tdDed.style.color = "#b91c1c";
                tdDed.textContent = formatCurrency(p.deductions);
                tr.appendChild(tdDed);

                const tdNet = document.createElement("td");
                tdNet.style.fontWeight = "600";
                tdNet.style.color = "#15803d";
                tdNet.textContent = formatCurrency(p.net_pay);
                tr.appendChild(tdNet);

                const tdMode = document.createElement("td");
                tdMode.textContent = p.payment_mode || "Bank Transfer";
                tr.appendChild(tdMode);

                const tdRef = document.createElement("td");
                tdRef.style.fontFamily = "monospace";
                tdRef.textContent = p.reference_no || "-";
                tr.appendChild(tdRef);

                const tdStatus = document.createElement("td");
                const statusStr = String(p.status || "Paid");
                const badge = document.createElement("span");
                badge.className = `record-status status-${statusStr.toLowerCase()}`;
                badge.textContent = statusStr;
                tdStatus.appendChild(badge);
                tr.appendChild(tdStatus);

                historyBodyEl.appendChild(tr);
            });
        }
    }

    // Generic Record Loader dispatcher
    async function loadRecords(type, force = false) {
        if (!validTeacherId(currentTeacherId)) return;

        if (!force && cache[type] !== null) {
            if (type === "academic") renderAcademic(cache.academic);
            else if (type === "attendance") renderAttendance(cache.attendance);
            else if (type === "salary") renderSalary(cache.salary);
            return;
        }

        // Show loading in target containers
        if (type === "academic") {
            const el = document.getElementById("assignedClassesBody");
            if (el) {
                el.replaceChildren();
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 5;
                td.className = "table-empty";
                td.textContent = "Loading academic and class details...";
                tr.appendChild(td);
                el.appendChild(tr);
            }
        } else if (type === "attendance") {
            const el = document.getElementById("attendanceBody");
            if (el) {
                el.replaceChildren();
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 4;
                td.className = "table-empty";
                td.textContent = "Loading attendance records...";
                tr.appendChild(td);
                el.appendChild(tr);
            }
        } else if (type === "salary") {
            const el = document.getElementById("salaryHistoryBody");
            if (el) {
                el.replaceChildren();
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 8;
                td.className = "table-empty";
                td.textContent = "Loading salary and compensation details...";
                tr.appendChild(td);
                el.appendChild(tr);
            }
        }

        const endpoints = {
            academic: `/teachers/${encodeURIComponent(currentTeacherId)}/academic`,
            attendance: `/teacher-attendance?teacher_id=${encodeURIComponent(currentTeacherId)}`,
            salary: `/teachers/${encodeURIComponent(currentTeacherId)}/salary`
        };

        try {
            const data = await apiGet(endpoints[type]);
            if (type === "attendance") {
                const rows = asRows(data);
                cache.attendance = rows;
                renderAttendance(rows);
            } else {
                cache[type] = data;
                if (type === "academic") renderAcademic(data);
                else if (type === "salary") renderSalary(data);
            }
        } catch (error) {
            console.error(`Error loading ${type} records:`, error);
            const targetBodies = {
                academic: "assignedClassesBody",
                attendance: "attendanceBody",
                salary: "salaryHistoryBody"
            };
            const colspans = { academic: 5, attendance: 4, salary: 8 };
            const bodyEl = document.getElementById(targetBodies[type]);
            if (bodyEl) {
                bodyEl.replaceChildren();
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = colspans[type];
                td.className = "table-empty";
                td.textContent = `Could not load ${type} records. Please check your connection and try again.`;
                tr.appendChild(td);
                bodyEl.appendChild(tr);
            }
        }
    }

    // Initial load
    loadTeacherOverview();
});
