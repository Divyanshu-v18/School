
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* ========================================
       AUTHENTICATED API REQUESTS
    ======================================== */

    function getAdminSession() {
        try {
            const session = JSON.parse(
                sessionStorage.getItem("abc_school_session") || "null"
            );

            if (
                !session ||
                !session.authenticated ||
                !session.user ||
                session.user.role !== "admin"
            ) {
                return null;
            }

            return session;
        } catch (error) {
            console.error("Unable to read Admin session:", error);
            return null;
        }
    }

    async function authenticatedFetch(url, options = {}) {
        if (typeof window.authenticatedFetch === "function") {
            return window.authenticatedFetch(url, options);
        }

        const headers = new Headers(options.headers || {});

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: "include"
        });

        if (response.status === 401) {
            sessionStorage.removeItem("abc_school_session");
            window.location.href = "login.html";
            throw new Error("Admin session expired or invalid.");
        }

        return response;
    }

    function getApiBase() {
        return window.API_BASE_URL || "http://127.0.0.1:8000";
    }

    /* ========================================
       SAFE DISPLAY HELPERS
    ======================================== */

    function escapeHtml(value) {
        if (value === null || value === undefined) return "";

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Only allow known CSS class suffixes from API data.
    function safeCategory(value) {
        const allowed = [
            "general",
            "academic",
            "event",
            "urgent",
            "holiday"
        ];

        const normalized = String(value || "general").toLowerCase();

        return allowed.includes(normalized) ? normalized : "general";
    }

    function safeEventType(value) {
        const allowed = [
            "event",
            "academic",
            "holiday",
            "exam",
            "meeting"
        ];

        const normalized = String(value || "event").toLowerCase();

        return allowed.includes(normalized) ? normalized : "event";
    }

    function setMessage(element, message) {
        if (!element) return;

        const paragraph = document.createElement("p");
        paragraph.className = "muted-loading";
        paragraph.textContent = message;

        element.replaceChildren(paragraph);
    }

    /* ========================================
       LOAD DASHBOARD DATA
    ======================================== */

    async function loadDashboardStats() {
        try {
            const response = await authenticatedFetch(
                `${getApiBase()}/admin/dashboard-stats`
            );

            if (!response.ok) {
                throw new Error(
                    `Dashboard request failed: HTTP ${response.status}`
                );
            }

            const data = await response.json();

            // Top statistics
            const elStudents = document.getElementById("statStudents");
            const elTeachers = document.getElementById("statTeachers");
            const elClasses = document.getElementById("statClasses");
            const elFees = document.getElementById("statFees");

            if (elStudents) {
                elStudents.textContent = data.total_students ?? 0;
            }

            if (elTeachers) {
                elTeachers.textContent = data.total_teachers ?? 0;
            }

            if (elClasses) {
                elClasses.textContent = data.total_classes ?? 0;
            }

            if (elFees) {
                const totalFees = Number(data.total_fees_collected ?? 0);

                elFees.textContent = Number.isFinite(totalFees)
                    ? "₹" + totalFees.toLocaleString("en-IN")
                    : "₹0";
            }

            // Today's attendance
            const attendance = data.attendance_today || {
                Present: 0,
                Absent: 0,
                Late: 0
            };

            const elPresent = document.getElementById("attPresent");
            const elAbsent = document.getElementById("attAbsent");
            const elLate = document.getElementById("attLate");

            if (elPresent) {
                elPresent.textContent = attendance.Present ?? 0;
            }

            if (elAbsent) {
                elAbsent.textContent = attendance.Absent ?? 0;
            }

            if (elLate) {
                elLate.textContent = attendance.Late ?? 0;
            }

            // Recent notices
            const noticesList = document.getElementById("noticesList");

            if (noticesList) {
                const notices = Array.isArray(data.recent_notices)
                    ? data.recent_notices.slice(0, 4)
                    : [];

                if (notices.length === 0) {
                    setMessage(noticesList, "No active notices.");
                } else {
                    noticesList.innerHTML = notices.map(notice => {
                        const category = safeCategory(notice.category);
                        const content = String(notice.content || "");
                        const shortContent = content.substring(0, 75);

                        return `
                            <div class="widget-item ${category}">
                                <div class="item-left">
                                    <span class="item-title">${escapeHtml(notice.title)}</span>
                                    <span class="item-meta">${escapeHtml(shortContent)}${content.length > 75 ? "..." : ""}</span>
                                </div>
                                <span class="item-badge badge-${category}">${escapeHtml(notice.category || "General")}</span>
                            </div>
                        `;
                    }).join("");
                }
            }

            // Upcoming calendar events
            const eventsList = document.getElementById("eventsList");

            if (eventsList) {
                const events = Array.isArray(data.upcoming_events)
                    ? data.upcoming_events.slice(0, 4)
                    : [];

                if (events.length === 0) {
                    setMessage(eventsList, "No upcoming calendar events.");
                } else {
                    eventsList.innerHTML = events.map(event => {
                        const eventType = safeEventType(event.event_type);

                        const endDate =
                            event.end_date &&
                            event.end_date !== event.event_date
                                ? ` to ${escapeHtml(event.end_date)}`
                                : "";

                        return `
                            <div class="widget-item event">
                                <div class="item-left">
                                    <span class="item-title">${escapeHtml(event.title)}</span>
                                    <span class="item-meta">📅 ${escapeHtml(event.event_date)}${endDate}</span>
                                </div>
                                <span class="item-badge badge-${eventType}">${escapeHtml(event.event_type || "Event")}</span>
                            </div>
                        `;
                    }).join("");
                }
            }

            // Upcoming exams
            await loadUpcomingExams();

        } catch (error) {
            console.error("Error loading dashboard stats:", error);
        }
    }

    /* ========================================
       LOAD UPCOMING EXAMS
    ======================================== */

    async function loadUpcomingExams() {
        const examsList = document.getElementById("upcomingExamsList");

        if (!examsList) return;

        try {
            const response = await authenticatedFetch(
                `${getApiBase()}/exams`
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to load exams: HTTP ${response.status}`
                );
            }

            const exams = await response.json();

            if (!Array.isArray(exams) || exams.length === 0) {
                setMessage(examsList, "No scheduled exams found.");
                return;
            }

            examsList.innerHTML = exams.slice(0, 4).map(exam => `
                <div class="widget-item academic">
                    <div class="item-left">
                        <span class="item-title">${escapeHtml(exam.exam_name)} - ${escapeHtml(exam.subject)}</span>
                        <span class="item-meta">Class: ${escapeHtml(exam.class_name)} | Max Marks: ${escapeHtml(exam.max_marks)}</span>
                    </div>
                    <span class="item-badge badge-exam">${escapeHtml(exam.exam_date)}</span>
                </div>
            `).join("");

        } catch (error) {
            console.error("Error loading upcoming exams:", error);

            if (getAdminSession()) {
                setMessage(examsList, "Could not load exams list.");
            }
        }
    }

    /* ========================================
       INITIAL DASHBOARD LOAD
    ======================================== */

    loadDashboardStats();

    /* ========================================
       NOTIFICATION
    ======================================== */

    const notificationBtn = document.getElementById("notificationBtn");

    if (notificationBtn) {
        notificationBtn.addEventListener("click", () => {
            alert(
                "Latest updates and announcements are loaded on the notice board."
            );
        });
    }
});
