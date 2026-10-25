
document.addEventListener("DOMContentLoaded", () => {
    // Validate the class requested through the URL.
    const allowedClasses = [
        "Kids Care", "Nursery", "LKG", "UKG",
        "Class 1", "Class 2", "Class 3", "Class 4",
        "Class 5", "Class 6", "Class 7", "Class 8",
        "Class 9", "Class 10", "Class 11", "Class 12"
    ];

    const params = new URLSearchParams(window.location.search);
    const requestedClass = params.get("class");
    const selectedClass = requestedClass || "Class";

    const classTitle = document.getElementById("classTitle");
    const breadcrumbClass = document.getElementById("breadcrumbClass");
    const classCategory = document.getElementById("classCategory");
    const studentsBody = document.getElementById("classStudentsBody");
    const rosterSubtitle = document.getElementById("studentRosterSubtitle");
    const sectionsBody = document.getElementById("sectionsTableBody");

    // Only allow known class names from the application.
    if (requestedClass && !allowedClasses.includes(requestedClass)) {
        if (classTitle) classTitle.textContent = "Invalid class";
        if (breadcrumbClass) breadcrumbClass.textContent = "Invalid class";
        if (classCategory) classCategory.textContent = "Invalid class selection";
        document.title = "Invalid Class | Class Details";

        if (studentsBody) {
            showTableMessage(studentsBody, 4, "Invalid class selection.");
        }
        if (sectionsBody) {
            showTableMessage(sectionsBody, 4, "Invalid class selection.");
        }

        console.warn("Rejected an unknown class parameter.");
        return;
    }

    const categoryByClass = {
        "Kids Care": "Kids Care",
        "Nursery": "Nursery Class",
        "LKG": "Lower Kindergarten",
        "UKG": "Upper Kindergarten",
        "Class 1": "Primary",
        "Class 2": "Primary",
        "Class 3": "Primary",
        "Class 4": "Primary",
        "Class 5": "Primary",
        "Class 6": "Middle School",
        "Class 7": "Middle School",
        "Class 8": "Middle School",
        "Class 9": "Secondary",
        "Class 10": "Secondary",
        "Class 11": "Secondary",
        "Class 12": "Secondary"
    };

    const classValueMap = {
        "Kids Care": "KIDSCARE",
        "Nursery": "NUR",
        "LKG": "LKG",
        "UKG": "UKG",
        "Class 1": "1",
        "Class 2": "2",
        "Class 3": "3",
        "Class 4": "4",
        "Class 5": "5",
        "Class 6": "6",
        "Class 7": "7",
        "Class 8": "8",
        "Class 9": "9",
        "Class 10": "10",
        "Class 11": "11",
        "Class 12": "12"
    };

    if (classTitle) classTitle.textContent = selectedClass;
    if (breadcrumbClass) breadcrumbClass.textContent = selectedClass;

    if (classCategory) {
        classCategory.textContent =
            categoryByClass[selectedClass] ||
            "Class information and academic overview";
    }

    document.title = `${selectedClass} | Class Details`;

    const selectedClassValue = classValueMap[selectedClass] || selectedClass;

    if (!studentsBody || !rosterSubtitle || !sectionsBody) {
        console.error("Student roster elements were not found in HTML.");
        return;
    }

    rosterSubtitle.textContent = `Students enrolled in ${selectedClass}`;

    const apiBase = window.API_BASE_URL;
    if (typeof apiBase !== "string" || !apiBase.trim()) {
        console.error("API_BASE_URL is not configured.");
        showTableMessage(studentsBody, 4, "Backend configuration is missing.");
        showTableMessage(sectionsBody, 4, "Backend configuration is missing.");
        return;
    }

    function showTableMessage(tbody, colspan, message, rowClass = "") {
        if (!tbody) return;

        const row = document.createElement("tr");
        if (rowClass) row.className = rowClass;

        const cell = document.createElement("td");
        cell.colSpan = colspan;
        cell.textContent = message;

        row.appendChild(cell);
        tbody.replaceChildren(row);
    }

    function createCell(row, value) {
        const cell = row.insertCell();
        cell.textContent = String(value ?? "");
        return cell;
    }

    function isPositiveId(value) {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0;
    }

    async function getSectionTeacher(section) {
        try {
            const response = await authenticatedFetch(
                `${apiBase}/timetable?class_name=${encodeURIComponent(selectedClassValue)}&section=${encodeURIComponent(section)}`
            );

            if (!response.ok) return "Not assigned";

            const slots = await response.json();
            if (!Array.isArray(slots)) return "Not assigned";

            const teacher = slots.find(
                slot => typeof slot.teacher_name === "string" &&
                    slot.teacher_name.trim()
            )?.teacher_name;

            return teacher || "Not assigned";
        } catch (error) {
            console.warn("Could not load section teacher:", error);
            return "Not assigned";
        }
    }

    async function updateClassAttendance(students) {
        const presentEl = document.getElementById("attPresentCount");
        const absentEl = document.getElementById("attAbsentCount");
        const noteEl = document.getElementById("attNote");

        if (!presentEl || !absentEl) return;

        if (!students || students.length === 0) {
            presentEl.textContent = "0";
            absentEl.textContent = "0";
            if (noteEl) noteEl.textContent = "No students enrolled";
            return;
        }

        // Use the local calendar date rather than UTC's date.
        const now = new Date();
        const today = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");

        try {
            const response = await authenticatedFetch(
                `${apiBase}/attendance?date_val=${encodeURIComponent(today)}&class_name=${encodeURIComponent(selectedClassValue)}`
            );

            const attendanceMap = new Map();

            if (response.ok) {
                const records = await response.json();

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

            let presentCount = 0;
            let absentCount = 0;
            let notMarkedCount = 0;

            students.forEach(student => {
                const studentId = student.student_id ?? student.id;
                const status = attendanceMap.get(String(studentId));

                if (status === "Present") {
                    presentCount++;
                } else if (status === "Absent") {
                    absentCount++;
                } else {
                    notMarkedCount++;
                }
            });

            presentEl.textContent = String(presentCount);
            absentEl.textContent = String(absentCount);

            if (noteEl) {
                noteEl.textContent = notMarkedCount > 0
                    ? `${notMarkedCount} student${notMarkedCount === 1 ? "" : "s"} N/A (unmarked)`
                    : "All attendance marked for today";
            }
        } catch (error) {
            console.warn("Could not load class attendance:", error);
            presentEl.textContent = "0";
            absentEl.textContent = "0";
            if (noteEl) noteEl.textContent = `${students.length} students N/A`;
        }
    }

    async function updateClassSubjects() {
        const countEl = document.getElementById("subjectsCount");
        const listEl = document.getElementById("subjectsTooltipList");
        const noteEl = document.getElementById("subjectsNote");

        if (!countEl || !listEl) return;

        try {
            const response = await authenticatedFetch(`${apiBase}/subjects`);
            if (!response.ok) throw new Error("Failed to load subjects");

            const allSubjects = await response.json();
            if (!Array.isArray(allSubjects)) {
                throw new Error("Invalid subjects response");
            }

            const targetClass = selectedClassValue.trim().toLowerCase();
            const targetDisplayName = selectedClass.trim().toLowerCase();

            const matchedSubjects = allSubjects.filter(subject => {
                const subjectClass = String(subject.class_name ?? "")
                    .trim()
                    .toLowerCase();

                return subjectClass === targetClass ||
                    subjectClass === targetDisplayName;
            });

            countEl.textContent = String(matchedSubjects.length);

            if (noteEl) {
                noteEl.textContent = matchedSubjects.length === 1
                    ? "1 subject taught in this class"
                    : `${matchedSubjects.length} subjects taught in this class`;
            }

            listEl.replaceChildren();

            if (matchedSubjects.length === 0) {
                const item = document.createElement("li");
                item.className = "tooltip-empty";
                item.textContent = `No subjects assigned to ${selectedClass}`;
                listEl.appendChild(item);
                return;
            }

            matchedSubjects.forEach(subject => {
                const item = document.createElement("li");
                item.className = "subjects-tooltip-item";

                const name = document.createElement("span");
                name.className = "tooltip-subject-name";
                name.textContent = String(subject.subject_name ?? "");
                name.title = String(subject.subject_name ?? "");

                const code = document.createElement("span");
                code.className = "tooltip-subject-code";
                code.textContent = String(subject.subject_code || "—");

                item.append(name, code);
                listEl.appendChild(item);
            });
        } catch (error) {
            console.warn("Could not load subjects for class:", error);
            countEl.textContent = "0";

            const item = document.createElement("li");
            item.className = "tooltip-empty";
            item.textContent = "Unable to load subjects";
            listEl.replaceChildren(item);
        }
    }

    async function renderSections(students) {
        const studentsBySection = new Map();

        students.forEach(student => {
            const section = String(student.section ?? "").trim();
            if (!section) return;

            if (!studentsBySection.has(section)) {
                studentsBySection.set(section, []);
            }

            studentsBySection.get(section).push(student);
        });

        const sections = Array.from(studentsBySection.keys()).sort(
            (a, b) => a.localeCompare(b, undefined, { numeric: true })
        );

        sectionsBody.replaceChildren();

        if (sections.length === 0) {
            const row = sectionsBody.insertRow();
            row.className = "empty-row";

            const cell = row.insertCell();
            cell.colSpan = 4;

            const state = document.createElement("div");
            state.className = "table-empty-state";

            const title = document.createElement("strong");
            title.textContent = "No sections to display";

            const message = document.createElement("span");
            message.textContent = "Add students to a section to see it here.";

            state.append(title, message);
            cell.appendChild(state);
            return;
        }

        const sectionTeachers = await Promise.all(
            sections.map(getSectionTeacher)
        );

        sections.forEach((section, index) => {
            const row = sectionsBody.insertRow();
            row.className = "section-row";
            row.tabIndex = 0;
            row.setAttribute("role", "link");
            row.setAttribute(
                "aria-label",
                `Open ${selectedClass} section ${section}`
            );

            const destination =
                `section_details.html?class=${encodeURIComponent(selectedClassValue)}` +
                `&class_display=${encodeURIComponent(selectedClass)}` +
                `&section=${encodeURIComponent(section)}`;

            const openSection = () => {
                window.location.href = destination;
            };

            row.addEventListener("click", event => {
                // Let the actual link handle its own click.
                if (event.target.closest("a")) return;
                openSection();
            });

            row.addEventListener("keydown", event => {
                if (event.target !== row) return;

                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openSection();
                }
            });

            createCell(row, selectedClass);

            const sectionCell = row.insertCell();
            const link = document.createElement("a");
            link.className = "section-details-link";
            link.href = destination;
            link.textContent = `Section ${section}`;
            sectionCell.appendChild(link);

            createCell(row, studentsBySection.get(section).length);
            createCell(row, sectionTeachers[index]);
        });
    }

    async function loadClassStudents() {
        try {
            const response = await authenticatedFetch(`${apiBase}/students`);

            if (!response.ok) {
                throw new Error(`Could not load students: ${response.status}`);
            }

            const result = await response.json();

            const students = Array.isArray(result)
                ? result
                : result?.students;

            if (!Array.isArray(students)) {
                throw new Error("Unexpected student API response.");
            }

            const filteredStudents = students.filter(student => {
                const studentClass = String(
                    student.class ??
                    student.class_name ??
                    student.grade ??
                    ""
                ).trim();

                return studentClass.toLowerCase() ===
                    selectedClassValue.trim().toLowerCase();
            });

            await renderSections(filteredStudents);

            studentsBody.replaceChildren();

            if (filteredStudents.length === 0) {
                showTableMessage(
                    studentsBody,
                    4,
                    `No students found in ${selectedClass}.`
                );
            } else {
                filteredStudents.forEach(student => {
                    const row = studentsBody.insertRow();

                    const fullName =
                        student.full_name ||
                        [student.first_name, student.last_name]
                            .filter(Boolean)
                            .join(" ") ||
                        student.name ||
                        "—";

                    const values = [
                        student.student_id ?? student.id ?? "—",
                        fullName,
                        student.phone ?? student.parent_phone ?? "—",
                        selectedClass
                    ];

                    values.forEach(value => createCell(row, value));
                });
            }

            // Update Total Students card
            const totalStudentsCard = [
                ...document.querySelectorAll(".stat-card")
            ].find(card =>
                card.querySelector(".stat-label")
                    ?.textContent.trim() === "Total Students"
            );

            const totalNumber =
                totalStudentsCard?.querySelector(".stat-number");

            if (totalNumber) {
                totalNumber.textContent = String(filteredStudents.length);
            }

            await updateClassAttendance(filteredStudents);
            await updateClassSubjects();
        } catch (error) {
            console.error("Error loading class students:", error);

            showTableMessage(
                studentsBody,
                4,
                "Unable to load students. Please check the backend."
            );

            showTableMessage(
                sectionsBody,
                4,
                "Unable to load sections. Please check the backend.",
                "empty-row"
            );
        }
    }

    loadClassStudents();
});
