
/* ==========================================================================
   EDIT STUDENT PAGE
   Loads and updates student information through authenticated API requests.
   Requires api.js and script.js.
   ========================================================================== */

const studentForm = document.getElementById("studentForm");
const closeStudentForm = document.getElementById("closeStudentForm");
const cancelStudentForm = document.getElementById("cancelStudentForm");

const params = new URLSearchParams(window.location.search);
const studentId = params.get("student_id");

function getApiBase() {
    return (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function validStudentId(id) {
    return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
}

function safeReturnUrl(value) {
    if (!value) return null;

    try {
        const parsed = new URL(value, window.location.href);

        if (parsed.origin !== window.location.origin) return null;
        if (parsed.username || parsed.password) return null;

        const path = parsed.pathname.toLowerCase();
        if (
            !path.endsWith("/section_details.html") &&
            !path.endsWith("/class_details.html")
        ) {
            return null;
        }

        return parsed.pathname + parsed.search + parsed.hash;
    } catch (_) {
        return null;
    }
}

const returnUrl = safeReturnUrl(params.get("return_url"));

function goToStudents() {
    window.location.href = returnUrl || "student.html";
}

if (closeStudentForm) {
    closeStudentForm.addEventListener("click", goToStudents);
}
if (cancelStudentForm) {
    cancelStudentForm.addEventListener("click", goToStudents);
}

function setFieldValue(id, value) {
    const field = document.getElementById(id);
    if (field) {
        field.value = value === null || value === undefined ? "" : String(value);
    }
}

async function loadStudent() {
    if (!validStudentId(studentId)) {
        alert("A valid student ID was not provided.");
        goToStudents();
        return;
    }

    if (typeof window.authenticatedFetch !== "function") {
        alert("Authentication helper is unavailable. Check api.js.");
        return;
    }

    try {
        const response = await window.authenticatedFetch(
            `${getApiBase()}/students/details?student_id=${encodeURIComponent(studentId)}`
        );

        if (!response.ok) {
            throw new Error(`Failed to load student (HTTP ${response.status}).`);
        }

        const student = await response.json();

        if (!student || typeof student !== "object" || Array.isArray(student)) {
            throw new Error("Unexpected student API response.");
        }

        const fields = {
            fullName: student.full_name,
            dateOfBirth: student.date_of_birth,
            gender: student.gender,
            category: student.category,
            bloodGroup: student.blood_group,
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
            motherPhone: student.mother_phone,
            houseNo: student.house_no,
            pincode: student.pincode,
            street: student.street,
            city: student.city,
            state: student.state
        };

        Object.entries(fields).forEach(([id, value]) => setFieldValue(id, value));
    } catch (error) {
        console.error("Error loading student:", error);
        alert("Unable to load student details. Check your session and backend connection.");
    }
}

if (studentForm) {
    studentForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!validStudentId(studentId)) {
            alert("A valid student ID was not provided.");
            return;
        }

        if (!studentForm.reportValidity()) return;

        const value = (id) => {
            const field = document.getElementById(id);
            return field ? field.value.trim() : "";
        };

        const studentData = {
            full_name: value("fullName"),
            date_of_birth: value("dateOfBirth"),
            gender: value("gender"),
            category: value("category"),
            blood_group: value("bloodGroup"),

            admission_date: value("admissionDate"),
            admission_no: value("admissionNo"),
            aadhar_no_last_four: value("aadharLastFour"),
            apaar_no: value("apaarNo"),
            pen_no: value("penNo"),
            bpl: value("bpl"),
            class_name: value("className") || null,
            section: value("section") || null,

            father_name: value("fatherName"),
            father_aadhar_last_four: value("fatherAadhar"),
            father_phone: value("fatherPhone") || null,

            mother_name: value("motherName"),
            mother_aadhar_last_four: value("motherAadhar"),
            mother_phone: value("motherPhone") || null,

            house_no: value("houseNo") || null,
            pincode: value("pincode"),
            street: value("street"),
            city: value("city"),
            state: value("state")
        };

        const submitButton = studentForm.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await window.authenticatedFetch(
                `${getApiBase()}/students/${encodeURIComponent(studentId)}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(studentData)
                }
            );

            let result = {};
            try {
                result = await response.json();
            } catch (_) {}

            if (!response.ok) {
                const message =
                    typeof result.detail === "string"
                        ? result.detail
                        : `Failed to update student (HTTP ${response.status}).`;
                alert(message);
                return;
            }

            alert("Student updated successfully!");
            goToStudents();
        } catch (error) {
            console.error("Error updating student:", error);
            alert("Unable to update student. Check your session and backend connection.");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
} else {
    console.error("Student form was not found on this page.");
}

loadStudent();
