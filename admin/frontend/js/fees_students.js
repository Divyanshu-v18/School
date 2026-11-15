/* Fees > Students tab: every student with fee totals, search, filters and sorting.
   "View More" opens the student's payment page, where payments can be recorded or changed. */
(() => {
    "use strict";
    const CLASS_ORDER = ["KIDSCARE", "NUR", "LKG", "UKG", ...Array.from({ length: 12 }, (_, index) => String(index + 1))];
    const classLabel = key => /^\d+$/.test(key) ? `Class ${key}` : key === "KIDSCARE" ? "Kids Care" : key || "—";
    const normalize = value => String(value || "").trim().replace(/^class\s+/i, "").toUpperCase();
    const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

    const body = document.getElementById("studentsTabBody");
    const search = document.getElementById("studentsSearch");
    const classFilter = document.getElementById("studentsClassFilter");
    const count = document.getElementById("studentsCount");
    const errorBox = document.getElementById("studentsTabError");
    if (!body || !search || !classFilter) return; // Students panel is not on this page

    let students = [], year = "", loadToken = 0;

    /* ---------- controls (the extra filters are created here, next to the class filter) ---------- */
    function makeSelect(id, label, options) {
        const select = document.createElement("select");
        select.id = id; select.setAttribute("aria-label", label);
        options.forEach(([value, text]) => { const option = document.createElement("option"); option.value = value; option.textContent = text; select.appendChild(option); });
        return select;
    }
    const sectionFilter = makeSelect("studentsSectionFilter", "Filter by section", [["", "All sections"]]);
    const statusFilter = makeSelect("studentsStatusFilter", "Filter by payment status", [
        ["", "All payment statuses"], ["paid", "Paid in full"], ["partial", "Partially paid"],
        ["unpaid", "Not paid"], ["overdue", "Overdue"], ["none", "No fee set"]]);
    const sortSelect = makeSelect("studentsSort", "Sort students", [
        ["class", "Sort: Class & section"], ["name", "Sort: Name (A–Z)"],
        ["pending", "Sort: Highest pending"], ["paid", "Sort: Highest paid"]]);
    const clearButton = document.createElement("button");
    clearButton.type = "button"; clearButton.className = "cancel-dialog"; clearButton.textContent = "Clear filters"; clearButton.hidden = true;
    count.before(sectionFilter, statusFilter, sortSelect, clearButton);

    CLASS_ORDER.forEach(key => {
        const option = document.createElement("option");
        option.value = key; option.textContent = classLabel(key); classFilter.appendChild(option);
    });

    /* ---------- helpers ---------- */
    // paid = nothing left to pay, partial = some paid, unpaid = nothing paid, none = no fee set for the class
    const statusOf = student => !student.total ? "none" : student.pending <= 0.005 ? "paid" : student.paid > 0 ? "partial" : "unpaid";

    function message(text) {
        body.replaceChildren();
        const row = document.createElement("tr"); const cell = document.createElement("td");
        cell.colSpan = 8; cell.textContent = text; row.appendChild(cell); body.appendChild(row);
    }

    function fillSections() {
        const previous = sectionFilter.value;
        const sections = [...new Set(students.map(student => student.section).filter(Boolean))].sort();
        sectionFilter.replaceChildren();
        [["", "All sections"], ...sections.map(section => [section, `Section ${section}`])].forEach(([value, text]) => {
            const option = document.createElement("option"); option.value = value; option.textContent = text; sectionFilter.appendChild(option);
        });
        sectionFilter.value = sections.includes(previous) ? previous : "";
    }

    function visibleStudents() {
        const query = search.value.trim().toLowerCase();
        const rows = students.filter(student =>
            (!classFilter.value || student.classKey === classFilter.value) &&
            (!sectionFilter.value || student.section === sectionFilter.value) &&
            (!statusFilter.value || (statusFilter.value === "overdue" ? student.overdue > 0.005 : statusOf(student) === statusFilter.value)) &&
            (!query || student.name.toLowerCase().includes(query) || String(student.roll).toLowerCase().includes(query)));
        const sorters = {
            class: (a, b) => CLASS_ORDER.indexOf(a.classKey) - CLASS_ORDER.indexOf(b.classKey)
                || String(a.section || "").localeCompare(String(b.section || "")) || a.name.localeCompare(b.name),
            name: (a, b) => a.name.localeCompare(b.name),
            pending: (a, b) => b.pending - a.pending || a.name.localeCompare(b.name),
            paid: (a, b) => b.paid - a.paid || a.name.localeCompare(b.name),
        };
        return rows.sort(sorters[sortSelect.value] || sorters.class);
    }

    function render() {
        const rows = visibleStudents();
        const filtering = Boolean(search.value.trim() || classFilter.value || sectionFilter.value || statusFilter.value);
        clearButton.hidden = !filtering;
        count.textContent = students.length
            ? `${rows.length} of ${students.length} students · Pending ${money(rows.reduce((sum, student) => sum + student.pending, 0))}` : "";
        if (!rows.length) { message(students.length ? "No students match your filters." : "No students found."); return; }
        body.replaceChildren();
        rows.forEach(student => {
            const row = document.createElement("tr");
            [student.roll, student.name, classLabel(student.classKey), student.section || "—", money(student.total), money(student.paid)].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
            });
            const pendingCell = document.createElement("td"); pendingCell.textContent = money(student.pending);
            if (student.overdue > 0.005) {
                const note = document.createElement("small"); note.className = "overdue-note"; note.textContent = `${money(student.overdue)} overdue`;
                pendingCell.appendChild(note);
            }
            row.appendChild(pendingCell);
            const action = document.createElement("td"); const button = document.createElement("button");
            button.type = "button"; button.className = "view-students-btn"; button.textContent = "View More";
            button.addEventListener("click", () => {
                const query = new URLSearchParams({ class: student.classKey, student_id: student.id, from: "students" });
                if (year) query.set("academic_year", year);
                window.location.href = `fee_class_students.html?${query.toString()}`;
            });
            action.appendChild(button); row.appendChild(action); body.appendChild(row);
        });
    }

    async function getJson(url) {
        const response = await window.authenticatedFetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
        return data;
    }

    async function load(academicYear) {
        year = academicYear || year;
        const token = ++loadToken;
        errorBox.hidden = true;
        message("Loading students…");
        try {
            const [people, fees] = await Promise.all([
                getJson("/students"),
                getJson(`/fees/all-students${year ? `?academic_year=${encodeURIComponent(year)}` : ""}`),
            ]);
            if (token !== loadToken) return; // a newer load replaced this one
            if (!Array.isArray(people)) throw new Error("Unable to load students.");
            const feeById = new Map((fees.students || []).map(item => [Number(item.student_id), item]));
            students = people.map(person => {
                const fee = feeById.get(Number(person.student_id)) || {};
                return { id: person.student_id, roll: person.roll_no || person.roll_number || person.student_id,
                         name: person.full_name || `Student ${person.student_id}`, classKey: normalize(person.class),
                         section: person.section, total: fee.total_fee || 0, paid: fee.paid_amount || 0,
                         pending: fee.pending_amount || 0, overdue: fee.overdue_amount || 0 };
            });
            fillSections();
            render();
        } catch (error) {
            if (token !== loadToken) return;
            console.error("Unable to load students tab:", error);
            errorBox.textContent = `Unable to load students: ${error.message}`; errorBox.hidden = false;
            students = []; count.textContent = ""; message("Student records could not be loaded.");
        }
    }

    search.addEventListener("input", render);
    [classFilter, sectionFilter, statusFilter, sortSelect].forEach(control => control.addEventListener("change", render));
    clearButton.addEventListener("click", () => {
        search.value = ""; classFilter.value = ""; sectionFilter.value = ""; statusFilter.value = "";
        render();
    });
    window.loadFeeStudents = load;
})();