
/* ==========================================================================
   TIMETABLE MANAGEMENT
   Safe timetable rendering, filtering, slot creation, and deletion.
   Requires api.js with authenticatedFetch().
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const classSelect = $("ttClass");
    const sectionSelect = $("ttSection");
    const refreshBtn = $("refreshTtBtn");
    const tableBody = $("timetableBody");
    const modal = $("addSlotModal");
    const openBtn = $("openAddSlotBtn");
    const closeBtn = $("closeAddSlotBtn");
    const cancelBtn = $("cancelAddSlotBtn");
    const form = $("addSlotForm");

    const apiBase = () =>
        (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

    function request(url, options) {
        if (typeof window.authenticatedFetch !== "function") {
            throw new Error("Authentication helper unavailable. Check api.js.");
        }
        return window.authenticatedFetch(url, options);
    }

    function validId(id) {
        return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
    }

    function setMessage(message) {
        if (!tableBody) return;
        tableBody.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "table-loading";
        cell.textContent = message;
        row.appendChild(cell);
        tableBody.appendChild(row);
    }

    function addCell(row, text) {
        const cell = document.createElement("td");
        cell.textContent = String(text ?? "—");
        row.appendChild(cell);
        return cell;
    }

    function validTime(value) {
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
    }

    async function loadTimetable() {
        if (!tableBody) return;
        setMessage("Loading schedule...");

        const cls = classSelect?.value || "10";
        const sec = sectionSelect?.value || "A";

        try {
            const query = new URLSearchParams({
                class_name: cls,
                section: sec
            });

            const response = await request(`${apiBase()}/timetable?${query}`);
            if (!response.ok) {
                throw new Error(`Failed to load timetable (HTTP ${response.status}).`);
            }

            const slots = await response.json();
            if (!Array.isArray(slots)) throw new Error("Unexpected timetable response.");

            tableBody.replaceChildren();

            if (!slots.length) {
                setMessage(`No timetable scheduled for Class ${cls}-${sec} yet.`);
                return;
            }

            slots.forEach((slot) => {
                const row = document.createElement("tr");
                addCell(row, slot.day_of_week || "—");
                addCell(row, `#${slot.period_number ?? "—"}`);
                addCell(row, `${slot.start_time || "—"} - ${slot.end_time || "—"}`);
                const subjectCell = addCell(row, slot.subject || "—");
                const subjectStrong = document.createElement("strong");
                subjectStrong.textContent = subjectCell.textContent;
                subjectCell.replaceChildren(subjectStrong);
                addCell(row, slot.teacher_name || "Unassigned");

                const actionCell = document.createElement("td");
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "delete-btn";
                deleteBtn.textContent = "Delete";
                deleteBtn.addEventListener("click", () => deleteSlot(slot.timetable_id));
                actionCell.appendChild(deleteBtn);
                row.appendChild(actionCell);

                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error("Timetable load error:", error);
            setMessage("Unable to load the timetable. Check your session and backend connection.");
        }
    }

    openBtn?.addEventListener("click", () => {
        form?.reset();

        const slotClass = $("slotClass");
        const slotSection = $("slotSection");
        if (slotClass && classSelect) slotClass.value = classSelect.value;
        if (slotSection && sectionSelect) slotSection.value = sectionSelect.value;

        if (modal) modal.style.display = "flex";
    });

    function closeModal() {
        if (modal) modal.style.display = "none";
    }

    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const getValue = (id) => {
            const field = $(id);
            if (!field) throw new Error(`Required field is missing: ${id}`);
            return field.value.trim();
        };

        let payload;

        try {
            const periodText = getValue("slotPeriod");
            const period = Number(periodText);
            const startTime = getValue("slotStart");
            const endTime = getValue("slotEnd");

            if (!/^\d+$/.test(periodText) || !Number.isInteger(period) || period < 1) {
                alert("Enter a valid period number.");
                return;
            }

            if (!validTime(startTime) || !validTime(endTime) || startTime >= endTime) {
                alert("Enter valid start and end times. End time must be later than start time.");
                return;
            }

            payload = {
                class_name: getValue("slotClass"),
                section: getValue("slotSection"),
                day_of_week: getValue("slotDay"),
                period_number: period,
                subject: getValue("slotSubject"),
                teacher_name: getValue("slotTeacher") || null,
                start_time: startTime,
                end_time: endTime
            };

            if (!payload.subject) {
                alert("Please enter a subject.");
                return;
            }
        } catch (error) {
            alert(error.message);
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await request(`${apiBase()}/timetable`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let message = `Failed to save timetable slot (HTTP ${response.status}).`;
                try {
                    const result = await response.json();
                    if (typeof result.detail === "string") message = result.detail;
                } catch (_) {}
                throw new Error(message);
            }

            closeModal();
            await loadTimetable();
        } catch (error) {
            alert(`Unable to save timetable slot: ${error.message}`);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    async function deleteSlot(id) {
        if (!validId(id)) return alert("Invalid timetable slot ID.");
        if (!confirm("Are you sure you want to delete this period slot?")) return;

        try {
            const response = await request(
                `${apiBase()}/timetable/${encodeURIComponent(id)}`,
                { method: "DELETE" }
            );

            if (!response.ok) {
                let msg = `Failed to delete slot (HTTP ${response.status}).`;
                try {
                    const result = await response.json();
                    if (typeof result.detail === "string") msg = result.detail;
                } catch (_) {}
                throw new Error(msg);
            }

            await loadTimetable();
        } catch (error) {
            alert(`Unable to delete timetable slot: ${error.message}`);
        }
    }

    window.deleteSlot = deleteSlot;

    refreshBtn?.addEventListener("click", loadTimetable);
    classSelect?.addEventListener("change", loadTimetable);
    sectionSelect?.addEventListener("change", loadTimetable);

    loadTimetable();
});
