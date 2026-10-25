
/* ==========================================================================
   EDIT TEACHER PAGE
   Loads and updates teacher information using authenticated API requests.
   Requires api.js and script.js.
   ========================================================================== */

const teacherForm = document.getElementById("teacherForm");
const closeTeacherForm = document.getElementById("closeTeacherForm");
const cancelTeacherForm = document.getElementById("cancelTeacherForm");

const params = new URLSearchParams(window.location.search);
const teacherId = params.get("teacher_id");

function getApiBase() {
    return (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

function validTeacherId(id) {
    return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
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

function setFieldValue(id, value) {
    const field = document.getElementById(id);

    if (field) {
        field.value =
            value === null || value === undefined ? "" : String(value);
    }
}

function getFieldValue(id) {
    const field = document.getElementById(id);

    if (!field) {
        throw new Error(`Required form field is missing: ${id}`);
    }

    return field.value.trim();
}

async function loadTeacher() {
    if (!validTeacherId(teacherId)) {
        alert("A valid teacher ID was not provided.");
        goToTeachers();
        return;
    }

    if (typeof window.authenticatedFetch !== "function") {
        alert("Authentication helper is unavailable. Check api.js.");
        return;
    }

    try {
        const response = await window.authenticatedFetch(
            `${getApiBase()}/teachers/details?teacher_id=${encodeURIComponent(teacherId)}`
        );

        if (!response.ok) {
            throw new Error(`Failed to load teacher (HTTP ${response.status}).`);
        }

        const teacher = await response.json();

        if (!teacher || typeof teacher !== "object" || Array.isArray(teacher)) {
            throw new Error("Unexpected teacher API response.");
        }

        const fields = {
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

        Object.entries(fields).forEach(([id, value]) => {
            setFieldValue(id, value);
        });
    } catch (error) {
        console.error("Error loading teacher:", error);
        alert("Unable to load teacher details. Check your session and backend connection.");
    }
}

if (teacherForm) {
    teacherForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!validTeacherId(teacherId)) {
            alert("A valid teacher ID was not provided.");
            return;
        }

        if (!teacherForm.reportValidity()) return;

        let teacherData;

        try {
            const clValue = getFieldValue("cl");

            if (clValue === "" || !Number.isFinite(Number(clValue)) || Number(clValue) < 0) {
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
                `${getApiBase()}/teachers/${encodeURIComponent(teacherId)}`,
                {
                    method: "PUT",
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
                        : `Failed to update teacher (HTTP ${response.status}).`
                );
                return;
            }

            alert("Teacher updated successfully!");
            goToTeachers();
        } catch (error) {
            console.error("Error updating teacher:", error);
            alert("Unable to update teacher. Check your session and backend connection.");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
} else {
    console.error("Teacher form was not found on this page.");
}

loadTeacher();
