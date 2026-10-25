
/* ==========================================================================
   ADD STUDENT FORM
   Validates form inputs and submits through the authenticated API helper.
   Requires api.js and script.js.
   ========================================================================== */

const studentForm = document.getElementById("studentForm");
const closeStudentForm = document.getElementById("closeStudentForm");
const cancelStudentForm = document.getElementById("cancelStudentForm");

function getApiBase() {
    return (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function goToStudents() {
    window.location.href = "student.html";
}

if (closeStudentForm) {
    closeStudentForm.addEventListener("click", goToStudents);
}

if (cancelStudentForm) {
    cancelStudentForm.addEventListener("click", goToStudents);
}

function getFieldValue(id) {
    const field = document.getElementById(id);

    if (!field) {
        throw new Error(`Required form field is missing: ${id}`);
    }

    return field.value.trim();
}

if (studentForm) {
    studentForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!studentForm.reportValidity()) return;

        if (typeof window.authenticatedFetch !== "function") {
            alert("Authentication helper is unavailable. Check api.js.");
            return;
        }

        let studentData;

        try {
            studentData = {
                // Basic details
                full_name: getFieldValue("fullName"),
                date_of_birth: getFieldValue("dateOfBirth"),
                gender: getFieldValue("gender"),
                category: getFieldValue("category"),
                blood_group: getFieldValue("bloodGroup"),

                // Admission and school details
                admission_date: getFieldValue("admissionDate"),
                admission_no: getFieldValue("admissionNo"),
                aadhar_no_last_four: getFieldValue("aadharLastFour"),
                apaar_no: getFieldValue("apaarNo"),
                pen_no: getFieldValue("penNo"),
                bpl: getFieldValue("bpl"),
                class_name: getFieldValue("class") || null,
                section: getFieldValue("section") || null,

                // Parent details
                father_name: getFieldValue("fatherName"),
                father_aadhar_last_four: getFieldValue("fatherAadharLastFour"),
                father_phone: getFieldValue("fatherPhone") || null,
                mother_name: getFieldValue("motherName"),
                mother_aadhar_last_four: getFieldValue("motherAadharLastFour"),
                mother_phone: getFieldValue("motherPhone") || null,

                // Address details
                house_no: getFieldValue("houseNo") || null,
                pincode: getFieldValue("pincode"),
                street: getFieldValue("street"),
                city: getFieldValue("city"),
                state: getFieldValue("state")
            };
        } catch (error) {
            console.error("Student form error:", error);
            alert("Some form fields are missing. Please check the form configuration.");
            return;
        }

        // Avoid duplicate submissions while the request is in progress.
        const submitButton = studentForm.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await window.authenticatedFetch(
                `${getApiBase()}/students`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(studentData)
                }
            );

            let result = {};

            try {
                result = await response.json();
            } catch (_) {
                // The response may not contain JSON.
            }

            if (!response.ok) {
                const message =
                    typeof result.detail === "string"
                        ? result.detail
                        : `Failed to add student (HTTP ${response.status}).`;

                alert(message);
                return;
            }

            if (
                result.student_id === undefined ||
                result.student_id === null
            ) {
                alert("Student was submitted, but the server did not return a student ID.");
                goToStudents();
                return;
            }

            alert(`Student added successfully!\nStudent ID: ${result.student_id}`);
            goToStudents();
        } catch (error) {
            console.error("Error adding student:", error);
            alert("Unable to add student. Check your session and backend connection.");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
} else {
    console.error("Student form was not found on this page.");
}
