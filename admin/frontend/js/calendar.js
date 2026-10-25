
/* ==========================================================================
   SCHOOL CALENDAR
   Safe event rendering, creation, navigation, and deletion.
   Requires api.js with authenticatedFetch().
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    let allEvents = [];
    let currentDate = new Date();

    const $ = (id) => document.getElementById(id);
    const monthYearTitle = $("currentMonthYear");
    const prevMonthBtn = $("prevMonthBtn");
    const nextMonthBtn = $("nextMonthBtn");
    const daysGrid = $("daysGrid");
    const eventsList = $("calendarEventsList");
    const eventCountBadge = $("eventCountBadge");
    const modal = $("addEventModal");
    const openBtn = $("openAddEventBtn");
    const closeBtn = $("closeAddEventBtn");
    const cancelBtn = $("cancelAddEventBtn");
    const form = $("addEventForm");

    const apiBase = () =>
        (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    const months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];

    function request(url, options) {
        if (typeof window.authenticatedFetch !== "function") {
            throw new Error("Authentication helper unavailable. Check api.js.");
        }
        return window.authenticatedFetch(url, options);
    }

    function validId(id) {
        return /^\d+$/.test(String(id ?? "")) && Number(id) > 0;
    }

    function validDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
        const date = new Date(`${value}T00:00:00`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }

    async function loadEvents() {
        try {
            const response = await request(`${apiBase()}/calendar/events`);
            if (!response.ok) throw new Error(`Failed to load events (HTTP ${response.status}).`);
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error("Unexpected calendar response.");
            allEvents = data;
            renderCalendar();
            renderEventsList();
        } catch (error) {
            console.error("Calendar load error:", error);
            if (eventsList) {
                eventsList.replaceChildren();
                const message = document.createElement("p");
                message.className = "muted-loading";
                message.textContent = "Failed to load calendar events.";
                eventsList.appendChild(message);
            }
        }
    }

    function eventIsOnDate(event, date) {
        if (!validDate(event.event_date)) return false;
        const end = validDate(event.end_date) ? event.end_date : event.event_date;
        return date >= event.event_date && date <= end;
    }

    function renderCalendar() {
        if (!daysGrid || !monthYearTitle) return;

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        monthYearTitle.textContent = `${months[month]} ${year}`;
        daysGrid.replaceChildren();

        const firstDay = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        const previousMonthDays = new Date(year, month, 0).getDate();
        const today = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })();

        function addDay(day, date, otherMonth = false) {
            const cell = document.createElement("div");
            cell.className = `cal-day-cell${otherMonth ? " other-month" : ""}`;
            if (date === today) cell.classList.add("today");
            if (date) cell.dataset.date = date;

            const number = document.createElement("span");
            number.className = "day-number";
            number.textContent = String(day);
            cell.appendChild(number);

            if (!otherMonth && date) {
                const container = document.createElement("div");
                container.className = "event-dot-container";
                const dayEvents = allEvents.filter((event) => eventIsOnDate(event, date));

                dayEvents.slice(0, 2).forEach((event) => {
                    const pill = document.createElement("span");
                    const type = String(event.event_type || "event").toLowerCase();
                    pill.className = `event-dot-pill dot-${/^[a-z0-9_-]+$/.test(type) ? type : "event"}`;
                    pill.textContent = String(event.title || "Untitled event");
                    pill.title = pill.textContent;
                    container.appendChild(pill);
                });

                if (dayEvents.length > 2) {
                    const more = document.createElement("span");
                    more.style.fontSize = "9px";
                    more.style.color = "#888";
                    more.textContent = `+${dayEvents.length - 2} more`;
                    container.appendChild(more);
                }

                cell.appendChild(container);
            }

            daysGrid.appendChild(cell);
        }

        for (let i = firstDay - 1; i >= 0; i--) {
            addDay(previousMonthDays - i, null, true);
        }

        for (let day = 1; day <= totalDays; day++) {
            const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            addDay(day, date);
        }

        const remainder = (7 - (firstDay + totalDays) % 7) % 7;
        for (let day = 1; day <= remainder; day++) addDay(day, null, true);
    }

    function renderEventsList() {
        if (!eventsList) return;
        eventsList.replaceChildren();
        if (eventCountBadge) eventCountBadge.textContent = `${allEvents.length} Events`;

        if (!allEvents.length) {
            const message = document.createElement("p");
            message.className = "muted-loading";
            message.textContent = "No events on record.";
            eventsList.appendChild(message);
            return;
        }

        allEvents.forEach((event) => {
            const card = document.createElement("div");
            const rawType = String(event.event_type || "Event");
            const safeType = /^[a-z0-9_-]+$/i.test(rawType) ? rawType.toLowerCase() : "event";
            card.className = `event-card-item ${safeType}`;

            const top = document.createElement("div");
            top.className = "event-card-top";

            const title = document.createElement("span");
            title.className = "event-card-title";
            title.textContent = String(event.title || "Untitled event");

            const badge = document.createElement("span");
            badge.className = `badge-cat ${safeType}`;
            badge.textContent = rawType;

            top.append(title, badge);
            card.appendChild(top);

            const date = document.createElement("span");
            date.className = "event-card-date";
            const dateRange = event.end_date && event.end_date !== event.event_date
                ? `${event.event_date} to ${event.end_date}`
                : event.event_date || "Date not set";
            date.textContent = `📅 ${dateRange}`;
            card.appendChild(date);

            if (event.description) {
                const description = document.createElement("p");
                description.className = "event-card-desc";
                description.textContent = String(event.description);
                card.appendChild(description);
            }

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "delete-event-btn";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", () => deleteEvent(event.event_id));
            card.appendChild(deleteBtn);
            eventsList.appendChild(card);
        });
    }

    prevMonthBtn?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    nextMonthBtn?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    openBtn?.addEventListener("click", () => {
        form?.reset();
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

        const payload = {
            title: $("evtTitle")?.value.trim() || "",
            event_type: $("evtType")?.value || "",
            event_date: $("evtDate")?.value || "",
            end_date: $("evtEndDate")?.value || null,
            description: $("evtDesc")?.value.trim() || null
        };

        if (!payload.title || !validDate(payload.event_date) ||
            (payload.end_date && !validDate(payload.end_date)) ||
            (payload.end_date && payload.end_date < payload.event_date)) {
            alert("Please enter a title and valid event date range.");
            return;
        }

        const submit = form.querySelector('button[type="submit"], input[type="submit"]');
        if (submit) submit.disabled = true;

        try {
            const response = await request(`${apiBase()}/calendar/events`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                let message = `Failed to save event (HTTP ${response.status}).`;
                try {
                    const result = await response.json();
                    if (typeof result.detail === "string") message = result.detail;
                } catch (_) {}
                throw new Error(message);
            }
            closeModal();
            await loadEvents();
        } catch (error) {
            alert(`Unable to save event: ${error.message}`);
        } finally {
            if (submit) submit.disabled = false;
        }
    });

    async function deleteEvent(id) {
        if (!validId(id)) return alert("Invalid event ID.");
        if (!confirm("Are you sure you want to remove this calendar event?")) return;

        try {
            const response = await request(`${apiBase()}/calendar/events/${encodeURIComponent(id)}`, {
                method: "DELETE"
            });
            if (!response.ok) {
                let msg = `Failed to delete event (HTTP ${response.status}).`;
                try {
                    const result = await response.json();
                    if (typeof result.detail === "string") msg = result.detail;
                } catch (_) {}
                throw new Error(msg);
            }
            await loadEvents();
        } catch (error) {
            alert(`Unable to delete event: ${error.message}`);
        }
    }

    window.deleteEvent = deleteEvent;
    loadEvents();
});
