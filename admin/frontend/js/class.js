
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const [resStudents, resSubjects] = await Promise.all([
            authenticatedFetch(`${window.API_BASE_URL}/students`),
            authenticatedFetch(`${window.API_BASE_URL}/subjects`)
        ]);

        if (!resStudents.ok || !resSubjects.ok) {
            throw new Error("Failed to load class statistics.");
        }

        const [students, subjects] = await Promise.all([
            resStudents.json(),
            resSubjects.json()
        ]);

        if (!Array.isArray(students) || !Array.isArray(subjects)) {
            throw new Error("Invalid API response.");
        }

        // Count students and collect sections per class
        const counts = Object.create(null);
        const sections = Object.create(null);

        students.forEach(student => {
            const cls = String(student.class ?? "").trim().toUpperCase();
            if (!cls) return;

            counts[cls] = (counts[cls] || 0) + 1;

            if (!sections[cls]) {
                sections[cls] = new Set();
            }

            if (student.section != null && String(student.section).trim()) {
                sections[cls].add(String(student.section).trim());
            }
        });

        // Count subjects per class
        const subjectCounts = Object.create(null);

        subjects.forEach(subject => {
            const cls = String(subject.class_name ?? "")
                .trim()
                .toUpperCase()
                .replace(/^CLASS\s+/, "");

            if (!cls) return;

            subjectCounts[cls] = (subjectCounts[cls] || 0) + 1;
        });

        // Update rows in class-table
        const rows = document.querySelectorAll(".class-table tbody tr");

        rows.forEach(row => {
            const link = row.querySelector(".class-name-link strong");
            if (!link) return;

            const text = link.textContent.trim().toUpperCase();

            // Match class names consistently
            let key = text.replace(/^CLASS\s+/, "");

            if (key === "NURSERY") key = "NUR";
            if (key === "KIDS CARE") key = "KIDSCARE";

            const count = counts[key] || 0;
            const secSet = sections[key];
            const subCount = subjectCounts[key] || 0;

            const cells = row.querySelectorAll("td");
            if (cells.length < 4) return;

            // Section count
            const sectionValue = document.createElement("span");
            sectionValue.className = "table-value";
            sectionValue.textContent = secSet && secSet.size > 0
                ? `${secSet.size} (${Array.from(secSet).sort().join(", ")})`
                : "—";
            cells[1].replaceChildren(sectionValue);

            // Student count
            const studentValue = document.createElement("span");
            studentValue.className = "table-value";

            if (count > 0) {
                const strong = document.createElement("strong");
                strong.textContent = String(count);
                studentValue.append(strong, document.createTextNode(" students"));
            } else {
                studentValue.textContent = "0 students";
            }

            cells[2].replaceChildren(studentValue);

            // Number of subjects
            const subjectValue = document.createElement("span");
            subjectValue.className = "table-value";

            if (subCount > 0) {
                const strong = document.createElement("strong");
                strong.textContent = String(subCount);
                subjectValue.append(
                    strong,
                    document.createTextNode(
                        ` subject${subCount === 1 ? "" : "s"}`
                    )
                );
            } else {
                subjectValue.textContent = "0 subjects";
            }

            cells[3].replaceChildren(subjectValue);
        });
    } catch (error) {
        console.warn("Could not populate dynamic class statistics:", error);
    }
});
