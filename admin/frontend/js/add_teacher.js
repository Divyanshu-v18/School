
/* ==========================================================================
   ADD TEACHER PAGE
   Validates and submits new teacher information.
   Requires api.js and script.js.
   ========================================================================== */

const teacherForm = document.getElementById("teacherForm");
const closeTeacherForm = document.getElementById("closeTeacherForm");
const cancelTeacherForm = document.getElementById("cancelTeacherForm");

function getApiBase() {
    return (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function goToTeachers() {
    window.location.href = "teacher.html";
}

if (closeTeacherForm) {
    closeTeacherForm.addEventListener("click", goToTeachers);
}

if (cancelTeacherForm) {
    cancelTeacherForm.addEventListener("click", goToTeachers);
}

function getFieldValue(id) {
    const field = document.getElementById(id);

    if (!field) {
        throw new Error(`Required form field is missing: ${id}`);
    }

    return field.value.trim();
}

if (teacherForm) {
    teacherForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!teacherForm.reportValidity()) return;

        if (typeof window.authenticatedFetch !== "function") {
            alert("Authentication helper is unavailable. Check api.js.");
            return;
        }

        let teacherData;

        try {
            const clValue = getFieldValue("cl");

            if (
                clValue === "" ||
                !Number.isFinite(Number(clValue)) ||
                Number(clValue) < 0
            ) {
                alert("Please enter a valid CL value.");
                return;
            }

            teacherData = {
                full_name: getFieldValue("fullName"),
                date_of_birth: getFieldValue("dateOfBirth"),
                gender: getFieldValue("gender"),
                category: getFieldValue("category"),
                blood_group: getFieldValue("bloodGroup"),
                phone: getFieldValue("phone"),
                email: getFieldValue("email"),

                house_no: getFieldValue("houseNo") || null,
                street: getFieldValue("street"),
                city: getFieldValue("city"),
                state: getFieldValue("state"),
                pincode: getFieldValue("pincode"),

                date_of_joining: getFieldValue("dateOfJoining"),
                joining_no: getFieldValue("joiningNo") || null,
                aadhar_no: getFieldValue("aadharNo"),
                qualification: getFieldValue("qualification"),
                post: getFieldValue("post"),
                cl: Number(clValue)
            };
        } catch (error) {
            console.error("Teacher form error:", error);
            alert("Some required form fields are missing. Please check the form configuration.");
            return;
        }

        const submitButton = teacherForm.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await window.authenticatedFetch(
                `${getApiBase()}/teachers`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(teacherData)
                }
            );

            let result = {};

            try {
                result = await response.json();
            } catch (_) {}

            if (!response.ok) {
                alert(
                    typeof result.detail === "string"
                        ? result.detail
                        : `Failed to add teacher (HTTP ${response.status}).`
                );
                return;
            }

            alert("Teacher added successfully!");
            goToTeachers();
        } catch (error) {
            console.error("Error adding teacher:", error);
            alert("Unable to add teacher. Check your session and backend connection.");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
} else {
    console.error("Teacher form was not found on this page.");
}
