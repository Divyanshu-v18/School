
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const form = document.getElementById("schoolSettingsForm");
    const saveBtn = document.getElementById("saveAllSettingsBtn");

    const elSchoolName = document.getElementById("setSchoolName");
    const elPrincipal = document.getElementById("setPrincipal");
    const elAcademicYear = document.getElementById("setAcademicYear");
    const elAffiliation = document.getElementById("setAffiliation");
    const elEmail = document.getElementById("setEmail");
    const elPhone = document.getElementById("setPhone");
    const elAddress = document.getElementById("setAddress");
    const elCurrency = document.getElementById("setCurrency");
    const elCutoff = document.getElementById("setCutoff");

    const DEFAULTS = {
        school_name: "Sunrise International Academy",
        principal_name: "Dr. Rajesh Sharma",
        academic_year: "2026-2027",
        school_email: "admin@sunriseacademy.edu",
        school_phone: "+91 98765 43210",
        school_address: "123 Education Lane, Knowledge Park, City",
        affiliation: "",
        currency: "₹ (INR)",
        cutoff_time: "09:00"
    };

    function getErrorMessage(data, fallback) {
        if (typeof data?.detail === "string") return data.detail;
        if (typeof data?.message === "string") return data.message;
        return fallback;
    }

    async function readResponse(res, fallback) {
        let data = {};

        try {
            data = await res.json();
        } catch {
            // Some responses may not contain JSON.
        }

        if (!res.ok) {
            throw new Error(getErrorMessage(data, fallback));
        }

        return data;
    }

    async function loadSettings() {
        try {
            const res = await authenticatedFetch(
                `${window.API_BASE_URL}/settings`
            );

            const data = await readResponse(
                res,
                "Failed to load settings."
            );

            if (elSchoolName) {
                elSchoolName.value = data.school_name ?? DEFAULTS.school_name;
            }
            if (elPrincipal) {
                elPrincipal.value = data.principal_name ?? DEFAULTS.principal_name;
            }
            if (elAcademicYear) {
                elAcademicYear.value = data.academic_year ?? DEFAULTS.academic_year;
            }
            if (elEmail) {
                elEmail.value = data.school_email ?? DEFAULTS.school_email;
            }
            if (elPhone) {
                elPhone.value = data.school_phone ?? DEFAULTS.school_phone;
            }
            if (elAddress) {
                elAddress.value = data.school_address ?? DEFAULTS.school_address;
            }
            if (elAffiliation) {
                elAffiliation.value = data.affiliation ?? DEFAULTS.affiliation;
            }
            if (elCurrency) {
                elCurrency.value = data.currency ?? DEFAULTS.currency;
            }
            if (elCutoff) {
                elCutoff.value = data.cutoff_time ?? DEFAULTS.cutoff_time;
            }
        } catch (err) {
            console.error("Error loading settings:", err);
            alert(
                "Could not load school settings. Check your connection and try again."
            );
        }
    }

    async function saveSettings(event) {
        event.preventDefault();

        if (saveBtn?.disabled) return;

        const payload = {
            school_name: elSchoolName?.value.trim() || "",
            principal_name: elPrincipal?.value.trim() || "",
            academic_year: elAcademicYear?.value.trim() || "",
            school_email: elEmail?.value.trim() || "",
            school_phone: elPhone?.value.trim() || "",
            school_address: elAddress?.value.trim() || "",
            affiliation: elAffiliation?.value.trim() || "",
            currency: elCurrency?.value.trim() || DEFAULTS.currency,
            cutoff_time: elCutoff?.value || DEFAULTS.cutoff_time
        };

        if (!payload.school_name || !payload.principal_name ||
            !payload.academic_year || !payload.school_address) {
            alert("Please complete the school name, principal, academic year, and address.");
            return;
        }

        if (payload.school_email &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.school_email)) {
            alert("Please enter a valid school email address.");
            elEmail?.focus();
            return;
        }

        if (payload.cutoff_time &&
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.cutoff_time)) {
            alert("Please enter a valid cutoff time.");
            elCutoff?.focus();
            return;
        }

        const previousText = saveBtn?.textContent || "Save Changes";

        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = "Saving...";
            }

            const res = await authenticatedFetch(
                `${window.API_BASE_URL}/settings`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            );

            await readResponse(res, "Failed to save settings.");
            alert("School and system settings updated successfully!");
        } catch (err) {
            console.error("Error saving settings:", err);
            alert("Could not save settings: " + err.message);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = previousText;
            }
        }
    }

    if (form) {
        form.addEventListener("submit", saveSettings);
    }

    if (saveBtn && !form) {
        saveBtn.addEventListener("click", saveSettings);
    }

    loadSettings();
});
