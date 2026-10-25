
/* ==========================================================================
   STUDENT DETAILS VIEW
   Displays student profile and provides print, edit, and delete actions.
   Requires api.js and script.js.
   ========================================================================== */

const params = new URLSearchParams(window.location.search);
const currentStudentId = params.get("student_id");
const rawReturnUrl = params.get("return_url");

function getApiBase() {
    return (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function validStudentId(id) {
    return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
}

function safeReturnUrl(value) {
    if (!value) return null;

    // Only allow known local pages; reject absolute URLs and path traversal.
    try {
        const decoded = value;
        const parsed = new URL(decoded, window.location.href);

        if (parsed.origin !== window.location.origin) return null;
        if (parsed.username || parsed.password) return null;

        const path = parsed.pathname.toLowerCase();
        const allowed =
            path.endsWith("/section_details.html") ||
            path.endsWith("/class_details.html");

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

const backToStudents = document.getElementById("backToStudents");
if (backToStudents) {
    if (returnUrl && returnUrl.toLowerCase().includes("section_details")) {
        backToStudents.textContent = "← Back to Section";
    }
    backToStudents.addEventListener("click", goBackToStudents);
}

async function loadStudentDetails() {
    if (!validStudentId(currentStudentId)) {
        alert("A valid student ID was not provided.");
        goBackToStudents();
        return;
    }

    if (typeof window.authenticatedFetch !== "function") {
        alert("Authentication helper is unavailable. Check api.js.");
        return;
    }

    try {
        const response = await window.authenticatedFetch(
            `${getApiBase()}/students/details?student_id=${encodeURIComponent(currentStudentId)}`
        );

        if (!response.ok) {
            throw new Error(`Failed to load student details (HTTP ${response.status}).`);
        }

        const student = await response.json();

        if (!student || typeof student !== "object" || Array.isArray(student)) {
            throw new Error("Unexpected student details response.");
        }

        const fields = {
            studentId: student.student_id,
            fullName: student.full_name,
            dateOfBirth: student.date_of_birth,
            gender: student.gender,
            category: student.category,
            bloodGroup: student.blood_group,
            houseNo: student.house_no,
            street: student.street,
            city: student.city,
            state: student.state,
            pincode: student.pincode,
            admissionDate: student.admission_date,
            admissionNo: student.admission_no,
            aadharLastFour: student.aadhar_no_last_four,
            apaarNo: student.apaar_no,
            penNo: student.pen_no,
            bpl: student.bpl,
            className: student.class,
            section: student.section,
            fatherName: student.father_name,
            fatherAadhar: student.father_aadhar_last_four,
            fatherPhone: student.father_phone,
            motherName: student.mother_name,
            motherAadhar: student.mother_aadhar_last_four,
            motherPhone: student.mother_phone
        };

        Object.entries(fields).forEach(([elementId, value]) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent =
                    value === null || value === undefined || value === ""
                        ? "-"
                        : String(value);
            }
        });

        const transportEl = document.getElementById("transport");
        if (transportEl) {
            transportEl.textContent =
                student.transportation || student.transport || "-";
        }
    } catch (error) {
        console.error("Error loading student details:", error);
        alert("Unable to load student details. Check your session and backend connection.");
    }
}

const printStudentBtn = document.getElementById("printStudentBtn");
if (printStudentBtn) {
    printStudentBtn.addEventListener("click", () => window.print());
}

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

loadStudentDetails();
