
/* ==========================================================================
   TEACHER DETAILS VIEW
   Displays teacher profile and supports print, edit, and delete.
   Requires api.js and script.js.
   ========================================================================== */

const params = new URLSearchParams(window.location.search);
const currentTeacherId = params.get("teacher_id");

function getApiBase() {
    return (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function validTeacherId(id) {
    return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent =
            value === null || value === undefined || value === ""
                ? "-"
                : String(value);
    }
}

const backToTeachers = document.getElementById("backToTeachers");
if (backToTeachers) {
    backToTeachers.addEventListener("click", () => {
        window.location.href = "teacher.html";
    });
}

async function loadTeacherDetails() {
    if (!validTeacherId(currentTeacherId)) {
        alert("A valid teacher ID was not provided.");
        window.location.href = "teacher.html";
        return;
    }

    if (typeof window.authenticatedFetch !== "function") {
        alert("Authentication helper is unavailable. Check api.js.");
        return;
    }

    try {
        const response = await window.authenticatedFetch(
            `${getApiBase()}/teachers/details?teacher_id=${encodeURIComponent(currentTeacherId)}`
        );

        if (!response.ok) {
            throw new Error(`Failed to load teacher details (HTTP ${response.status}).`);
        }

        const teacher = await response.json();

        if (!teacher || typeof teacher !== "object" || Array.isArray(teacher)) {
            throw new Error("Unexpected teacher API response.");
        }

        const fields = {
            teacherId: teacher.teacher_id,
            fullName: teacher.full_name,
            dateOfBirth: teacher.date_of_birth,
            gender: teacher.gender,
            category: teacher.category,
            bloodGroup: teacher.blood_group,
            phone: teacher.phone,
            email: teacher.email,
            houseNo: teacher.house_no,
            street: teacher.street,
            city: teacher.city,
            state: teacher.state,
            pincode: teacher.pincode,
            dateOfJoining: teacher.date_of_joining,
            joiningNo: teacher.joining_no,
            aadharNo: teacher.aadhar_no,
            qualification: teacher.qualification,
            post: teacher.post,
            cl: teacher.cl
        };

        Object.entries(fields).forEach(([id, value]) => setText(id, value));
    } catch (error) {
        console.error("Error loading teacher details:", error);
        alert("Unable to load teacher details. Check your session and backend connection.");
    }
}

const printTeacherBtn = document.getElementById("printTeacherBtn");
if (printTeacherBtn) {
    printTeacherBtn.addEventListener("click", () => window.print());
}

const editTeacherBtn = document.getElementById("editTeacherBtn");
if (editTeacherBtn) {
    editTeacherBtn.addEventListener("click", () => {
        if (!validTeacherId(currentTeacherId)) {
            alert("A valid teacher ID was not provided.");
            return;
        }

        window.location.href =
            `edit_teacher.html?teacher_id=${encodeURIComponent(currentTeacherId)}`;
    });
}

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
                        if (typeof result.detail === "string") {
                            message = result.detail;
                        }
                    } catch (_) {}

                    alert(message);
                    return;
                }

                alert("Teacher deleted successfully!");
                window.location.href = "teacher.html";
            } catch (error) {
                console.error("Error deleting teacher:", error);
                alert("Unable to delete teacher. Check your session and backend connection.");
            }
        }
    });
}

loadTeacherDetails();
