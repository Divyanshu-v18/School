/* Teacher directory: search, post filter, and CRUD navigation. */
(() => {
    "use strict";

    const addTeacherBtn = document.getElementById("addTeacherBtn");
    const teacherSearch = document.getElementById("teacherSearch");
    const postFilter = document.getElementById("postFilter");
    const clearFiltersBtn = document.getElementById("clearTeacherFilters");
    const teacherTableBody = document.getElementById("teacherTableBody");
    const resultCount = document.getElementById("teacherResultCount");

    let teachers = [];

    const apiBase = () => (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    const authenticatedFetch = (url, options) => {
        if (typeof window.authenticatedFetch !== "function") {
            throw new Error("Authentication helper is unavailable. Check api.js.");
        }
        return window.authenticatedFetch(url, options);
    };
    const validTeacherId = id => /^\d+$/.test(String(id ?? "")) && Number(id) > 0;

    function showTableMessage(message) {
        if (!teacherTableBody) return;
        teacherTableBody.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = message;
        row.appendChild(cell);
        teacherTableBody.appendChild(row);
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
        populateSelect(postFilter, uniqueSorted(teachers.map(t => t.post)), "All posts");
    }

    function getFilteredTeachers() {
        const query = (teacherSearch?.value || "").trim().toLowerCase();
        const selectedPost = postFilter?.value || "";

        return teachers.filter(teacher => {
            const matchesQuery = [
                teacher.teacher_id, teacher.full_name, teacher.phone, teacher.post
            ].some(value => String(value ?? "").toLowerCase().includes(query));
            const matchesPost = !selectedPost || String(teacher.post ?? "") === selectedPost;
            return matchesQuery && matchesPost;
        });
    }

    function displayTeachers(list) {
        if (!teacherTableBody) return;
        teacherTableBody.replaceChildren();

        if (!list.length) {
            showTableMessage(teachers.length ? "No teachers match the selected filters." : "No teachers found.");
            return;
        }

        list.forEach(teacher => {
            const row = document.createElement("tr");
            [teacher.teacher_id, teacher.full_name, teacher.phone, teacher.post].forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value === null || value === undefined || value === "" ? "-" : String(value);
                row.appendChild(cell);
            });

            const actionCell = document.createElement("td");
            actionCell.className = "teacher-actions";

            const infoButton = document.createElement("button");
            infoButton.type = "button";
            infoButton.className = "info-btn";
            infoButton.textContent = "Info";
            infoButton.addEventListener("click", () => viewTeacher(teacher.teacher_id));

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "edit-btn";
            editButton.textContent = "Edit";
            editButton.addEventListener("click", () => editTeacher(teacher.teacher_id));

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-btn";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => deleteTeacher(teacher.teacher_id));

            actionCell.append(infoButton, editButton, deleteButton);
            row.appendChild(actionCell);
            teacherTableBody.appendChild(row);
        });

        if (resultCount) resultCount.textContent = `Showing ${list.length} of ${teachers.length} teachers`;
    }

    function applyFilters() {
        displayTeachers(getFilteredTeachers());
    }

    function viewTeacher(id) {
        if (!validTeacherId(id)) return alert("Invalid teacher ID.");
        window.location.href = `teacher_details.html?teacher_id=${encodeURIComponent(id)}`;
    }

    function editTeacher(id) {
        if (!validTeacherId(id)) return alert("Invalid teacher ID.");
        window.location.href = `edit_teacher.html?teacher_id=${encodeURIComponent(id)}`;
    }

    async function loadTeachers() {
        if (!teacherTableBody) return;
        try {
            const response = await authenticatedFetch(`${apiBase()}/teachers`);
            if (!response.ok) throw new Error(`Unable to load teachers (HTTP ${response.status}).`);
            const data = await response.json();
            const list = Array.isArray(data) ? data : data?.teachers;
            if (!Array.isArray(list)) throw new Error("Unexpected teacher API response.");
            teachers = list;
            populateFilters();
            displayTeachers(getFilteredTeachers());
        } catch (error) {
            console.error("Error loading teachers:", error);
            if (!window.location.pathname.toLowerCase().endsWith("login.html")) {
                showTableMessage("Unable to load teachers. Please try again.");
            }
        }
    }

    function deleteTeacher(teacherId) {
        if (!validTeacherId(teacherId)) return alert("Invalid teacher ID.");
        if (typeof window.showDeleteConfirmationModal !== "function") {
            return alert("Delete confirmation modal is unavailable.");
        }

        window.showDeleteConfirmationModal({
            title: "Delete Teacher?",
            initialMessage: "Please wait before confirmation.",
            confirmMessage: "Are you sure you want to permanently delete this teacher?",
            countdownSeconds: 5,
            onConfirm: async () => {
                try {
                    const response = await authenticatedFetch(
                        `${apiBase()}/teachers/${encodeURIComponent(teacherId)}`,
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
                    await loadTeachers();
                } catch (error) {
                    console.error("Error deleting teacher:", error);
                    alert("Unable to complete the request. Check your session and backend connection.");
                }
            }
        });
    }

    addTeacherBtn?.addEventListener("click", () => { window.location.href = "add_teacher.html"; });
    teacherSearch?.addEventListener("input", () => displayTeachers(getFilteredTeachers()));
    postFilter?.addEventListener("change", applyFilters);
    clearFiltersBtn?.addEventListener("click", () => {
        if (teacherSearch) teacherSearch.value = "";
        if (postFilter) postFilter.value = "";
        displayTeachers(getFilteredTeachers());
    });

    loadTeachers();
})();
