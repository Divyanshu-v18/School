
"use strict";

const FEATURES = {
    exams: true,
    students: true,
    teachers: true,
    classes: true,
    subjects: true,
    attendance: true,
    fees: false,
    assignments: true,
    notices: true,
    timetable: true,
    library: false,
    transport: true,
    calendar: true
};

const FEATURE_LINKS = {
    exams: "exam.html",
    students: "student.html",
    teachers: "teacher.html",
    classes: "class.html",
    subjects: "subject.html",
    attendance: "attendance.html",
    fees: "fees.html",
    assignments: "assignment.html",
    notices: "notice.html",
    timetable: "timetable.html",
    library: "library.html",
    transport: "transport.html",
    calendar: "calendar.html"
};

document.addEventListener("DOMContentLoaded", () => {
    const links = document.querySelectorAll(
        ".navigation a.nav-item"
    );

    links.forEach(link => {
        const href = link.getAttribute("href");
        if (!href) return;

        let filename;

        try {
            filename = new URL(href, window.location.href)
                .pathname.split("/")
                .pop()
                .toLowerCase();
        } catch {
            return;
        }

        for (const [feature, page] of Object.entries(FEATURE_LINKS)) {
            if (filename === page && FEATURES[feature] === false) {
                link.hidden = true;
                break;
            }
        }
    });
});
