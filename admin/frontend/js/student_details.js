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
            return;
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
        } catch (error) {
            console.error("Error loading student overview:", error);
            alert("Unable to load student details. Check your session and backend connection.");
        }
    }

    /* ==========================================================================
       TAB SWITCHING & DATA LOADING (ATTENDANCE, FEES, MARKS)
       ========================================================================== */

    const cache = {
        attendance: null,
        fees: null,
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
       ATTENDANCE
       ---------------------------------------- */
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
                createSummaryCard("Attendance Rate", rate)
            );
        }

        if (headEl) {
            headEl.replaceChildren();
            const tr = document.createElement("tr");
            ["Date", "Status", "Class / Section", "Remarks"].forEach(text => {
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
                td.textContent = "No attendance records found for this student.";
                tr.appendChild(td);
                bodyEl.appendChild(tr);
                return;
            }

            rows.forEach(r => {
                const tr = document.createElement("tr");

                // Date
                const tdDate = document.createElement("td");
                tdDate.textContent = r.date ?? "-";
                tr.appendChild(tdDate);

                // Status
                const tdStatus = document.createElement("td");
                const statusStr = String(r.status ?? "-");
                const badge = document.createElement("span");
                badge.className = `record-status status-${statusStr.toLowerCase()}`;
                badge.textContent = statusStr;
                tdStatus.appendChild(badge);
                tr.appendChild(tdStatus);

                // Class / Section
                const tdClass = document.createElement("td");
                const cls = r.class_name || r.class || "";
                const sec = r.section || "";
                tdClass.textContent = cls || sec ? `${cls} ${sec}`.trim() : "-";
                tr.appendChild(tdClass);

                // Remarks
                const tdRemarks = document.createElement("td");
                tdRemarks.textContent = r.remarks || "-";
                tr.appendChild(tdRemarks);

                bodyEl.appendChild(tr);
            });
        }
    }

    /* ----------------------------------------
       FEES
       ---------------------------------------- */
    function renderFees(rows) {
        const summaryEl = document.getElementById("feesSummary");
        const headEl = document.getElementById("feesHead");
        const bodyEl = document.getElementById("feesBody");

        if (summaryEl) {
            summaryEl.replaceChildren();
            const totalPaid = rows.reduce((sum, r) => {
                const amount = Number(r.amount_paid ?? r.amount);
                return sum + (Number.isFinite(amount) ? amount : 0);
            }, 0);

            const countPaid = rows.filter(r => String(r.status ?? "").toLowerCase() === "paid").length;
            const countPending = rows.filter(r => ["pending", "partial"].includes(String(r.status ?? "").toLowerCase())).length;

            summaryEl.append(
                createSummaryCard("Total Fee Paid", formatCurrency(totalPaid)),
                createSummaryCard("Paid Transactions", countPaid),
                createSummaryCard("Pending / Partial", countPending)
            );
        }

        if (headEl) {
            headEl.replaceChildren();
            const tr = document.createElement("tr");
            ["Fee Type", "Amount Paid", "Payment Date", "Payment Mode", "Status", "Remarks"].forEach(text => {
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
                td.textContent = "No fee payment records found for this student.";
                tr.appendChild(td);
                bodyEl.appendChild(tr);
                return;
            }

            rows.forEach(r => {
                const tr = document.createElement("tr");

                // Fee Type
                const tdType = document.createElement("td");
                tdType.textContent = r.fee_type || r.fee_name || "General Fee";
                tr.appendChild(tdType);

                // Amount
                const tdAmount = document.createElement("td");
                tdAmount.textContent = formatCurrency(r.amount_paid ?? r.amount);
                tr.appendChild(tdAmount);

                // Payment Date
                const tdDate = document.createElement("td");
                tdDate.textContent = r.payment_date ?? r.date ?? "-";
                tr.appendChild(tdDate);

                // Mode
                const tdMode = document.createElement("td");
                tdMode.textContent = r.payment_mode ?? r.mode ?? "Cash";
                tr.appendChild(tdMode);

                // Status
                const tdStatus = document.createElement("td");
                const statusStr = String(r.status ?? "Paid");
                const badge = document.createElement("span");
                badge.className = `record-status status-${statusStr.toLowerCase()}`;
                badge.textContent = statusStr;
                tdStatus.appendChild(badge);
                tr.appendChild(tdStatus);

                // Remarks
                const tdRemarks = document.createElement("td");
                tdRemarks.textContent = r.remarks || "-";
                tr.appendChild(tdRemarks);

                bodyEl.appendChild(tr);
            });
        }
    }

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
            if (type === "attendance") renderAttendance(cache.attendance);
            else if (type === "fees") renderFees(cache.fees);
            else if (type === "marks") renderMarks(cache.marks);
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
            attendance: `/attendance?student_id=${encodeURIComponent(currentStudentId)}`,
            fees: `/fees/payments?student_id=${encodeURIComponent(currentStudentId)}`,
            marks: `/students/${encodeURIComponent(currentStudentId)}/marks`
        };

        try {
            const data = await apiGet(endpoints[type]);
            const rows = asRows(data);
            cache[type] = rows;

            if (type === "attendance") renderAttendance(rows);
            else if (type === "fees") renderFees(rows);
            else if (type === "marks") renderMarks(rows);
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
    loadStudentOverview();
});
