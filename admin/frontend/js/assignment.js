
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const modal = document.getElementById("addAssignmentModal");
    const openBtn = document.getElementById("openAddAssignmentBtn");
    const closeBtn = document.getElementById("closeAddAssignmentBtn");
    const cancelBtn = document.getElementById("cancelAddAssignmentBtn");
    const form = document.getElementById("addAssignmentForm");
    const grid = document.getElementById("assignmentsList");

    function closeModal() {
        if (modal) modal.style.display = "none";
    }

    if (openBtn) {
        openBtn.addEventListener("click", () => {
            if (form) form.reset();
            if (modal) modal.style.display = "flex";
        });
    }

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    if (modal) {
        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal();
        });
    }

    if (form) {
        form.addEventListener("submit", event => {
            event.preventDefault();

            const titleInput = document.getElementById("asgTitle");
            const classInput = document.getElementById("asgClass");
            const subjectInput = document.getElementById("asgSubject");
            const dueInput = document.getElementById("asgDueDate");
            const instructionsInput = document.getElementById("asgInstructions");

            if (!titleInput || !classInput || !subjectInput || !dueInput ||
                !instructionsInput) {
                alert("Assignment form is incomplete.");
                return;
            }

            const title = titleInput.value.trim();
            const cls = classInput.value.trim();
            const subject = subjectInput.value.trim();
            const due = dueInput.value;
            const notes = instructionsInput.value.trim() ||
                "No extra instructions specified.";

            if (!title || !cls || !subject || !due) {
                alert("Please complete all required assignment fields.");
                return;
            }

            const parsedDate = new Date(`${due}T00:00:00`);

            if (
                !Number.isFinite(parsedDate.getTime()) ||
                parsedDate.getFullYear() !== Number(due.slice(0, 4)) ||
                parsedDate.getMonth() + 1 !== Number(due.slice(5, 7)) ||
                parsedDate.getDate() !== Number(due.slice(8, 10)) ||
                !/^\d{4}-\d{2}-\d{2}$/.test(due)
            ) {
                alert("Please select a valid due date.");
                return;
            }

            if (!grid) {
                alert("Assignment list could not be found.");
                return;
            }

            const card = document.createElement("div");
            card.className = "assignment-card";

            const top = document.createElement("div");
            top.className = "assignment-top";

            const classLabel = document.createElement("span");
            classLabel.className = "assignment-class";
            classLabel.textContent = `Class ${cls} - ${subject}`;

            const dueLabel = document.createElement("span");
            dueLabel.className = "assignment-due";
            dueLabel.textContent = `Due: ${due}`;

            top.append(classLabel, dueLabel);

            const heading = document.createElement("h3");
            heading.className = "assignment-title";
            heading.textContent = title;

            const description = document.createElement("p");
            description.className = "assignment-desc";
            description.textContent = notes;

            const footer = document.createElement("div");
            footer.className = "assignment-footer";

            const submissions = document.createElement("span");
            submissions.className = "submissions-badge";
            submissions.textContent = "0 / 68 Submitted";

            const status = document.createElement("span");
            status.className = "status-active";
            status.textContent = "Active";

            footer.append(submissions, status);
            card.append(top, heading, description, footer);

            grid.prepend(card);
            closeModal();
            form.reset();

            alert("Assignment created and posted to student dashboards!");
        });
    }
});
