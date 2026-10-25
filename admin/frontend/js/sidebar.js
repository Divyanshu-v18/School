
/* ==========================================================================
   SHARED SIDEBAR COMPONENT
   ========================================================================== */

(function () {
    "use strict";

    const NAV_LINKS = [
        { href: "dashboard.html", icon: "⌂", label: "Dashboard" },
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
        "dashboard.html": ["admin"], "student.html": ["admin", "teacher", "staff"],
        "teacher.html": ["admin", "teacher", "staff"], "subject.html": ["admin", "teacher", "staff"],
        "attendance.html": ["admin", "teacher"], "fees.html": ["admin", "staff"],
        "exam.html": ["admin", "teacher"], "notice.html": ["admin", "teacher", "staff"],
        "timetable.html": ["admin", "teacher", "staff"], "transport.html": ["admin", "staff"],
        "calendar.html": ["admin", "teacher", "staff"], "settings.html": ["admin"]
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
            const rawSession = sessionStorage.getItem("abc_school_session");
            if (!rawSession) return fallback;

            const sessionData = JSON.parse(rawSession);
            const user = sessionData?.user;

            if (!user || typeof user !== "object") return fallback;

            const name =
                typeof user.name === "string" && user.name.trim()
                    ? user.name.trim()
                    : typeof user.username === "string" && user.username.trim()
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

        if (className) element.className = className;
        if (text !== undefined) element.textContent = String(text);

        return element;
    }

    function buildSidebar() {
        const activePage = getActivePage();
        const session = getSessionDisplay();

        const aside = createElement("aside", "sidebar");

        const brand = createElement("div", "admin-brand");
        brand.appendChild(createElement("div", "brand-icon", "A"));

        const brandInfo = createElement("div", "brand-info");
        brandInfo.appendChild(createElement("h2", "", "Admin"));
        brand.appendChild(brandInfo);
        aside.appendChild(brand);

        const navigation = createElement("nav", "navigation");

        const currentRole = session.role.toLowerCase();
        NAV_LINKS.forEach(link => {
            if (!(PAGE_ROLES[link.href] || ["admin"]).includes(currentRole)) return;
            const anchor = document.createElement("a");
            anchor.href = link.href;
            anchor.className =
                "nav-item" + (link.href === activePage ? " active" : "");

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

        const logoutButton = createElement("button", "logout-btn", "↪");
        logoutButton.type = "button";
        logoutButton.id = "logoutBtn";
        logoutButton.title = "Logout from portal";
        logoutButton.setAttribute("aria-label", "Logout");

        profile.appendChild(logoutButton);
        bottom.appendChild(profile);
        aside.appendChild(bottom);

        return aside;
    }

    function injectSidebar() {
        const layout = document.querySelector(".page-layout");
        if (!layout || layout.querySelector("aside.sidebar")) return;

        layout.prepend(buildSidebar());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectSidebar, {
            once: true
        });
    } else {
        injectSidebar();
    }
})();
