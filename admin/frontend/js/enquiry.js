
document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("enquiryForm");
    const status = document.getElementById("formStatus");
    const year = document.getElementById("year");
    const dob = document.getElementById("dob");

    if (year) {
        year.textContent = new Date().getFullYear();
    }

    // Prevent selecting a future date of birth.
    if (dob) {
        dob.max = new Date().toISOString().split("T")[0];
    }

    form?.addEventListener("submit", event => {
        event.preventDefault();

        if (!form.reportValidity()) return;

        const phone = document.getElementById("phone").value.trim();

        if (!/^[6-9]\d{9}$/.test(phone)) {
            status.textContent = "Please enter a valid 10-digit Indian mobile number.";
            status.style.color = "#ff9999";
            return;
        }

        const formData = new FormData(form);

        const enquiry = {
            parentName: formData.get("parentName").trim(),
            phone: phone,
            email: formData.get("email").trim(),
            childName: formData.get("childName").trim(),
            dob: formData.get("dob"),
            classApplying: formData.get("classApplying"),
            previousSchool: formData.get("previousSchool").trim(),
            message: formData.get("message").trim()
        };

        // Frontend-only stage: no database or email submission yet.
        console.log("Admission enquiry preview:", enquiry);

        status.textContent =
            "The form is ready. Enquiry submission will be enabled when the school backend is connected.";

        status.style.color = "#e6c98c";
    });

});
