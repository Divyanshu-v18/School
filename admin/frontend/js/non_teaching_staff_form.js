
document.addEventListener("DOMContentLoaded", function () {

    const staffForm = document.getElementById("staffForm");

    const designation = document.getElementById("designation");
    const otherRoleGroup = document.getElementById("otherRoleGroup");
    const otherDesignation = document.getElementById("otherDesignation");


    // =====================================
    // DATE FORMAT: DD-MM-YYYY
    // =====================================

    function setupDateInput(input) {

        input.addEventListener("input", function () {

            let digits = this.value.replace(/\D/g, "").slice(0, 8);

            let formatted = digits;

            if (digits.length > 4) {
                formatted =
                    digits.slice(0, 2) + "-" +
                    digits.slice(2, 4) + "-" +
                    digits.slice(4);

            } else if (digits.length > 2) {
                formatted =
                    digits.slice(0, 2) + "-" +
                    digits.slice(2);
            }

            this.value = formatted;
            this.setCustomValidity("");

        });


        input.addEventListener("blur", function () {

            if (!this.value.trim()) {
                this.setCustomValidity("");
                return;
            }

            const match = this.value.match(
                /^(\d{2})-(\d{2})-(\d{4})$/
            );

            if (!match) {
                this.setCustomValidity(
                    "Enter date in DD-MM-YYYY format."
                );
                return;
            }

            const day = Number(match[1]);
            const month = Number(match[2]);
            const year = Number(match[3]);

            const date = new Date(year, month - 1, day);

            const isValid =
                date.getFullYear() === year &&
                date.getMonth() === month - 1 &&
                date.getDate() === day;

            if (!isValid) {
                this.setCustomValidity(
                    "Please enter a valid date."
                );
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (date > today) {
                this.setCustomValidity(
                    "Future dates are not allowed."
                );
                return;
            }

            this.setCustomValidity("");

        });

    }


    // Apply date formatting to both date fields

    document.querySelectorAll(".date-input").forEach(function (input) {
        setupDateInput(input);
    });


    // =====================================
    // OTHER JOB ROLE
    // =====================================

    designation.addEventListener("change", function () {

        const isOther = this.value === "Other";

        otherRoleGroup.hidden = !isOther;

        otherDesignation.required = isOther;

        if (!isOther) {
            otherDesignation.value = "";
        }

    });


    // =====================================
    // RESET FORM
    // =====================================

    staffForm.addEventListener("reset", function () {

        setTimeout(function () {

            otherRoleGroup.hidden = true;
            otherDesignation.required = false;

            document.querySelectorAll(".date-input").forEach(function (input) {
                input.setCustomValidity("");
            });

        }, 0);

    });


    // =====================================
    // FORM SUBMISSION
    // =====================================

    staffForm.addEventListener("submit", function (event) {

        event.preventDefault();

        if (!staffForm.checkValidity()) {
            staffForm.reportValidity();
            return;
        }

        const formData = new FormData(staffForm);

        const staffData = Object.fromEntries(formData.entries());


        // Use custom designation if Other is selected

        if (staffData.designation === "Other") {

            staffData.designation =
                staffData.other_designation.trim();

        }

        delete staffData.other_designation;


        // Convert date strings into ISO format for future backend use

        function convertDate(dateString) {

            if (!dateString) return "";

            const parts = dateString.split("-");

            return parts[2] + "-" + parts[1] + "-" + parts[0];

        }

        if (staffData.dob) {
            staffData.dob = convertDate(staffData.dob);
        }

        if (staffData.joining_date) {
            staffData.joining_date = convertDate(staffData.joining_date);
        }


        console.log(
            "Non-Teaching Staff Registration:",
            staffData
        );


        alert(
            "Form validated successfully!\n\n" +
            "Staff Name: " + staffData.full_name +
            "\nJob Role: " + staffData.designation +
            "\nDepartment: " + staffData.department +
            "\n\nDatabase integration will be added next."
        );

    });

});
