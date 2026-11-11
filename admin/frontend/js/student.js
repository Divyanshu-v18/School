/* Student directory: search, class/section filters, and CRUD navigation. */
(() => {
    "use strict";

    const addStudentBtn = document.getElementById("addStudentBtn");
    const studentSearch = document.getElementById("studentSearch");
    const classFilter = document.getElementById("classFilter");
    const sectionFilter = document.getElementById("sectionFilter");
    const clearFiltersBtn = document.getElementById("clearStudentFilters");
    const studentTableBody = document.getElementById("studentTableBody");
    const resultCount = document.getElementById("studentResultCount");

    let students = [];

    const apiBase = () => (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    const authenticatedFetch = (url, options) => {
        if (typeof window.authenticatedFetch !== "function") {
            throw new Error("Authentication helper is unavailable. Check api.js.");
        }
        return window.authenticatedFetch(url, options);
    };
    const validStudentId = id => /^\d+$/.test(String(id ?? "")) && Number(id) > 0;

    function showTableMessage(message) {
        if (!studentTableBody) return;
        studentTableBody.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = message;
        row.appendChild(cell);
        studentTableBody.appendChild(row);
        if (resultCount) resultCount.textContent = "";
    }

    function uniqueSorted(values) {
        return [...new Set(values.map(v => String(v ?? "").trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    }

    function populateSelect(select, values, defaultLabel) {
        if (!select) return;
        const previous = select.value;
        select.replaceChildren();
        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = defaultLabel;
        select.appendChild(allOption);
        values.forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        select.value = values.includes(previous) ? previous : "";
    }

    function populateFilters() {
        populateSelect(classFilter, uniqueSorted(students.map(s => s.class)), "All classes");
        updateSectionOptions();
    }

    function updateSectionOptions() {
        if (!sectionFilter) return;
        const selectedClass = classFilter?.value || "";
        const relevant = students.filter(s => !selectedClass || String(s.class ?? "") === selectedClass);
        const sections = uniqueSorted(relevant.map(s => s.section));
        const previous = sectionFilter.value;
        populateSelect(sectionFilter, sections, "All sections");
        if (sections.includes(previous)) sectionFilter.value = previous;
    }

    function getFilteredStudents() {
        const query = (studentSearch?.value || "").trim().toLowerCase();
        const selectedClass = classFilter?.value || "";
        const selectedSection = sectionFilter?.value || "";

        return students.filter(student => {
            const matchesQuery = [
                student.student_id, student.full_name, student.class, student.section
            ].some(value => String(value ?? "").toLowerCase().includes(query));
            const matchesClass = !selectedClass || String(student.class ?? "") === selectedClass;
            const matchesSection = !selectedSection || String(student.section ?? "") === selectedSection;
            return matchesQuery && matchesClass && matchesSection;
        });
    }

    function displayStudents(list) {
        if (!studentTableBody) return;
        studentTableBody.replaceChildren();

        if (!list.length) {
            showTableMessage(students.length ? "No students match the selected filters." : "No students found.");
            return;
        }

        list.forEach(student => {
            const row = document.createElement("tr");
            [student.student_id, student.full_name, student.class, student.section].forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value === null || value === undefined || value === "" ? "-" : String(value);
                row.appendChild(cell);
            });

            const actionCell = document.createElement("td");
            actionCell.className = "student-actions";

            const infoButton = document.createElement("button");
            infoButton.type = "button";
            infoButton.className = "info-btn";
            infoButton.textContent = "Info";
            infoButton.addEventListener("click", () => viewStudent(student.student_id));

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "edit-btn";
            editButton.textContent = "Edit";
            editButton.addEventListener("click", () => editStudent(student.student_id));

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-btn";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => deleteStudent(student.student_id));

            actionCell.append(infoButton, editButton, deleteButton);
            row.appendChild(actionCell);
            studentTableBody.appendChild(row);
        });

        if (resultCount) resultCount.textContent = `Showing ${list.length} of ${students.length} students`;
    }

    function applyFilters() {
        updateSectionOptions();
        displayStudents(getFilteredStudents());
    }

    function viewStudent(id) {
        if (!validStudentId(id)) return alert("Invalid student ID.");
        window.location.href = `student_details.html?student_id=${encodeURIComponent(id)}`;
    }

    function editStudent(id) {
        if (!validStudentId(id)) return alert("Invalid student ID.");
        window.location.href = `edit_student.html?student_id=${encodeURIComponent(id)}`;
    }

    async function loadStudents() {
        if (!studentTableBody) return;
        try {
            const response = await authenticatedFetch(`${apiBase()}/students`);
            if (!response.ok) throw new Error(`Unable to load students (HTTP ${response.status}).`);
            const data = await response.json();
            const list = Array.isArray(data) ? data : data?.students;
            if (!Array.isArray(list)) throw new Error("Unexpected student API response.");
            students = list;
            populateFilters();
            displayStudents(getFilteredStudents());
        } catch (error) {
            console.error("Error loading students:", error);
            if (!window.location.pathname.toLowerCase().endsWith("login.html")) {
                showTableMessage("Unable to load students. Please try again.");
            }
        }
    }

    function deleteStudent(studentId) {
        if (!validStudentId(studentId)) return alert("Invalid student ID.");
        if (typeof window.showDeleteConfirmationModal !== "function") {
            return alert("Delete confirmation modal is unavailable.");
        }

        window.showDeleteConfirmationModal({
            title: "Delete Student?",
            initialMessage: "Please wait before confirmation.",
            confirmMessage: "Are you sure you want to permanently delete this student?",
            countdownSeconds: 5,
            onConfirm: async () => {
                try {
                    const response = await authenticatedFetch(
                        `${apiBase()}/students/${encodeURIComponent(studentId)}`,
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
                    await loadStudents();
                } catch (error) {
                    console.error("Error deleting student:", error);
                    alert("Unable to complete the request. Check your session and backend connection.");
                }
            }
        });
    }

    addStudentBtn?.addEventListener("click", () => { window.location.href = "add_student.html"; });
    studentSearch?.addEventListener("input", () => displayStudents(getFilteredStudents()));
    classFilter?.addEventListener("change", applyFilters);
    sectionFilter?.addEventListener("change", () => displayStudents(getFilteredStudents()));
    clearFiltersBtn?.addEventListener("click", () => {
        if (studentSearch) studentSearch.value = "";
        if (classFilter) classFilter.value = "";
        updateSectionOptions();
        if (sectionFilter) sectionFilter.value = "";
        displayStudents(getFilteredStudents());
    });

    loadStudents();
})();