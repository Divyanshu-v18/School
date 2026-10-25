
/* ==========================================================================
   TEACHER DIRECTORY & MANAGEMENT
   Handles listing, filtering, search, and deletion of teachers.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const addTeacherBtn = document.getElementById("addTeacherBtn");
    const teacherSearch = document.getElementById("teacherSearch");
    const tableBody = document.getElementById("teacherTableBody");

    let teachers = [];

    /* ========================================
       VALIDATION & TABLE HELPERS
    ======================================== */

    function isValidTeacherId(value) {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0;
    }

    function showTableMessage(message) {
        if (!tableBody) return;

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.textContent = message;

        row.appendChild(cell);
        tableBody.replaceChildren(row);
    }

    /* ========================================
       NAVIGATION
    ======================================== */

    if (addTeacherBtn) {
        addTeacherBtn.addEventListener("click", () => {
            window.location.href = "add_teacher.html";
        });
    }

    function viewTeacher(teacherId) {
        if (!isValidTeacherId(teacherId)) {
            alert("Invalid teacher ID.");
            return;
        }

        window.location.href =
            `teacher_details.html?teacher_id=${encodeURIComponent(Number(teacherId))}`;
    }

    function editTeacher(teacherId) {
        if (!isValidTeacherId(teacherId)) {
            alert("Invalid teacher ID.");
            return;
        }

        window.location.href =
            `edit_teacher.html?teacher_id=${encodeURIComponent(Number(teacherId))}`;
    }

    /* ========================================
       LOAD TEACHERS FROM API
    ======================================== */

    async function loadTeachers() {
        const apiBase = window.API_BASE_URL || "http://127.0.0.1:8000";

        try {
            const response = await authenticatedFetch(`${apiBase}/teachers`);

            if (!response.ok) {
                throw new Error("Failed to load teachers.");
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error("Invalid teachers response.");
            }

            teachers = data;
            displayTeachers(teachers);
        } catch (error) {
            console.error("Error loading teachers:", error);
            showTableMessage(
                "Unable to load teachers. Please check the backend connection."
            );
        }
    }

    /* ========================================
       DISPLAY & RENDER TABLE
    ======================================== */

    function displayTeachers(data) {
        if (!tableBody) return;

        tableBody.replaceChildren();

        if (data.length === 0) {
            showTableMessage("No teachers found.");
            return;
        }

        data.forEach(teacher => {
            const row = document.createElement("tr");

            const idCell = document.createElement("td");
            idCell.textContent = String(teacher.teacher_id ?? "");

            const nameCell = document.createElement("td");
            nameCell.textContent = String(teacher.full_name ?? "");

            const phoneCell = document.createElement("td");
            phoneCell.textContent = String(teacher.phone ?? "");

            const postCell = document.createElement("td");
            postCell.textContent = String(teacher.post || "-");

            const actionsCell = document.createElement("td");
            actionsCell.className = "teacher-actions";

            const infoButton = document.createElement("button");
            infoButton.type = "button";
            infoButton.className = "info-btn";
            infoButton.textContent = "Info";
            infoButton.addEventListener("click", () => {
                viewTeacher(teacher.teacher_id);
            });

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "edit-btn";
            editButton.textContent = "Edit";
            editButton.addEventListener("click", () => {
                editTeacher(teacher.teacher_id);
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-btn";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => {
                deleteTeacher(teacher.teacher_id);
            });

            actionsCell.append(infoButton, editButton, deleteButton);

            row.append(
                idCell,
                nameCell,
                phoneCell,
                postCell,
                actionsCell
            );

            tableBody.appendChild(row);
        });
    }

    /* ========================================
       LIVE SEARCH
    ======================================== */

    if (teacherSearch) {
        teacherSearch.addEventListener("input", () => {
            const searchValue = teacherSearch.value.toLowerCase().trim();

            const filteredTeachers = teachers.filter(teacher => {
                const id = String(teacher.teacher_id ?? "");
                const name = String(teacher.full_name ?? "").toLowerCase();
                const phone = String(teacher.phone ?? "").toLowerCase();
                const post = String(teacher.post ?? "").toLowerCase();

                return (
                    id.includes(searchValue) ||
                    name.includes(searchValue) ||
                    phone.includes(searchValue) ||
                    post.includes(searchValue)
                );
            });

            displayTeachers(filteredTeachers);
        });
    }

    /* ========================================
       DELETE TEACHER (WITH COUNTDOWN MODAL)
    ======================================== */

    function deleteTeacher(teacherId) {
        const id = Number(teacherId);

        if (!isValidTeacherId(id)) {
            alert("Invalid teacher ID.");
            return;
        }

        if (typeof window.showDeleteConfirmationModal !== "function") {
            console.error("Delete confirmation modal is unavailable.");
            alert("Unable to open the delete confirmation dialog.");
            return;
        }

        window.showDeleteConfirmationModal({
            title: "Delete Teacher?",
            initialMessage: "Please wait before confirmation.",
            confirmMessage:
                "Are you sure you want to permanently delete this teacher?",
            countdownSeconds: 5,

            onConfirm: async () => {
                const apiBase =
                    window.API_BASE_URL || "http://127.0.0.1:8000";

                try {
                    const response = await authenticatedFetch(
                        `${apiBase}/teachers/${id}`,
                        { method: "DELETE" }
                    );

                    if (!response.ok) {
                        let message = "Failed to delete teacher.";

                        try {
                            const result = await response.json();

                            if (typeof result.detail === "string") {
                                message = result.detail;
                            }
                        } catch {
                            // Keep the generic error message.
                        }

                        alert(message);
                        return;
                    }

                    alert("Teacher deleted successfully!");
                    await loadTeachers();
                } catch (error) {
                    console.error("Error deleting teacher:", error);
                    alert("Unable to connect to the backend.");
                }
            }
        });
    }

    // Initial load
    loadTeachers();
});
