
/* ========================================
   SECTION DETAILS PAGE
======================================== */

document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);

    const classValue = params.get("class") || "";
    const section = params.get("section") || "";
    const classDisplay = params.get("class_display") ||
        (classValue ? `Class ${classValue}` : "");

    const allowedClasses = new Set([
        "KIDSCARE", "NUR", "LKG", "UKG",
        "1", "2", "3", "4", "5", "6",
        "7", "8", "9", "10", "11", "12"
    ]);

    // Validate URL parameters before using them.
    if (
        !allowedClasses.has(classValue.trim().toUpperCase()) ||
        !/^[A-Za-z0-9_-]{1,10}$/.test(section)
    ) {
        document.title = "Invalid Section | Section Details";

        const body = document.getElementById("sectionStudentsBody");
        showTableMessage(
            body,
            5,
            "Invalid class or section. Please return to the Classes page."
        );

        console.warn("Rejected invalid class or section URL parameters.");
        return;
    }

    const sectionTitle = `${classDisplay} - Section ${section}`;

    document.title = `${sectionTitle} | Section Details`;

    const titleEl = document.getElementById("sectionTitle");
    if (titleEl) titleEl.textContent = sectionTitle;

    const subtitleEl = document.getElementById("sectionSubtitle");
    if (subtitleEl) {
        subtitleEl.textContent =
            `Students and attendance records for ${sectionTitle}`;
    }

    const rosterSubtitleEl = document.getElementById("rosterSubtitle");
    if (rosterSubtitleEl) {
        rosterSubtitleEl.textContent = `Students enrolled in ${sectionTitle}`;
    }

    // Build navigation URLs from validated values.
    const classDetailsUrl =
        `class_details.html?class=${encodeURIComponent(classDisplay || classValue)}`;

    const breadcrumbClassEl = document.getElementById("breadcrumbClass");
    if (breadcrumbClassEl) {
        breadcrumbClassEl.textContent = classDisplay || classValue;
        breadcrumbClassEl.href = classDetailsUrl;
    }

    const breadcrumbSectionEl = document.getElementById("breadcrumbSection");
    if (breadcrumbSectionEl) {
        breadcrumbSectionEl.textContent = `Section ${section}`;
    }

    const backBtn = document.getElementById("backToClassBtn");
    if (backBtn) {
        backBtn.href = classDetailsUrl;

        const span = backBtn.querySelector("span");
        if (span) span.textContent = `Back to ${classDisplay || classValue}`;
    }

    const tableBody = document.getElementById("sectionStudentsBody");
    const countBadge = document.getElementById("studentCountBadge");
    const saveBtn = document.getElementById("saveAttendanceBtn");

    if (!tableBody) {
        console.error("Section student table was not found.");
        return;
    }

    const apiBase = window.API_BASE_URL;
    if (typeof apiBase !== "string" || !apiBase.trim()) {
        showTableMessage(tableBody, 5, "Backend configuration is missing.");
        return;
    }

    let studentsRoster = [];
    let isSaving = false;

    // Use the local calendar date.
    function getLocalDate() {
        const now = new Date();

        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");
    }

    function isPositiveId(value) {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0;
    }

    function showTableMessage(tbody, colspan, message) {
        if (!tbody) return;

        const row = document.createElement("tr");
        row.className = "empty-row";

        const cell = document.createElement("td");
        cell.colSpan = colspan;
        cell.className = "table-empty";
        cell.textContent = message;

        row.appendChild(cell);
        tbody.replaceChildren(row);
    }

    function createCell(row, value, className = "") {
        const cell = row.insertCell();
        cell.textContent = String(value ?? "");

        if (className) cell.className = className;

        return cell;
    }

    // Info navigation
    function viewStudent(studentId) {
        if (!isPositiveId(studentId)) {
            alert("Invalid student ID.");
            return;
        }

        const currentPage =
            window.location.pathname.split("/").pop() +
            window.location.search;

        const returnUrl = encodeURIComponent(currentPage);

        window.location.href =
            `student_details.html?student_id=${Number(studentId)}` +
            `&return_url=${returnUrl}`;
    }

    // Attendance toggle
    function toggleAttendance(studentId, status) {
        if (status !== "Present" && status !== "Absent") return;

        const student = studentsRoster.find(
            item => Number(item.student_id) === Number(studentId)
        );

        if (!student) return;

        student.attendanceStatus = status;
        renderRoster();

        if (saveBtn) {
            saveBtn.style.display = "inline-flex";
            saveBtn.textContent = "Save Attendance";
        }
    }

    // Render the roster without parsing API data as HTML.
    function renderRoster() {
        tableBody.replaceChildren();

        if (countBadge) {
            countBadge.textContent =
                `${studentsRoster.length} Student${studentsRoster.length === 1 ? "" : "s"}`;
        }

        if (studentsRoster.length === 0) {
            showTableMessage(
                tableBody,
                5,
                "No students enrolled in this section."
            );

            if (saveBtn) saveBtn.style.display = "none";
            return;
        }

        studentsRoster.forEach((student, index) => {
            const row = tableBody.insertRow();

            createCell(row, `#${student.student_id}`, "student-id-cell");
            createCell(row, student.full_name, "student-name-cell");

            const rollCell = row.insertCell();
            const rollBadge = document.createElement("span");
            rollBadge.className = "roll-no-badge";
            rollBadge.textContent = String(student.roll_no ?? index + 1);
            rollCell.appendChild(rollBadge);

            const actionsCell = row.insertCell();
            actionsCell.className = "student-actions";

            const infoButton = document.createElement("button");
            infoButton.type = "button";
            infoButton.className = "info-btn";
            infoButton.textContent = "Info";
            infoButton.addEventListener("click", () => {
                viewStudent(student.student_id);
            });
            actionsCell.appendChild(infoButton);

            const attendanceCell = row.insertCell();
            const wrapper = document.createElement("div");
            wrapper.className = "attendance-status-wrap";

            const presentButton = document.createElement("button");
            presentButton.type = "button";
            presentButton.className = "status-btn";
            presentButton.textContent = "Present";
            presentButton.title = "Mark Present";

            if (student.attendanceStatus === "Present") {
                presentButton.classList.add("selected-present");
            }

            presentButton.addEventListener("click", () => {
                toggleAttendance(student.student_id, "Present");
            });

            const absentButton = document.createElement("button");
            absentButton.type = "button";
            absentButton.className = "status-btn";
            absentButton.textContent = "Absent";
            absentButton.title = "Mark Absent";

            if (student.attendanceStatus === "Absent") {
                absentButton.classList.add("selected-absent");
            }

            absentButton.addEventListener("click", () => {
                toggleAttendance(student.student_id, "Absent");
            });

            wrapper.append(presentButton, absentButton);
            attendanceCell.appendChild(wrapper);
        });

        if (saveBtn) {
            saveBtn.style.display = "inline-flex";
        }
    }

    // Save attendance
    if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
            if (isSaving || studentsRoster.length === 0) return;

            if (!studentsRoster.every(
                student => isPositiveId(student.student_id)
            )) {
                alert("One or more student IDs are invalid. Attendance was not saved.");
                return;
            }

            const today = getLocalDate();

            const payload = studentsRoster.map(student => ({
                student_id: Number(student.student_id),
                student_name: student.full_name,
                class_name: classValue,
                section,
                date: today,
                status: student.attendanceStatus || "Present"
            }));

            isSaving = true;
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving...";

            try {
                const response = await authenticatedFetch(
                    `${apiBase}/attendance`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    }
                );

                if (!response.ok) {
                    let message = "Failed to save attendance.";

                    try {
                        const result = await response.json();

                        if (typeof result.detail === "string") {
                            message = result.detail;
                        }
                    } catch {
                        // Keep the generic message.
                    }

                    throw new Error(message);
                }

                saveBtn.textContent = "Saved ✓";

                // Restore the button after a brief success message.
                setTimeout(() => {
                    if (!saveBtn.isConnected) return;

                    saveBtn.textContent = "Save Attendance";
                    saveBtn.disabled = false;
                    isSaving = false;
                }, 2000);
            } catch (error) {
                console.error("Save attendance error:", error);
                alert("Could not save attendance: " + error.message);

                saveBtn.textContent = "Save Attendance";
                saveBtn.disabled = false;
                isSaving = false;
            }
        });
    }

    // Load students and attendance for this section.
    async function loadSectionData() {
        showTableMessage(tableBody, 5, "Loading students...");

        try {
            const response = await authenticatedFetch(`${apiBase}/students`);

            if (!response.ok) {
                throw new Error("Failed to load students.");
            }

            const result = await response.json();

            const allStudents = Array.isArray(result)
                ? result
                : result?.students;

            if (!Array.isArray(allStudents)) {
                throw new Error("Invalid student API response.");
            }

            const targetClass = classValue.trim().toLowerCase();
            const targetSection = section.trim().toLowerCase();

            const sectionStudents = allStudents.filter(student => {
                const studentClass = String(
                    student.class ?? student.class_name ?? ""
                ).trim().toLowerCase();

                const studentSection = String(
                    student.section ?? ""
                ).trim().toLowerCase();

                return studentClass === targetClass &&
                    studentSection === targetSection;
            });

            const today = getLocalDate();
            const attendanceMap = new Map();

            try {
                const attendanceResponse = await authenticatedFetch(
                    `${apiBase}/attendance?date_val=${encodeURIComponent(today)}` +
                    `&class_name=${encodeURIComponent(classValue)}` +
                    `&section=${encodeURIComponent(section)}`
                );

                if (attendanceResponse.ok) {
                    const records = await attendanceResponse.json();

                    if (Array.isArray(records)) {
                        records.forEach(record => {
                            if (record.student_id != null) {
                                attendanceMap.set(
                                    String(record.student_id),
                                    record.status
                                );
                            }
                        });
                    }
                }
            } catch (error) {
                console.warn("Could not fetch attendance records:", error);
            }

            studentsRoster = sectionStudents
                .filter(student => isPositiveId(student.student_id ?? student.id))
                .map((student, index) => {
                    const studentId = Number(student.student_id ?? student.id);
                    const status = attendanceMap.get(String(studentId));

                    return {
                        student_id: studentId,
                        full_name: String(student.full_name ?? student.name ?? "—"),
                        roll_no: student.roll_no ?? student.roll_number ?? index + 1,
                        attendanceStatus:
                            status === "Present" || status === "Absent"
                                ? status
                                : "Present"
                    };
                });

            renderRoster();
        } catch (error) {
            console.error("Error loading section students:", error);

            showTableMessage(
                tableBody,
                5,
                "Unable to load students. Please ensure the backend is running."
            );
        }
    }

    loadSectionData();
});
