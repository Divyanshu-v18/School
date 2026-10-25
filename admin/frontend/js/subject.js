
document.addEventListener("DOMContentLoaded", () => {
    let allSubjects = [];

    const tableBody = document.getElementById("subjectTableBody");
    const searchInput = document.getElementById("subjectSearchInput");
    const classFilter = document.getElementById("classFilter");

    const addModal = document.getElementById("addSubjectModal");
    const openAddBtn = document.getElementById("openAddSubjectBtn");
    const closeAddBtn = document.getElementById("closeAddSubjectBtn");
    const cancelAddBtn = document.getElementById("cancelAddSubjectBtn");
    const addForm = document.getElementById("addSubjectForm");

    // Load subjects from API
    async function loadSubjects() {
        try {
            const res = await authenticatedFetch(
                `${window.API_BASE_URL}/subjects`
            );

            if (!res.ok) throw new Error("Failed to fetch subjects");

            const data = await res.json();

            if (!Array.isArray(data)) {
                throw new Error("Invalid subjects response");
            }

            allSubjects = data;
            renderSubjects();
        } catch (err) {
            console.error("Error loading subjects:", err);

            if (tableBody) {
                tableBody.replaceChildren();

                const row = document.createElement("tr");
                const cell = document.createElement("td");

                cell.colSpan = 5;
                cell.className = "table-loading";
                cell.textContent = "Failed to load subjects. Please check backend.";

                row.appendChild(cell);
                tableBody.appendChild(row);
            }
        }
    }

    // Render filtered subjects
    function renderSubjects() {
        if (!tableBody) return;

        const term = (searchInput?.value || "").toLowerCase().trim();
        const selectedClass = (classFilter?.value || "").trim();

        const filtered = allSubjects.filter(sub => {
            const name = String(sub.subject_name ?? "");
            const code = String(sub.subject_code ?? "");

            const matchesSearch =
                name.toLowerCase().includes(term) ||
                code.toLowerCase().includes(term);

            const matchesClass =
                !selectedClass ||
                String(sub.class_name ?? "") === selectedClass;

            return matchesSearch && matchesClass;
        });

        tableBody.replaceChildren();

        if (filtered.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 5;
            cell.className = "table-loading";
            cell.textContent = "No subjects found matching your criteria.";

            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }

        filtered.forEach(sub => {
            const row = document.createElement("tr");
            const codeCell = document.createElement("td");
            const nameCell = document.createElement("td");
            const classCell = document.createElement("td");
            const descriptionCell = document.createElement("td");
            const actionsCell = document.createElement("td");

            const codeBadge = document.createElement("span");
            codeBadge.className = "subject-code-badge";
            codeBadge.textContent = String(sub.subject_code ?? "");
            codeCell.appendChild(codeBadge);

            const subjectName = document.createElement("strong");
            subjectName.textContent = String(sub.subject_name ?? "");
            nameCell.appendChild(subjectName);

            const classBadge = document.createElement("span");
            classBadge.className = "class-badge";
            classBadge.textContent = `Class ${String(sub.class_name ?? "")}`;
            classCell.appendChild(classBadge);

            descriptionCell.textContent = String(sub.description || "-");

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-btn";
            deleteButton.textContent = "Delete";

            // Store the ID as data, never inside inline JavaScript.
            deleteButton.addEventListener("click", () => {
                deleteSubject(sub.subject_id, sub.subject_name);
            });

            actionsCell.appendChild(deleteButton);

            row.append(
                codeCell,
                nameCell,
                classCell,
                descriptionCell,
                actionsCell
            );

            tableBody.appendChild(row);
        });
    }

    // Modal control
    if (openAddBtn) {
        openAddBtn.addEventListener("click", () => {
            if (addForm) addForm.reset();
            if (addModal) addModal.style.display = "flex";
        });
    }

    function closeModal() {
        if (addModal) addModal.style.display = "none";
    }

    if (closeAddBtn) closeAddBtn.addEventListener("click", closeModal);
    if (cancelAddBtn) cancelAddBtn.addEventListener("click", closeModal);

    // Save subject
    if (addForm) {
        addForm.addEventListener("submit", async event => {
            event.preventDefault();

            const subjectData = {
                subject_name: document.getElementById("subName").value.trim(),
                subject_code: document.getElementById("subCode").value.trim(),
                class_name: document.getElementById("subClass").value.trim(),
                description:
                    document.getElementById("subDesc").value.trim() || null
            };

            if (
                !subjectData.subject_name ||
                !subjectData.subject_code ||
                !subjectData.class_name
            ) {
                alert("Please fill in the subject name, code, and class.");
                return;
            }

            try {
                const res = await authenticatedFetch(
                    `${window.API_BASE_URL}/subjects`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(subjectData)
                    }
                );

                if (!res.ok) {
                    let message = "Failed to create subject";

                    try {
                        const err = await res.json();
                        if (typeof err.detail === "string") {
                            message = err.detail;
                        }
                    } catch {
                        // Keep the generic error message.
                    }

                    throw new Error(message);
                }

                closeModal();
                await loadSubjects();
            } catch (err) {
                console.error("Error saving subject:", err);
                alert("Error saving subject: " + err.message);
            }
        });
    }

    // Delete subject
    async function deleteSubject(id, name) {
        // Accept only positive integer IDs.
        const subjectId = Number(id);

        if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
            alert("Invalid subject ID.");
            return;
        }

        if (!confirm(`Are you sure you want to delete the subject "${String(name ?? "")}"?`)) {
            return;
        }

        try {
            const res = await authenticatedFetch(
                `${window.API_BASE_URL}/subjects/${subjectId}`,
                { method: "DELETE" }
            );

            if (!res.ok) {
                let msg = "Failed to delete subject";
                try {
                    const data = await res.json();
                    if (typeof data.detail === "string") msg = data.detail;
                } catch (_) {}
                throw new Error(msg);
            }

            await loadSubjects();
        } catch (err) {
            console.error("Error deleting subject:", err);
            alert("Error: " + err.message);
        }
    }

    // Listeners for search and filter
    if (searchInput) {
        searchInput.addEventListener("input", renderSubjects);
    }

    if (classFilter) {
        classFilter.addEventListener("change", renderSubjects);
    }

    loadSubjects();
});
