
/* ==========================================================================
   STUDENT DIRECTORY & MANAGEMENT
   Secure rendering, search, navigation, and deletion.
   Requires api.js and script.js.
   ========================================================================== */

const addStudentBtn = document.getElementById("addStudentBtn");
const studentSearch = document.getElementById("studentSearch");
const studentTableBody = document.getElementById("studentTableBody");

let students = [];

function getApiBase() {
    return (window.API_BASE_URL || "http://127.0.0.1:8000")
        .replace(/\/+$/, "");
}

function requestAuthenticated(url, options = {}) {
    if (typeof window.authenticatedFetch !== "function") {
        throw new Error("Authentication helper is unavailable. Check api.js.");
    }
    return window.authenticatedFetch(url, options);
}

function validStudentId(id) {
    return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
}

if (addStudentBtn) {
    addStudentBtn.addEventListener("click", () => {
        window.location.href = "add_student.html";
    });
}

function viewStudent(id) {
    if (!validStudentId(id)) return alert("Invalid student ID.");
    window.location.href =
        `student_details.html?student_id=${encodeURIComponent(id)}`;
}

function editStudent(id) {
    if (!validStudentId(id)) return alert("Invalid student ID.");
    window.location.href =
        `edit_student.html?student_id=${encodeURIComponent(id)}`;
}

function showTableMessage(message) {
    if (!studentTableBody) return;

    studentTableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = message;

    row.appendChild(cell);
    studentTableBody.appendChild(row);
}

async function loadStudents() {
    if (!studentTableBody) return;

    try {
        const response = await requestAuthenticated(
            `${getApiBase()}/students`
        );

        if (!response.ok) {
            throw new Error(`Unable to load students (HTTP ${response.status}).`);
        }

        const data = await response.json();
        const list = Array.isArray(data) ? data : data?.students;

        if (!Array.isArray(list)) {
            throw new Error("Unexpected student API response.");
        }

        students = list;
        displayStudents(students);
    } catch (error) {
        console.error("Error loading students:", error);

        if (window.location.pathname.toLowerCase().endsWith("login.html")) {
            return;
        }

        showTableMessage("Unable to load students. Please try again.");
    }
}

function displayStudents(list) {
    if (!studentTableBody) return;

    studentTableBody.replaceChildren();

    if (!list.length) {
        showTableMessage("No students found.");
        return;
    }

    list.forEach((student) => {
        const row = document.createElement("tr");

        const idCell = document.createElement("td");
        idCell.textContent = student.student_id ?? "-";

        const nameCell = document.createElement("td");
        nameCell.textContent = student.full_name ?? "-";

        const classCell = document.createElement("td");
        classCell.textContent = student.class ?? "-";

        const sectionCell = document.createElement("td");
        sectionCell.textContent = student.section ?? "-";

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
        row.append(idCell, nameCell, classCell, sectionCell, actionCell);
        studentTableBody.appendChild(row);
    });
}

if (studentSearch) {
    studentSearch.addEventListener("input", () => {
        const query = studentSearch.value.toLowerCase().trim();

        displayStudents(students.filter((student) =>
            [
                student.student_id,
                student.full_name,
                student.class,
                student.section
            ].some((value) => String(value ?? "").toLowerCase().includes(query))
        ));
    });
}

function deleteStudent(studentId) {
    if (!validStudentId(studentId)) {
        alert("Invalid student ID.");
        return;
    }

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
                const response = await requestAuthenticated(
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
                await loadStudents();
            } catch (error) {
                console.error("Error deleting student:", error);
                alert("Unable to complete the request. Check your session and backend connection.");
            }
        }
    });
}

loadStudents();
