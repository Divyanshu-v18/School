
document.addEventListener("DOMContentLoaded", () => {
    let allExams = [];

    const examTableBody = document.getElementById("examTableBody");
    const searchInput = document.getElementById("examSearchInput");
    const classFilter = document.getElementById("examClassFilter");

    // Schedule modal
    const scheduleModal = document.getElementById("scheduleExamModal");
    const openScheduleBtn = document.getElementById("openScheduleExamBtn");
    const closeScheduleBtn = document.getElementById("closeScheduleExamBtn");
    const cancelScheduleBtn = document.getElementById("cancelScheduleExamBtn");
    const scheduleForm = document.getElementById("scheduleExamForm");

    // Results modal
    const resultsModal = document.getElementById("examResultsModal");
    const closeResultsBtn = document.getElementById("closeResultsModalBtn");
    const resultsModalTitle = document.getElementById("resultsModalTitle");
    const resultsModalSub = document.getElementById("resultsModalSub");
    const currentExamIdInput = document.getElementById("currentExamId");
    const addResultForm = document.getElementById("addResultForm");
    const resultsTableBody = document.getElementById("resultsTableBody");

    function isPositiveId(value) {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0;
    }

    function showTableMessage(tbody, colspan, message) {
        if (!tbody) return;

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = colspan;
        cell.className = "table-loading";
        cell.textContent = message;

        row.appendChild(cell);
        tbody.replaceChildren(row);
    }

    async function loadExams() {
        try {
            const res = await authenticatedFetch(`${window.API_BASE_URL}/exams`);
            if (!res.ok) throw new Error("Failed to fetch exams");

            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Invalid exams response");

            allExams = data;
            renderExams();
        } catch (err) {
            console.error("Error loading exams:", err);
            showTableMessage(examTableBody, 6, "Failed to load examinations.");
        }
    }

    function renderExams() {
        if (!examTableBody) return;

        const term = (searchInput?.value || "").toLowerCase().trim();
        const cls = (classFilter?.value || "").trim();

        const filtered = allExams.filter(ex => {
            const name = String(ex.exam_name ?? "");
            const subject = String(ex.subject ?? "");

            const matchesSearch =
                name.toLowerCase().includes(term) ||
                subject.toLowerCase().includes(term);

            const matchesClass =
                !cls || String(ex.class_name ?? "") === cls;

            return matchesSearch && matchesClass;
        });

        examTableBody.replaceChildren();

        if (filtered.length === 0) {
            showTableMessage(
                examTableBody,
                6,
                "No scheduled exams found matching filters."
            );
            return;
        }

        filtered.forEach(ex => {
            const row = document.createElement("tr");

            const nameCell = document.createElement("td");
            const nameText = document.createElement("strong");
            nameText.textContent = String(ex.exam_name ?? "");
            nameCell.appendChild(nameText);

            const classCell = document.createElement("td");
            classCell.textContent = `Class ${String(ex.class_name ?? "")}`;

            const subjectCell = document.createElement("td");
            subjectCell.textContent = String(ex.subject ?? "");

            const dateCell = document.createElement("td");
            dateCell.textContent = String(ex.exam_date ?? "");

            const marksCell = document.createElement("td");
            marksCell.textContent = `${String(ex.max_marks ?? "")} marks`;

            const actionsCell = document.createElement("td");

            const resultsButton = document.createElement("button");
            resultsButton.type = "button";
            resultsButton.className = "btn-view-results";
            resultsButton.textContent = "Results / Marks";
            resultsButton.addEventListener("click", () => {
                openResults(
                    ex.exam_id,
                    ex.exam_name,
                    ex.subject,
                    ex.class_name
                );
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-btn";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => {
                deleteExam(ex.exam_id);
            });

            actionsCell.append(resultsButton, deleteButton);
            row.append(
                nameCell,
                classCell,
                subjectCell,
                dateCell,
                marksCell,
                actionsCell
            );

            examTableBody.appendChild(row);
        });
    }

    // Modal helpers
    function openModal(modal) {
        if (modal) modal.style.display = "flex";
    }

    function closeModal(modal) {
        if (modal) modal.style.display = "none";
    }

    if (openScheduleBtn) {
        openScheduleBtn.addEventListener("click", () => {
            if (scheduleForm) scheduleForm.reset();
            openModal(scheduleModal);
        });
    }

    if (closeScheduleBtn) {
        closeScheduleBtn.addEventListener("click", () => closeModal(scheduleModal));
    }

    if (cancelScheduleBtn) {
        cancelScheduleBtn.addEventListener("click", () => closeModal(scheduleModal));
    }

    if (closeResultsBtn) {
        closeResultsBtn.addEventListener("click", () => closeModal(resultsModal));
    }

    // Schedule exam
    if (scheduleForm) {
        scheduleForm.addEventListener("submit", async event => {
            event.preventDefault();

            const maxMarksInput = document.getElementById("examMaxMarks");
            const maxMarks = Number(maxMarksInput.value);

            const payload = {
                exam_name: document.getElementById("examName").value.trim(),
                class_name: document.getElementById("examClass").value.trim(),
                subject: document.getElementById("examSubject").value.trim(),
                exam_date: document.getElementById("examDate").value,
                max_marks: maxMarks
            };

            if (
                !payload.exam_name ||
                !payload.class_name ||
                !payload.subject ||
                !payload.exam_date ||
                !Number.isFinite(maxMarks) ||
                !Number.isInteger(maxMarks) ||
                maxMarks <= 0
            ) {
                alert("Enter a valid exam name, class, subject, date, and positive maximum marks.");
                return;
            }

            try {
                const res = await authenticatedFetch(`${window.API_BASE_URL}/exams`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error("Failed to schedule exam");

                closeModal(scheduleModal);
                await loadExams();
            } catch (err) {
                console.error("Error scheduling exam:", err);
                alert("Error: " + err.message);
            }
        });
    }

    // Results modal
    async function openResults(examId, name, subject, className) {
        if (!isPositiveId(examId)) {
            alert("Invalid exam ID.");
            return;
        }

        if (currentExamIdInput) currentExamIdInput.value = String(Number(examId));
        if (resultsModalTitle) {
            resultsModalTitle.textContent = `${String(name ?? "")} — Results`;
        }
        if (resultsModalSub) {
            resultsModalSub.textContent =
                `Class ${String(className ?? "")} | Subject: ${String(subject ?? "")}`;
        }

        openModal(resultsModal);
        await loadResults(Number(examId));
    }

    async function loadResults(examId) {
        if (!resultsTableBody) return;

        if (!isPositiveId(examId)) {
            showTableMessage(resultsTableBody, 4, "Invalid exam ID.");
            return;
        }

        showTableMessage(resultsTableBody, 4, "Loading results...");

        try {
            const res = await authenticatedFetch(
                `${window.API_BASE_URL}/exams/${Number(examId)}/results`
            );

            if (!res.ok) throw new Error("Failed to fetch results");

            const results = await res.json();
            if (!Array.isArray(results)) throw new Error("Invalid results response");

            if (results.length === 0) {
                showTableMessage(
                    resultsTableBody,
                    4,
                    "No marks entered yet. Use the form above to add student scores."
                );
                return;
            }

            resultsTableBody.replaceChildren();

            results.forEach(result => {
                const row = document.createElement("tr");

                const studentIdCell = document.createElement("td");
                studentIdCell.textContent = `#${String(result.student_id ?? "")}`;

                const nameCell = document.createElement("td");
                const name = document.createElement("strong");
                name.textContent = String(result.student_name ?? "");
                nameCell.appendChild(name);

                const marksCell = document.createElement("td");
                marksCell.textContent = String(result.marks_obtained ?? "");

                const gradeCell = document.createElement("td");
                const grade = document.createElement("strong");
                grade.textContent = String(result.grade || "-");
                gradeCell.appendChild(grade);

                row.append(studentIdCell, nameCell, marksCell, gradeCell);
                resultsTableBody.appendChild(row);
            });
        } catch (err) {
            console.error("Error loading results:", err);
            showTableMessage(resultsTableBody, 4, "Error loading results.");
        }
    }

    // Add result
    if (addResultForm) {
        addResultForm.addEventListener("submit", async event => {
            event.preventDefault();

            const examId = Number(currentExamIdInput?.value);
            const marksInput = document.getElementById("resMarks");
            const studentIdInput = document.getElementById("resStudentId");

            const marks = Number(marksInput.value);
            const studentId = Number(studentIdInput.value);
            const studentName =
                document.getElementById("resStudentName").value.trim();

            const exam = allExams.find(ex => Number(ex.exam_id) === examId);

            if (!isPositiveId(examId) || !exam) {
                alert("Please select a valid exam.");
                return;
            }

            if (!isPositiveId(studentId)) {
                alert("Enter a valid student ID.");
                return;
            }

            if (!studentName) {
                alert("Enter the student name.");
                return;
            }

            if (
                !Number.isInteger(marks) ||
                marks < 0 ||
                !Number.isFinite(Number(exam.max_marks)) ||
                marks > Number(exam.max_marks)
            ) {
                alert(`Marks must be a whole number between 0 and ${exam.max_marks}.`);
                return;
            }

            let grade = document.getElementById("resGrade").value.trim();

            if (!grade) {
                if (marks >= 90) grade = "A+";
                else if (marks >= 80) grade = "A";
                else if (marks >= 70) grade = "B+";
                else if (marks >= 60) grade = "B";
                else if (marks >= 50) grade = "C";
                else grade = "D";
            }

            const payload = {
                exam_id: examId,
                student_id: studentId,
                student_name: studentName,
                marks_obtained: marks,
                grade
            };

            try {
                const res = await authenticatedFetch(
                    `${window.API_BASE_URL}/exams/${examId}/results`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    }
                );

                if (!res.ok) throw new Error("Failed to save student mark");

                addResultForm.reset();
                await loadResults(examId);
            } catch (err) {
                console.error("Error saving student marks:", err);
                alert("Error: " + err.message);
            }
        });
    }

    // Delete exam
    async function deleteExam(id) {
        const examId = Number(id);

        if (!isPositiveId(examId)) {
            alert("Invalid exam ID.");
            return;
        }

        if (!confirm("Are you sure you want to delete this scheduled exam?")) {
            return;
        }

        try {
            const res = await authenticatedFetch(
                `${window.API_BASE_URL}/exams/${examId}`,
                { method: "DELETE" }
            );

            if (!res.ok) {
                let msg = "Failed to delete exam";
                try {
                    const data = await res.json();
                    if (typeof data.detail === "string") msg = data.detail;
                } catch (_) {}
                throw new Error(msg);
            }

            await loadExams();
        } catch (err) {
            console.error("Error deleting exam:", err);
            alert("Error: " + err.message);
        }
    }

    if (searchInput) searchInput.addEventListener("input", renderExams);
    if (classFilter) classFilter.addEventListener("change", renderExams);

    loadExams();
});
