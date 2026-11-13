
/* ==========================================================================
   SHARED SIDEBAR COMPONENT
   ========================================================================== */

(function () {
    "use strict";

    const NAV_LINKS = [
        { href: "dashboard.html", icon: "⌂", label: "Dashboard" },
        { href: "registration.html", icon: "＋", label: "Registration" },
        { href: "student.html", icon: "♙", label: "Students" },
        { href: "teacher.html", icon: "♟", label: "Teachers" },
        { href: "class.html", icon: "▤", label: "Classes" },
        { href: "subject.html", icon: "▣", label: "Subjects" },
        { href: "attendance.html", icon: "✓", label: "Attendance" },
        { href: "fees.html", icon: "₹", label: "Fees" },
        { href: "exam.html", icon: "◫", label: "Exams" },
        { href: "assignment.html", icon: "□", label: "Assignments" },
        { href: "notice.html", icon: "▱", label: "Notices" },
        { href: "timetable.html", icon: "▦", label: "Timetable" },
        { href: "library.html", icon: "📚", label: "Library" },
        { href: "transport.html", icon: "🚌", label: "Transport" },
        { href: "calendar.html", icon: "📅", label: "Calendar" },
        { href: "settings.html", icon: "⚙", label: "Settings" },
        { href: "help.html", icon: "?", label: "Help" }
    ];

    const PAGE_ROLES = {
        "dashboard.html": ["admin"],
        "registration.html": ["admin", "staff"],
        "student.html": ["admin", "teacher", "staff"],
        "teacher.html": ["admin", "teacher", "staff"],
        "subject.html": ["admin", "teacher", "staff"],
        "attendance.html": ["admin", "teacher"],
        "fees.html": ["admin", "staff"],
        "exam.html": ["admin", "teacher"],
        "notice.html": ["admin", "teacher", "staff"],
        "timetable.html": ["admin", "teacher", "staff"],
        "transport.html": ["admin", "staff"],
        "calendar.html": ["admin", "teacher", "staff"],
        "settings.html": ["admin"]
    };

    const SUB_PAGE_MAP = {
        "add_student.html": "student.html",
        "edit_student.html": "student.html",
        "student_details.html": "student.html",
        "add_teacher.html": "teacher.html",
        "edit_teacher.html": "teacher.html",
        "teacher_details.html": "teacher.html",
        "class_details.html": "class.html",
        "section_details.html": "class.html"
    };

    function getActivePage() {
        const filename = window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();

        return SUB_PAGE_MAP[filename] || filename;
    }

    function getSessionDisplay() {
        const fallback = {
            name: "Admin",
            role: "Administrator",
            avatar: "AS"
        };

        try {
            const rawSession = sessionStorage.getItem(
                "abc_school_session"
            );

            if (!rawSession) return fallback;

            const sessionData = JSON.parse(rawSession);
            const user = sessionData?.user;

            if (!user || typeof user !== "object") {
                return fallback;
            }

            const name =
                typeof user.name === "string" && user.name.trim()
                    ? user.name.trim()
                    : typeof user.username === "string" &&
                      user.username.trim()
                        ? user.username.trim()
                        : "Admin";

            const role =
                typeof user.role === "string" && user.role.trim()
                    ? user.role.trim().charAt(0).toUpperCase() +
                      user.role.trim().slice(1)
                    : "Administrator";

            const initials = name
                .split(/\s+/)
                .filter(Boolean)
                .map(part => part.charAt(0))
                .join("")
                .slice(0, 2)
                .toUpperCase();

            const avatar =
                typeof user.avatar === "string" &&
                user.avatar.trim() &&
                user.avatar.length <= 10
                    ? user.avatar.trim()
                    : initials || "AS";

            return { name, role, avatar };

        } catch {
            return fallback;
        }
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined) {
            element.textContent = String(text);
        }

        return element;
    }

    function buildSidebar() {
        const activePage = getActivePage();
        const session = getSessionDisplay();

        const aside = createElement("aside", "sidebar");

        // Brand
        const brand = createElement("div", "admin-brand");

        brand.appendChild(
            createElement("div", "brand-icon", "A")
        );

        const brandInfo = createElement("div", "brand-info");

        brandInfo.appendChild(
            createElement("h2", "", "Admin")
        );

        brand.appendChild(brandInfo);
        aside.appendChild(brand);

        // Navigation
        const navigation = createElement("nav", "navigation");

        const currentRole = session.role.toLowerCase();

        NAV_LINKS.forEach(link => {
            if (!(PAGE_ROLES[link.href] || ["admin"]).includes(currentRole)) return;

            // Preserve role-based navigation permissions.
            if (
                !(PAGE_ROLES[link.href] || ["admin"])
                    .includes(currentRole)
            ) {
                return;
            }

            const anchor = document.createElement("a");

            anchor.href = link.href;

            anchor.className =
                "nav-item" +
                (link.href === activePage ? " active" : "");

            if (link.href === activePage) {
                anchor.setAttribute("aria-current", "page");
            }

            anchor.appendChild(
                createElement("span", "nav-icon", link.icon)
            );

            anchor.appendChild(
                createElement("span", "", link.label)
            );

            navigation.appendChild(anchor);
        });

        aside.appendChild(navigation);

        // Profile and logout section
        const bottom = createElement("div", "sidebar-bottom");

        const profile = createElement("div", "sidebar-profile");

        profile.appendChild(
            createElement("div", "profile-avatar", session.avatar)
        );

        const profileInfo = createElement("div", "profile-info");

        profileInfo.appendChild(
            createElement("strong", "", session.name)
        );

        profileInfo.appendChild(
            createElement("span", "", session.role)
        );

        profile.appendChild(profileInfo);

        const logoutButton = createElement(
            "button",
            "logout-btn",
            "↪"
        );

        logoutButton.type = "button";
        logoutButton.id = "logoutBtn";
        logoutButton.title = "Logout from portal";

        logoutButton.setAttribute(
            "aria-label",
            "Logout"
        );

        profile.appendChild(logoutButton);

        bottom.appendChild(profile);
        aside.appendChild(bottom);

        return aside;
    }

    function getStoredAcademicYear() {
        const stored = localStorage.getItem("school_academic_year");
        if (stored && /^\d{4}-\d{4}$/.test(stored.trim())) {
            return stored.trim();
        }
        const now = new Date();
        const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        return `${start}-${start + 1}`;
    }

    function injectAcademicYearBadge() {
        const topbarActions = document.querySelector(".topbar-actions");
        if (!topbarActions || document.getElementById("topbarAcademicYear")) {
            return;
        }

        const badge = document.createElement("div");
        badge.className = "topbar-academic-year";
        badge.id = "topbarAcademicYear";
        badge.title = "Active Academic Year";

        const icon = document.createElement("span");
        icon.className = "ay-icon";
        icon.textContent = "📅";

        const text = document.createElement("span");
        text.className = "ay-text";
        text.id = "topbarAyText";
        text.textContent = `AY ${getStoredAcademicYear()}`;

        badge.appendChild(icon);
        badge.appendChild(text);

        topbarActions.prepend(badge);

        if (!localStorage.getItem("school_academic_year")) {
            const apiBase = (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
            fetch(`${apiBase}/settings`)
                .then(r => r.ok ? r.json() : null)
                .then(settings => {
                    if (settings && settings.academic_year) {
                        localStorage.setItem("school_academic_year", settings.academic_year);
                        const el = document.getElementById("topbarAyText");
                        if (el) el.textContent = `AY ${settings.academic_year}`;
                    }
                })
                .catch(() => {});
        }
    }

    window.addEventListener("academicYearChanged", (e) => {
        const ay = e?.detail?.academic_year;
        const el = document.getElementById("topbarAyText");
        if (el && ay) el.textContent = `AY ${ay}`;
    });

    window.addEventListener("storage", (e) => {
        if (e.key === "school_academic_year" && e.newValue) {
            const el = document.getElementById("topbarAyText");
            if (el) el.textContent = `AY ${e.newValue}`;
        }
    });

    // Insert sidebar immediately without making API requests.
    function injectSidebar() {
        const layout = document.querySelector(".page-layout");

        if (!layout || layout.querySelector("aside.sidebar")) {
            return;
        }

        const sidebar = buildSidebar();

        layout.prepend(sidebar);
    }

    function initComponents() {
        injectSidebar();
        injectAcademicYearBadge();
    }

    // Initialize sidebar and components.
    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initComponents,
            { once: true }
        );
    } else {
        initComponents();
    }

})();
