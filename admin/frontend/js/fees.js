/* ==========================================================================
   FEES MANAGEMENT (v2)
   - Fee Heads: define fee types once (name + frequency)
   - Fee Structure: one grid, classes x fee heads, one amount per cell
   - Payments: record / collect
   Requires api.js with authenticatedFetch().

   Backend endpoints this file expects (to build next):
     GET    /fees/heads
     POST   /fees/heads                 {name, frequency, due_day, description}
     PUT    /fees/heads/{head_id}
     DELETE /fees/heads/{head_id}
     GET    /fees/structures            -> [{class_name, head_id, academic_year, amount}]
     PUT    /fees/structures/bulk       {academic_year, items:[{class_name, head_id, amount|null}]}
     POST   /fees/structures/copy       {from_year, to_year}
     GET/POST/PUT/DELETE /fees/payments  (as before, plus fee_head_id + period)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    /* ---------- constants ---------- */
    const CLASSES = [
        ["KIDSCARE", "KidsCare"], ["NUR", "NUR"], ["LKG", "LKG"], ["UKG", "UKG"],
        ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `Class ${i + 1}`])
    ];

    // times = how many installments of this head fall in one academic year
    const FREQUENCIES = {
        monthly: { label: "Monthly", times: 12 },
        quarterly: { label: "Quarterly", times: 4 },
        half_yearly: { label: "Half-yearly", times: 2 },
        yearly: { label: "Yearly", times: 1 },
        one_time: { label: "One-time", times: 1 }
    };

    const MONTHS = ["April", "May", "June", "July", "August", "September",
        "October", "November", "December", "January", "February", "March"];

    /* ---------- state ---------- */
    let allPayments = [];
    let allHeads = [];
    let allStructures = [];
    let allDirectoryStudents = [];
    let original = new Map();   // "CLASS|headId" -> saved amount (number)
    let draft = new Map();      // "CLASS|headId" -> edited value (string)

    /* ---------- element refs ---------- */
    const tabs = [
        { btn: $("tabPaymentsBtn"), panel: $("panelPayments") },
        { btn: $("tabStructuresBtn"), panel: $("panelStructures") },
        { btn: $("tabHeadsBtn"), panel: $("panelHeads") }
    ];
    const paymentsBody = $("paymentsTableBody");
    const headsBody = $("headsTableBody");
    const matrixHead = $("matrixHead");
    const matrixBody = $("matrixBody");
    const yearSelect = $("structureYearSelect");
    const paymentYearFilter = $("paymentYearFilter");
    const saveGridBtn = $("saveGridBtn");
    const dirtyNote = $("dirtyNote");
    const searchInput = $("paymentSearchInput");
    const classFilter = $("paymentClassFilter");
    const collectModal = $("collectFeeModal");
    const collectForm = $("collectFeeForm");
    const headModal = $("headModal");
    const headForm = $("headForm");
    const payDateInput = $("payDate");

    const apiBase = () =>
        (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

    /* ---------- helpers ---------- */
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
        const [y, m, d] = value.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }

    async function parseResponse(response) {
        let data = {};
        try { data = await response.json(); } catch (_) { }
        if (!response.ok) {
            throw new Error(
                typeof data.detail === "string"
                    ? data.detail
                    : `Request failed (HTTP ${response.status}).`
            );
        }

        return data;
    }

    function setTableMessage(body, columns, message) {
        if (!body) return;

        body.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = columns;
        cell.className = "table-loading";
        cell.textContent = message;

        row.appendChild(cell);
        body.appendChild(row);
    }

    function addCell(row, value, tag = "td") {
        const cell = document.createElement(tag);
        cell.textContent = String(value ?? "");
        row.appendChild(cell);

        return cell;
    }

    function actionButton(label, className, action) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = className;
        button.textContent = label;

        button.addEventListener("click", action);

        return button;
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    const normClass = (c) => String(c ?? "").replace(/^class\s+/i, "").trim().toUpperCase();
    const key = (cls, headId) => `${normClass(cls)}|${headId}`;

    function formatClass(cls) {
        if (!cls) return "—";
        const str = String(cls).replace(/^class\s+/i, "").trim();
        return /^\d+$/.test(str) ? `Class ${str}` : str;
    }

    function formatMoney(value) {
        const amount = Number(value);
        return Number.isFinite(amount)
            ? amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })
            : "—";
    }

    function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // Indian academic year starts in April
    function academicYearStart(date = new Date()) {
        return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    }

    const yearLabel = (start) => `${start}-${start + 1}`;
    const headById = (id) => allHeads.find((h) => Number(h.head_id) === Number(id));

    /* ---------- populate static dropdowns ---------- */
    function fillClassSelects() {
        document.querySelectorAll("select[data-classes]").forEach((select) => {
            select.replaceChildren();
            const allLabel = select.dataset.all;
            if (allLabel) {
                const o = document.createElement("option");
                o.value = "";
                o.textContent = allLabel;
                select.appendChild(o);
            }
            CLASSES.forEach(([value, label]) => {
                const o = document.createElement("option");
                o.value = value;
                o.textContent = label;
                select.appendChild(o);
            });
        });
    }

    function getActiveAcademicYear() {
        const stored = localStorage.getItem("school_academic_year");
        if (stored && /^\d{4}-\d{4}$/.test(stored.trim())) {
            return stored.trim();
        }
        return yearLabel(academicYearStart());
    }

    function getPaymentAcademicYear(p) {
        if (!p) return getActiveAcademicYear();
        if (p.academic_year && /^\d{4}-\d{4}$/.test(String(p.academic_year).trim())) {
            return String(p.academic_year).trim();
        }
        if (p.period && String(p.period).includes("-")) {
            const [y, m] = String(p.period).split("-").map(Number);
            if (!isNaN(y) && !isNaN(m)) {
                const start = m >= 4 ? y : y - 1;
                return `${start}-${start + 1}`;
            }
        }
        if (p.payment_date) {
            const parts = String(p.payment_date).slice(0, 10).split("-").map(Number);
            if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const [y, m] = parts;
                const start = m >= 4 ? y : y - 1;
                return `${start}-${start + 1}`;
            }
        }
        return getActiveAcademicYear();
    }

    function fillYearSelects() {
        const current = academicYearStart();
        const active = getActiveAcademicYear();
        const years = new Set([
            yearLabel(current - 2),
            yearLabel(current - 1),
            yearLabel(current),
            yearLabel(current + 1),
            yearLabel(current + 2)
        ]);
        if (active) years.add(active);
        allStructures.forEach((s) => s.academic_year && years.add(String(s.academic_year).trim()));
        allPayments.forEach((p) => {
            const py = getPaymentAcademicYear(p);
            if (py) years.add(py);
        });

        const sorted = [...years].sort();

        if (yearSelect) {
            yearSelect.replaceChildren();
            sorted.forEach((y) => {
                const o = document.createElement("option");
                o.value = y;
                o.textContent = `Academic Year ${y}`;
                yearSelect.appendChild(o);
            });
            yearSelect.value = years.has(active) ? active : yearLabel(current);
            yearSelect.dataset.prev = yearSelect.value;
        }

        if (paymentYearFilter) {
            paymentYearFilter.replaceChildren();
            sorted.forEach((y) => {
                const o = document.createElement("option");
                o.value = y;
                o.textContent = `AY ${y}`;
                paymentYearFilter.appendChild(o);
            });
            paymentYearFilter.value = years.has(active) ? active : yearLabel(current);
        }

        const currentYear = paymentYearFilter ? paymentYearFilter.value : (yearSelect ? yearSelect.value : active);
        const headsDisplay = $("headsActiveYearDisplay");
        if (headsDisplay) headsDisplay.textContent = currentYear;
        const modalDisplay = $("collectModalYearDisplay");
        if (modalDisplay) modalDisplay.textContent = currentYear;
    }

    async function setActiveAcademicYear(newYear, options = {}) {
        if (!newYear) return false;
        const prevYear = getActiveAcademicYear();

        if (options.checkDraft && draft.size && [...draft.keys()].some(isChanged)) {
            if (!confirm("You have unsaved changes in fee structure. Switch year and discard them?")) {
                if (options.source === "payment" && paymentYearFilter) {
                    paymentYearFilter.value = prevYear;
                } else if (yearSelect) {
                    yearSelect.value = prevYear;
                }
                return false;
            }
            draft.clear();
            refreshDirtyState();
        }

        localStorage.setItem("school_academic_year", newYear);
        if (yearSelect && yearSelect.value !== newYear) {
            yearSelect.value = newYear;
            yearSelect.dataset.prev = newYear;
        }
        if (paymentYearFilter && paymentYearFilter.value !== newYear) {
            paymentYearFilter.value = newYear;
        }
        const headsDisplay = $("headsActiveYearDisplay");
        if (headsDisplay) headsDisplay.textContent = newYear;
        const modalDisplay = $("collectModalYearDisplay");
        if (modalDisplay) modalDisplay.textContent = newYear;

        window.dispatchEvent(new CustomEvent("academicYearChanged", { detail: { academic_year: newYear } }));

        if (!options.skipBackend) {
            try {
                request(`${apiBase()}/settings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ academic_year: newYear })
                }).catch((err) => console.warn("Failed to persist academic_year setting:", err));
            } catch (_) {}
        }

        const startYear = parseInt(newYear.split("-")[0], 10);
        fillPeriodSelect(isNaN(startYear) ? academicYearStart() : startYear);

        renderMatrix();
        renderPayments();
        updateKPIs();
        return true;
    }

    function fillPeriodSelect(customStart = null) {
        const select = $("payPeriod");
        if (!select) return;
        const currentAy = getActiveAcademicYear();
        const parsedStart = parseInt(currentAy.split("-")[0], 10);
        const start = customStart || (!isNaN(parsedStart) ? parsedStart : academicYearStart());
        select.replaceChildren();
        MONTHS.forEach((name, i) => {
            const monthIndex = (3 + i) % 12;                 // Apr = 3
            const year = monthIndex >= 3 ? start : start + 1;
            const o = document.createElement("option");
            o.value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
            o.textContent = `${name} ${year}`;
            select.appendChild(o);
        });
    }

    function fillHeadSelect() {
        const select = $("payFeeHead");
        const prev = select.value;
        select.replaceChildren();
        const first = document.createElement("option");
        first.value = "";
        first.textContent = "-- Select fee head --";
        select.appendChild(first);
        allHeads.forEach((h) => {
            const o = document.createElement("option");
            o.value = h.head_id;
            o.textContent = `${h.name} (${FREQUENCIES[h.frequency]?.label ?? h.frequency})`;
            select.appendChild(o);
        });
        select.value = prev;
    }

    /* ---------- tabs ---------- */
    function showTab(index) {
        tabs.forEach((t, i) => {
            t.btn?.classList.toggle("active", i === index);
            if (t.panel) t.panel.style.display = i === index ? "block" : "none";
        });
    }
    tabs.forEach((t, i) => t.btn?.addEventListener("click", () => showTab(i)));

    /* ---------- data loading ---------- */
    async function loadSchoolSettings() {
        try {
            const data = await parseResponse(await request(`${apiBase()}/settings`));
            if (data && data.academic_year && !localStorage.getItem("school_academic_year")) {
                localStorage.setItem("school_academic_year", data.academic_year);
            }
        } catch (_) {}
    }

    function formatClass(cls) {
        if (!cls) return "—";
        const str = String(cls).replace(/^class\s+/i, "").trim();
        return /^\d+$/.test(str) ? `Class ${str}` : str;
    }

    function formatMoney(value) {
        const amount = Number(value);
        return Number.isFinite(amount)
            ? amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })
            : "—";
    }

    function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // Indian academic year starts in April
    function academicYearStart(date = new Date()) {
        return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    }

    const yearLabel = (start) => `${start}-${start + 1}`;
    const headById = (id) => allHeads.find((h) => Number(h.head_id) === Number(id));

    /* ---------- populate static dropdowns ---------- */
    function fillClassSelects() {
        document.querySelectorAll("select[data-classes]").forEach((select) => {
            select.replaceChildren();
            const allLabel = select.dataset.all;
            if (allLabel) {
                const o = document.createElement("option");
                o.value = "";
                o.textContent = allLabel;
                select.appendChild(o);
            }
            CLASSES.forEach(([value, label]) => {
                const o = document.createElement("option");
                o.value = value;
                o.textContent = label;
                select.appendChild(o);
            });
        });
    }

    function getActiveAcademicYear() {
        const stored = localStorage.getItem("school_academic_year");
        if (stored && /^\d{4}-\d{4}$/.test(stored.trim())) {
            return stored.trim();
        }
        return yearLabel(academicYearStart());
    }

    function getPaymentAcademicYear(p) {
        if (!p) return getActiveAcademicYear();
        if (p.academic_year && /^\d{4}-\d{4}$/.test(String(p.academic_year).trim())) {
            return String(p.academic_year).trim();
        }
        if (p.period && String(p.period).includes("-")) {
            const [y, m] = String(p.period).split("-").map(Number);
            if (!isNaN(y) && !isNaN(m)) {
                const start = m >= 4 ? y : y - 1;
                return `${start}-${start + 1}`;
            }
        }
        if (p.payment_date) {
            const parts = String(p.payment_date).slice(0, 10).split("-").map(Number);
            if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const [y, m] = parts;
                const start = m >= 4 ? y : y - 1;
                return `${start}-${start + 1}`;
            }
        }
        return getActiveAcademicYear();
    }

    function fillYearSelects() {
        const current = academicYearStart();
        const active = getActiveAcademicYear();
        const years = new Set([
            yearLabel(current - 2),
            yearLabel(current - 1),
            yearLabel(current),
            yearLabel(current + 1),
            yearLabel(current + 2)
        ]);
        if (active) years.add(active);
        allStructures.forEach((s) => s.academic_year && years.add(String(s.academic_year).trim()));
        allPayments.forEach((p) => {
            const py = getPaymentAcademicYear(p);
            if (py) years.add(py);
        });

        const sorted = [...years].sort();

        if (yearSelect) {
            yearSelect.replaceChildren();
            sorted.forEach((y) => {
                const o = document.createElement("option");
                o.value = y;
                o.textContent = `Academic Year ${y}`;
                yearSelect.appendChild(o);
            });
            yearSelect.value = years.has(active) ? active : yearLabel(current);
            yearSelect.dataset.prev = yearSelect.value;
        }

        if (paymentYearFilter) {
            paymentYearFilter.replaceChildren();
            sorted.forEach((y) => {
                const o = document.createElement("option");
                o.value = y;
                o.textContent = `AY ${y}`;
                paymentYearFilter.appendChild(o);
            });
            paymentYearFilter.value = years.has(active) ? active : yearLabel(current);
        }

        const currentYear = paymentYearFilter ? paymentYearFilter.value : (yearSelect ? yearSelect.value : active);
        const headsDisplay = $("headsActiveYearDisplay");
        if (headsDisplay) headsDisplay.textContent = currentYear;
        const modalDisplay = $("collectModalYearDisplay");
        if (modalDisplay) modalDisplay.textContent = currentYear;
    }

    async function setActiveAcademicYear(newYear, options = {}) {
        if (!newYear) return false;
        const prevYear = getActiveAcademicYear();

        if (options.checkDraft && draft.size && [...draft.keys()].some(isChanged)) {
            if (!confirm("You have unsaved changes in fee structure. Switch year and discard them?")) {
                if (options.source === "payment" && paymentYearFilter) {
                    paymentYearFilter.value = prevYear;
                } else if (yearSelect) {
                    yearSelect.value = prevYear;
                }
                return false;
            }
            draft.clear();
            refreshDirtyState();
        }

        localStorage.setItem("school_academic_year", newYear);
        if (yearSelect && yearSelect.value !== newYear) {
            yearSelect.value = newYear;
            yearSelect.dataset.prev = newYear;
        }
        if (paymentYearFilter && paymentYearFilter.value !== newYear) {
            paymentYearFilter.value = newYear;
        }
        const headsDisplay = $("headsActiveYearDisplay");
        if (headsDisplay) headsDisplay.textContent = newYear;
        const modalDisplay = $("collectModalYearDisplay");
        if (modalDisplay) modalDisplay.textContent = newYear;

        window.dispatchEvent(new CustomEvent("academicYearChanged", { detail: { academic_year: newYear } }));

        if (!options.skipBackend) {
            try {
                request(`${apiBase()}/settings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ academic_year: newYear })
                }).catch((err) => console.warn("Failed to persist academic_year setting:", err));
            } catch (_) {}
        }

        const startYear = parseInt(newYear.split("-")[0], 10);
        fillPeriodSelect(isNaN(startYear) ? academicYearStart() : startYear);

        renderMatrix();
        renderPayments();
        updateKPIs();
        return true;
    }

    function fillPeriodSelect(customStart = null) {
        const select = $("payPeriod");
        if (!select) return;
        const currentAy = getActiveAcademicYear();
        const parsedStart = parseInt(currentAy.split("-")[0], 10);
        const start = customStart || (!isNaN(parsedStart) ? parsedStart : academicYearStart());
        select.replaceChildren();
        MONTHS.forEach((name, i) => {
            const monthIndex = (3 + i) % 12;                 // Apr = 3
            const year = monthIndex >= 3 ? start : start + 1;
            const o = document.createElement("option");
            o.value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
            o.textContent = `${name} ${year}`;
            select.appendChild(o);
        });
    }

    function fillHeadSelect() {
        const select = $("payFeeHead");
        const prev = select.value;
        select.replaceChildren();
        const first = document.createElement("option");
        first.value = "";
        first.textContent = "-- Select fee head --";
        select.appendChild(first);
        allHeads.forEach((h) => {
            const o = document.createElement("option");
            o.value = h.head_id;
            o.textContent = `${h.name} (${FREQUENCIES[h.frequency]?.label ?? h.frequency})`;
            select.appendChild(o);
        });
        select.value = prev;
    }

    /* ---------- tabs ---------- */
    function showTab(index) {
        tabs.forEach((t, i) => {
            t.btn?.classList.toggle("active", i === index);
            if (t.panel) t.panel.style.display = i === index ? "block" : "none";
        });
    }
    tabs.forEach((t, i) => t.btn?.addEventListener("click", () => showTab(i)));

    /* ---------- data loading ---------- */
    async function loadSchoolSettings() {
        try {
            const data = await parseResponse(await request(`${apiBase()}/settings`));
            if (data && data.academic_year && !localStorage.getItem("school_academic_year")) {
                localStorage.setItem("school_academic_year", data.academic_year);
            }
        } catch (_) {}
    }

    // Load all required data.
    async function loadData() {
        await Promise.all([loadSchoolSettings(), loadHeads(), loadStructures(), loadPayments(), loadDirectoryStudents()]);
        fillYearSelects();
        renderMatrix();
        renderPayments();
        updateKPIs();
    }

    async function loadHeads() {
        try {
            const data = await parseResponse(await request(`${apiBase()}/fees/heads`));
            if (!Array.isArray(data)) throw new Error("Unexpected fee heads response.");
            allHeads = data;
            renderHeads();
            fillHeadSelect();
        } catch (error) {
            console.error("Load heads error:", error);
            setTableMessage(headsBody, 5, "Failed to load fee heads.");
        }
    }

    async function loadStructures() {
        try {
            const data = await parseResponse(await request(`${apiBase()}/fees/structures`));
            if (!Array.isArray(data)) throw new Error("Unexpected fee structures response.");
            allStructures = data;
        } catch (error) {
            console.error("Load structures error:", error);
            allStructures = [];
            setTableMessage(matrixBody, 1, "Failed to load fee structure.");
        }
        fillYearSelects();
    }

    async function loadPayments() {
        try {
            const data = await parseResponse(await request(`${apiBase()}/fees/payments`));
            if (!Array.isArray(data)) throw new Error("Unexpected payments response.");
            allPayments = data;
            renderPayments();
            // The class-wise record is a separate drill-down view. Refresh it
            // whenever the shared payment data is refreshed.
            window.refreshPaymentRecord?.();
        } catch (error) {
            console.error("Load payments error:", error);
            setTableMessage(paymentsBody, 10, "Failed to load payments. Check your session and backend.");
        }
    }

    async function loadDirectoryStudents() {
        try {
            const data = await parseResponse(await request(`${apiBase()}/students`));
            if (Array.isArray(data)) {
                allDirectoryStudents = data;
                populateStudentDirectoryDropdown();
            }
        } catch (error) {
            console.warn("Could not load student directory:", error);
        }
    }

    function updateKPIs() {
        const activeYear = paymentYearFilter?.value || getActiveAcademicYear();
        const yearPayments = allPayments.filter((p) => !activeYear || getPaymentAcademicYear(p) === activeYear);
        const total = yearPayments
            .filter((p) => String(p.status || "").toLowerCase() === "paid")
            .reduce((sum, p) => {
                const n = Number(p.amount_paid);
                return sum + (Number.isFinite(n) ? n : 0);
            }, 0);
        $("totalCollectedVal").textContent = `₹${formatMoney(total)}`;
        $("totalTransactionsVal").textContent = String(yearPayments.length);
        $("totalHeadsVal").textContent = String(allHeads.length);
    }

    /* ======================================================================
       FEE HEADS
       ====================================================================== */
    function renderHeads() {
        if (!headsBody) return;
        headsBody.replaceChildren();

        if (!allHeads.length) {
            setTableMessage(headsBody, 5,
                "No fee heads yet. Click '+ Add Fee Head' to create Monthly Fee, Annual Fee, Exam Fee, etc.");
            return;
        }

        allHeads.forEach((h) => {
            const row = document.createElement("tr");
            const nameCell = document.createElement("td");
            nameCell.appendChild(el("strong", "", h.name));
            row.appendChild(nameCell);

            const freqCell = document.createElement("td");
            freqCell.appendChild(el("span", "freq-badge", FREQUENCIES[h.frequency]?.label ?? h.frequency));
            row.appendChild(freqCell);

            addCell(row, h.due_day ? `${h.due_day}th of month` : "—");
            addCell(row, h.description || "—");

            const actions = document.createElement("td");
            const wrap = el("div", "table-actions");
            wrap.append(
                actionButton("Edit", "edit-btn", () => openHeadModal(h)),
                actionButton("Delete", "delete-btn", () => deleteHead(h))
            );
            actions.appendChild(wrap);
            row.appendChild(actions);
            headsBody.appendChild(row);
        });
    }

    function openHeadModal(head = null) {
        headForm.reset();
        $("editingHeadId").value = head ? head.head_id : "";
        $("headModalTitle").textContent = head ? "Edit Fee Head" : "Add Fee Head";
        if (head) {
            $("headName").value = head.name ?? "";
            $("headFrequency").value = head.frequency ?? "monthly";
            $("headDueDay").value = head.due_day ?? "";
            $("headDesc").value = head.description ?? "";
        }
        headModal.style.display = "flex";
    }

    const closeHeadModal = () => { headModal.style.display = "none"; };

    async function deleteHead(head) {
        if (!confirm(`Delete fee head "${head.name}"? Its amounts in the fee structure will be removed too.`)) return;
        try {
            await parseResponse(await request(`${apiBase()}/fees/heads/${encodeURIComponent(head.head_id)}`, {
                method: "DELETE"
            }));
            await Promise.all([loadHeads(), loadStructures()]);
            renderMatrix();
            updateKPIs();
            window.refreshPaymentRecord?.();
        } catch (error) {
            alert(`Unable to delete fee head: ${error.message}`);
        }
    }

    headForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const button = headForm.querySelector('button[type="submit"]');

        submitForm(headForm, button, async () => {
            const name = value("headName");
            const frequency = value("headFrequency");
            const dueDayRaw = value("headDueDay");
            const dueDay = dueDayRaw ? Number(dueDayRaw) : null;

            if (!name) throw new Error("Enter a fee head name.");
            if (!FREQUENCIES[frequency]) throw new Error("Choose how often this fee is charged.");
            if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)) {
                throw new Error("Due day must be between 1 and 28.");
            }
            const duplicate = allHeads.some((h) =>
                h.name.trim().toLowerCase() === name.toLowerCase() &&
                String(h.head_id) !== String($("editingHeadId").value));
            if (duplicate) throw new Error("A fee head with this name already exists.");

            const editId = $("editingHeadId").value;
            const payload = { name, frequency, due_day: dueDay, description: value("headDesc") || null };

            await parseResponse(await request(
                editId ? `${apiBase()}/fees/heads/${encodeURIComponent(editId)}` : `${apiBase()}/fees/heads`,
                {
                    method: editId ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            ));

            closeHeadModal();
            await loadHeads();
            renderMatrix();
            updateKPIs();
        });
    });

    /* ======================================================================
       FEE STRUCTURE GRID  (classes x fee heads)
       ====================================================================== */
    function buildOriginal() {
        original = new Map();
        draft = new Map();
        const year = yearSelect.value;
        allStructures
            .filter((s) => String(s.academic_year) === year)
            .forEach((s) => original.set(key(s.class_name, s.head_id), Number(s.amount)));
    }

    const savedText = (k) => (original.has(k) ? String(original.get(k)) : "");
    const currentText = (k) => (draft.has(k) ? draft.get(k) : savedText(k));
    const normText = (v) => (v === "" || v === null || v === undefined ? "" : String(Number(v)));
    const isChanged = (k) => draft.has(k) && normText(draft.get(k)) !== normText(savedText(k));

    function rowTotal(cls) {
        return allHeads.reduce((sum, h) => {
            const amt = Number(currentText(key(cls, h.head_id)));
            const times = FREQUENCIES[h.frequency]?.times ?? 1;
            return sum + (Number.isFinite(amt) ? amt * times : 0);
        }, 0);
    }

    function refreshRowTotal(cls) {
        const cell = $(`total-${normClass(cls)}`);
        if (cell) cell.textContent = `₹${formatMoney(rowTotal(cls))}`;
    }

    function refreshDirtyState() {
        let count = 0;
        draft.forEach((_, k) => { if (isChanged(k)) count++; });
        saveGridBtn.disabled = count === 0;
        dirtyNote.classList.toggle("hidden", count === 0);
        dirtyNote.textContent = `${count} unsaved change${count === 1 ? "" : "s"}`;
    }

    function setCell(cls, headId, text, inputEl) {
        const k = key(cls, headId);
        draft.set(k, text);
        if (inputEl) inputEl.classList.toggle("changed", isChanged(k));
        refreshRowTotal(cls);
        refreshDirtyState();
    }

    function renderMatrix() {
        if (!matrixHead || !matrixBody) return;
        buildOriginal();
        matrixHead.replaceChildren();
        matrixBody.replaceChildren();
        refreshDirtyState();

        if (!allHeads.length) {
            setTableMessage(matrixBody, 1,
                "Add your fee heads first (Fee Heads tab), then set amounts here.");
            return;
        }

        /* header */
        const headRow = document.createElement("tr");
        headRow.appendChild(el("th", "", "Class"));
        allHeads.forEach((h) => {
            const th = document.createElement("th");
            th.appendChild(document.createTextNode(h.name));
            th.appendChild(el("span", "matrix-head-sub", FREQUENCIES[h.frequency]?.label ?? h.frequency));
            headRow.appendChild(th);
        });
        const totalTh = el("th", "", "Yearly total");
        totalTh.style.textAlign = "right";
        headRow.appendChild(totalTh);
        matrixHead.appendChild(headRow);

        /* "set for all classes" shortcut row */
        const fillRow = document.createElement("tr");
        fillRow.className = "fill-row";
        fillRow.appendChild(el("td", "", "Set for all classes"));
        allHeads.forEach((h) => {
            const td = document.createElement("td");
            const wrap = el("div", "fill-cell");
            const input = el("input", "matrix-input");
            input.type = "number"; input.min = "0"; input.step = "0.01"; input.placeholder = "₹";
            const apply = actionButton("↓", "", () => {
                if (input.value === "") return;
                matrixBody.querySelectorAll(`input[data-head="${h.head_id}"]`).forEach((cellInput) => {
                    cellInput.value = input.value;
                    setCell(cellInput.dataset.cls, h.head_id, input.value, cellInput);
                });
            });
            apply.title = "Apply to every class";
            wrap.append(input, apply);
            td.appendChild(wrap);
            fillRow.appendChild(td);
        });
        fillRow.appendChild(el("td", ""));
        matrixBody.appendChild(fillRow);

        /* class rows */
        CLASSES.forEach(([cls, label]) => {
            const row = document.createElement("tr");
            row.appendChild(el("td", "", label));

            allHeads.forEach((h) => {
                const td = document.createElement("td");
                const input = el("input", "matrix-input");
                input.type = "number"; input.min = "0"; input.step = "0.01";
                input.dataset.cls = cls;
                input.dataset.head = h.head_id;
                input.value = currentText(key(cls, h.head_id));
                input.addEventListener("input", () => setCell(cls, h.head_id, input.value, input));
                td.appendChild(input);
                row.appendChild(td);
            });

            const total = el("td", "row-total", `₹${formatMoney(rowTotal(cls))}`);
            total.id = `total-${normClass(cls)}`;
            row.appendChild(total);
            matrixBody.appendChild(row);
        });
    }

    saveGridBtn?.addEventListener("click", async () => {
        const items = [];
        for (const [k, text] of draft) {
            if (!isChanged(k)) continue;
            const [cls, headId] = k.split("|");
            const amount = text === "" ? null : Number(text);
            if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
                alert(`Invalid amount for ${formatClass(cls)}. Use a number of zero or more.`);
                return;
            }
            items.push({ class_name: cls, head_id: Number(headId), amount });
        }
        if (!items.length) return;

        saveGridBtn.disabled = true;
        try {
            await parseResponse(await request(`${apiBase()}/fees/structures/bulk`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ academic_year: yearSelect.value, items })
            }));
            await loadStructures();
            renderMatrix();
            window.refreshPaymentRecord?.();
            alert("Fee structure saved.");
        } catch (error) {
            alert(`Unable to save fee structure: ${error.message}`);
            refreshDirtyState();
        }
    });

    yearSelect?.addEventListener("change", () => {
        setActiveAcademicYear(yearSelect.value, { checkDraft: true, source: "structure" });
    });

    paymentYearFilter?.addEventListener("change", () => {
        setActiveAcademicYear(paymentYearFilter.value, { checkDraft: true, source: "payment" });
    });

    $("copyYearBtn")?.addEventListener("click", async () => {
        const to = yearSelect.value;
        const from = yearLabel(Number(to.slice(0, 4)) - 1);
        if (!confirm(`Copy all amounts from ${from} into ${to}? Existing ${to} amounts will be overwritten.`)) return;
        try {
            await parseResponse(await request(`${apiBase()}/fees/structures/copy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from_year: from, to_year: to })
            }));
            await loadStructures();
            renderMatrix();
            window.refreshPaymentRecord?.();
        } catch (error) {
            alert(`Unable to copy fee structure: ${error.message}`);
        }
    });

    /* ======================================================================
       PAYMENTS
       ====================================================================== */
    function populateStudentDirectoryDropdown() {
        const select = $("payStudentSelect");
        if (!select) return;
        select.replaceChildren();

        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "-- Choose Student (Auto-fills details) --";
        select.appendChild(defaultOpt);

        allDirectoryStudents.forEach((s) => {
            const opt = document.createElement("option");
            opt.value = s.student_id;
            const cls = s.class ? `Class ${s.class}` : "No Class";
            const sec = s.section ? ` - Sec ${s.section}` : "";
            opt.textContent = `#${s.student_id} - ${s.full_name} (${cls}${sec})`;
            select.appendChild(opt);
        });
    }

    // Look up the amount for (class, head) in the active academic year
    function suggestAmount() {
        const headId = $("payFeeHead").value;
        const cls = $("payClass").value;
        const amountInput = $("payAmount");
        if (!headId || !cls) return;

        const year = getActiveAcademicYear();
        let match = allStructures.find((s) =>
            String(s.academic_year) === year &&
            normClass(s.class_name) === normClass(cls) &&
            Number(s.head_id) === Number(headId));

        if (!match) {
            const date = validDate(payDateInput.value) ? new Date(payDateInput.value) : new Date();
            const dateYear = yearLabel(academicYearStart(date));
            match = allStructures.find((s) =>
                String(s.academic_year) === dateYear &&
                normClass(s.class_name) === normClass(cls) &&
                Number(s.head_id) === Number(headId));
        }

        if (match && (!amountInput.value || amountInput.dataset.auto === "1")) {
            amountInput.value = match.amount;
            amountInput.dataset.auto = "1";
        }
    }

    function togglePeriodField() {
        const head = headById($("payFeeHead").value);
        const show = head?.frequency === "monthly";
        $("payPeriodGroup").classList.toggle("hidden", !show);
        if (show) {
            const select = $("payPeriod");
            const now = new Date();
            const want = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            if ([...select.options].some((o) => o.value === want) && !select.dataset.touched) {
                select.value = want;
            }
        }
    }

    $("payStudentSelect")?.addEventListener("change", (e) => {
        const studentId = Number(e.target.value);
        if (!studentId) return;
        const student = allDirectoryStudents.find((s) => Number(s.student_id) === studentId);
        if (!student) return;

        $("payStudentId").value = student.student_id;
        $("payStudentName").value = student.full_name;
        if (student.class) $("payClass").value = normClass(student.class);
        suggestAmount();
    });

    $("payFeeHead")?.addEventListener("change", () => {
        $("payAmount").dataset.auto = "1";
        $("payAmount").value = "";
        togglePeriodField();
        suggestAmount();
    });
    $("payClass")?.addEventListener("change", () => {
        if ($("payAmount").dataset.auto === "1") $("payAmount").value = "";
        suggestAmount();
    });
    $("payAmount")?.addEventListener("input", () => { $("payAmount").dataset.auto = "0"; });
    $("payPeriod")?.addEventListener("change", () => { $("payPeriod").dataset.touched = "1"; });

    function renderPayments() {
        if (!paymentsBody) return;

        paymentsBody.replaceChildren();

        const term = (searchInput?.value || "").toLowerCase().trim();
        const cls = normClass(classFilter?.value);
        const activeYear = paymentYearFilter?.value || getActiveAcademicYear();

        const filtered = allPayments.filter((p) => {
            const matchesSearch = [p.student_name, p.fee_type, p.payment_id, p.student_id]
                .some((v) => String(v ?? "").toLowerCase().includes(term));
            const matchesClass = !cls || normClass(p.class_name) === cls;
            const matchesYear = !activeYear || getPaymentAcademicYear(p) === activeYear;
            return matchesSearch && matchesClass && matchesYear;
        });

        if (!filtered.length) {
            setTableMessage(paymentsBody, 10, `No payment records found for Academic Year ${activeYear}.`);
            return;
        }

        filtered.forEach((p) => {
            const row = document.createElement("tr");

            const receipt = document.createElement("td");
            receipt.appendChild(el("strong", "", `#RC-${p.payment_id}`));
            row.appendChild(receipt);

            const receipt = document.createElement("td");
            receipt.appendChild(el("strong", "", `#RC-${p.payment_id}`));
            row.appendChild(receipt);

            // Receipt number.
            const receiptCell = addCell(
                row,
                p.payment_id == null
                    ? "—"
                    : `#RC-${p.payment_id}`
            );

            if (p.payment_id != null) {
                const receiptStrong = document.createElement("strong");
                receiptStrong.textContent = receiptCell.textContent;
                receiptCell.replaceChildren(receiptStrong);
            }

            // Student name and ID.
            const studentCell = document.createElement("td");
            studentCell.appendChild(el("strong", "", String(p.student_name ?? "—")));
            const sid = el("div", "", `ID: ${p.student_id ?? "—"}`);
            sid.style.fontSize = "11px";
            sid.style.color = "#888";
            studentCell.appendChild(sid);
            row.appendChild(studentCell);

            addCell(row, formatClass(p.class_name));
            addCell(row, p.fee_type ?? "—");
            addCell(row, formatPeriod(p.period));

            const amountCell = document.createElement("td");
            amountCell.appendChild(el("strong", "", `₹${formatMoney(p.amount_paid)}`));
            row.appendChild(amountCell);

            // Payment date.
            addCell(row, p.payment_date || "—");

            const modeCell = document.createElement("td");
            modeCell.appendChild(el("span", "badge-mode", p.payment_mode || "—"));
            row.appendChild(modeCell);

            const statusCell = document.createElement("td");
            const badge = el("span", "badge-status", p.status || "Paid");
            const statusClass = String(p.status || "paid").toLowerCase();
            if (/^[a-z0-9_-]+$/.test(statusClass)) badge.classList.add(statusClass);
            statusCell.appendChild(badge);
            row.appendChild(statusCell);

            const actionCell = document.createElement("td");
            const open = ["pending", "partial"].includes(String(p.status || "").toLowerCase());
            if (open) {
                actionCell.appendChild(actionButton("Collect", "collect-btn", () => openCollectModalForPayment(p)));
            } else {
                const done = el("span", "", "Completed");
                done.style.cssText = "color:#15803d;font-size:12px;font-weight:600";
                actionCell.appendChild(done);
            }
            row.appendChild(actionCell);

            paymentsBody.appendChild(row);
        });
    }

    function formatPeriod(period) {
        if (!/^\d{4}-\d{2}$/.test(String(period || ""))) return "—";
        const [y, m] = period.split("-").map(Number);
        return `${MONTHS[(m + 8) % 12].slice(0, 3)} ${y}`;
    }

    function openCollectModalForPayment(p) {
        $("collectModalTitle").textContent = "Collect Fee Payment";
        const ay = getPaymentAcademicYear(p) || getActiveAcademicYear();
        const modalYearEl = $("collectModalYearDisplay");
        if (modalYearEl) modalYearEl.textContent = ay;
        const startYear = parseInt(ay.split("-")[0], 10);
        fillPeriodSelect(isNaN(startYear) ? academicYearStart() : startYear);

        // A collection against an existing due is a NEW receipt.
        // Never overwrite the original payment transaction.
        $("editingPaymentId").value = "";
        $("payStudentId").value = p.student_id;
        $("payStudentName").value = p.student_name;
        $("payClass").value = normClass(p.class_name);
        $("payStudentSelect").value = p.student_id;

        const head = p.fee_head_id
            ? headById(p.fee_head_id)
            : allHeads.find((h) => h.name.toLowerCase() === String(p.fee_type || "").toLowerCase());
        $("payFeeHead").value = head ? head.head_id : "";
        togglePeriodField();
        if (p.period && $("payPeriod")) $("payPeriod").value = p.period;

        $("payAmount").value = "";
        $("payAmount").dataset.auto = "1";
        $("payStatus").value = "Paid";
        $("payRemarks").value = p.remarks || "";
        payDateInput.value = todayISO();
        collectModal.style.display = "flex";
    }

    $("openCollectFeeBtn")?.addEventListener("click", () => {
        $("collectModalTitle").textContent = "Record Fee Payment";
        const ay = getActiveAcademicYear();
        const modalYearEl = $("collectModalYearDisplay");
        if (modalYearEl) modalYearEl.textContent = ay;
        const startYear = parseInt(ay.split("-")[0], 10);
        fillPeriodSelect(isNaN(startYear) ? academicYearStart() : startYear);
        $("editingPaymentId").value = "";
        collectForm.reset();
        $("payAmount").dataset.auto = "1";
        delete $("payPeriod").dataset.touched;
        payDateInput.value = todayISO();
        togglePeriodField();
        collectModal.style.display = "flex";
    });

    const closeCollect = () => { collectModal.style.display = "none"; };
    $("closeCollectFeeBtn")?.addEventListener("click", closeCollect);
    $("cancelCollectFeeBtn")?.addEventListener("click", closeCollect);

    $("openAddHeadBtn")?.addEventListener("click", () => {
        showTab(2);
        openHeadModal();
    });
    $("closeHeadBtn")?.addEventListener("click", closeHeadModal);
    $("cancelHeadBtn")?.addEventListener("click", closeHeadModal);

    function value(id) {
        const field = $(id);

        if (!field) {
            throw new Error(`Required field missing: ${id}`);
        }

        return field.value.trim();
    }

    // Common form submission helper.
    async function submitForm(form, button, operation) {
        if (!form.reportValidity()) return;

        if (button) button.disabled = true;

        try {
            await operation();

        } catch (error) {
            console.error(error);
            alert(`Unable to complete request: ${error.message}`);

        } finally {
            if (button) button.disabled = false;
        }
    }

    // Record payment form.
    collectForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const button = collectForm.querySelector('button[type="submit"]');

        submitForm(collectForm, button, async () => {
            const amount = Number(value("payAmount"));
            const studentId = value("payStudentId");
            const paymentDate = value("payDate");
            const head = headById(value("payFeeHead"));

            if (!validId(studentId)) throw new Error("Enter a valid student ID.");
            if (!head) throw new Error("Select a fee type.");
            if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
            if (!validDate(paymentDate)) throw new Error("Enter a valid payment date.");

            const editId = $("editingPaymentId").value;
            const payload = {
                student_id: Number(studentId),
                student_name: value("payStudentName"),
                class_name: value("payClass"),
                fee_head_id: Number(head.head_id),
                fee_type: head.name,
                period: head.frequency === "monthly" ? value("payPeriod") : null,
                amount_paid: amount,
                payment_date: paymentDate,
                payment_mode: value("payMode"),
                status: value("payStatus"),
                remarks: value("payRemarks") || null
            };

            // Each collection is append-only and receives its own receipt.
            const url = `${apiBase()}/fees/payments`;

            await parseResponse(await request(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }));

            closeCollect();
            await loadPayments();
            updateKPIs();
            alert(editId ? "Payment collected successfully." : "Payment record saved.");
        });
    });

    window.deletePayment = async (id) => {
        if (!validId(id)) return alert("Invalid record ID.");
        if (!confirm(`Are you sure you want to delete payment receipt #${id}?`)) return;
        try {
            await parseResponse(await request(`${apiBase()}/fees/payments/${encodeURIComponent(id)}`, {
                method: "DELETE"
            }));
            await loadPayments();
            updateKPIs();
        } catch (error) {
            alert(`Unable to delete record: ${error.message}`);
        }
    };

    searchInput?.addEventListener("input", renderPayments);
    classFilter?.addEventListener("change", renderPayments);

    window.addEventListener("academicYearChanged", (e) => {
        const ay = e?.detail?.academic_year;
        if (ay && ay !== getActiveAcademicYear()) {
            setActiveAcademicYear(ay, { checkDraft: false, skipBackend: true });
        }
    });

    window.addEventListener("storage", (e) => {
        if (e.key === "school_academic_year" && e.newValue && e.newValue !== getActiveAcademicYear()) {
            setActiveAcademicYear(e.newValue, { checkDraft: false, skipBackend: true });
        }
    });

    /* ---------- init ---------- */
    fillClassSelects();
    fillPeriodSelect();
    fillYearSelects();
    if (yearSelect) yearSelect.dataset.prev = yearSelect.value;
    if (payDateInput && !payDateInput.value) payDateInput.value = todayISO();
    loadData();
});


/* ==========================================================
   CLASS-WISE PAYMENT RECORD
   ========================================================== */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const apiBase = () =>
        (window.API_BASE_URL || "http://127.0.0.1:8000")
            .replace(/\/+$/, "");

    const classView = document.getElementById("classPaymentView");
    const studentView = document.getElementById("studentPaymentView");

    const summaryContainer =
        document.getElementById("classPaymentSummary");

    const studentBody =
        document.getElementById("classStudentPaymentBody");

    const yearSelect =
        document.getElementById("paymentAcademicYear");

    if (!classView || !studentView || !summaryContainer) return;

    let selectedClass = null;

    const money = amount =>
        "₹" + Number(amount || 0).toLocaleString("en-IN", {
            maximumFractionDigits: 2
        });

    const displayClass = className => /^\d+$/.test(String(className || ""))
        ? `Class ${className}` : String(className || "—");

    async function apiFetch(url) {
        const response = await authenticatedFetch(
            apiBase() + url
        );

        if (!response.ok) {
            throw new Error("Unable to load payment records.");
        }

        return response.json();
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    async function loadClassPaymentSummary() {
        summaryContainer.innerHTML = '<tr><td colspan="6" class="table-loading">Loading class payment records...</td></tr>';

        try {
            const year = encodeURIComponent(yearSelect.value || localStorage.getItem("school_academic_year") || "2026-2027");

            const classes = await apiFetch(
                `/fees/payment-record/classes?academic_year=${year}`
            );

            if (!classes.length) {
                summaryContainer.innerHTML =
                    '<tr><td colspan="6" class="table-loading">No fee structure is configured for this academic year.</td></tr>';
                return;
            }

            summaryContainer.innerHTML = classes.map(item => `
                <tr data-class="${escapeHTML(item.class_name)}">
                    <td><strong>${escapeHTML(displayClass(item.class_name))}</strong></td>
                    <td>${item.total_students}</td>
                    <td>${money(item.payment_to_receive)}</td>
                    <td><strong class="received-amount">${money(item.received)}</strong></td>
                    <td><strong class="remaining-amount">${money(item.remaining)}</strong></td>
                    <td><button type="button" class="view-class-payments">View Students</button></td>
                </tr>`).join("");

            summaryContainer.querySelectorAll(
                ".view-class-payments"
            ).forEach(button => {
                button.addEventListener("click", () => {
                    openClass(button.closest("tr").dataset.class);
                });
            });

        } catch (error) {
            console.error(error);
            summaryContainer.innerHTML =
                '<tr><td colspan="6" class="table-loading">Unable to load class payment records.</td></tr>';
        }
    }

    async function openClass(className) {
        selectedClass = className;

        classView.style.display = "none";
        studentView.style.display = "block";

        document.getElementById("selectedPaymentClass")
            .textContent = "Class " + className;

        studentBody.innerHTML =
            '<tr><td colspan="6">Loading students...</td></tr>';

        try {
            const params = new URLSearchParams({
                class_name: className,
                academic_year: yearSelect.value
            });

            const students = await apiFetch(
                `/fees/payment-record/students?${params}`
            );

            let expected = 0;
            let received = 0;

            students.forEach(student => {
                expected += Number(student.total_fee || 0);
                received += Number(student.amount_received || 0);
            });

            document.getElementById("classExpectedTotal").textContent =
                money(expected);

            document.getElementById("classReceivedTotal").textContent =
                money(received);

            document.getElementById("classRemainingTotal").textContent =
                money(Math.max(expected - received, 0));

            if (!students.length) {
                studentBody.innerHTML =
                    '<tr><td colspan="6">No students found.</td></tr>';
                return;
            }

            studentBody.innerHTML = students.map(student => `
                <tr>
                    <td>
                        <strong>${escapeHTML(student.full_name)}</strong>
                    </td>
                    <td>${escapeHTML(student.admission_no || "—")}</td>

                    <td>${money(student.total_fee)}</td>

                    <td>${money(student.amount_received)}</td>

                    <td>${money(student.remaining)}</td>

                    <td><button type="button" class="view-student-fee-details" data-student-id="${escapeHTML(student.student_id)}">View Details</button></td>
                </tr>
            `).join("");

            studentBody.querySelectorAll(".view-student-fee-details").forEach(button => {
                button.addEventListener("click", () => openStudentDetails(button.dataset.studentId));
            });

        } catch (error) {
            console.error(error);
            studentBody.innerHTML =
                '<tr><td colspan="6">Unable to load student payments.</td></tr>';
        }
    }

    async function openStudentDetails(studentId) {
        const detail = document.getElementById("studentFeeDetail");
        detail.classList.remove("hidden");
        detail.textContent = "Loading fee breakdown...";
        try {
            const params = new URLSearchParams({ student_id: studentId, academic_year: yearSelect.value });
            const data = await apiFetch(`/fees/payment-record/student-details?${params}`);
            const heads = data.fee_heads.map(head => `<li>${escapeHTML(head.name)}: ${money(head.amount_due)} due · ${money(head.paid)} paid</li>`).join("");
            const payments = data.payments.length
                ? data.payments.map(payment => `<li>${escapeHTML(payment.payment_date)} — ${money(payment.amount)} (${escapeHTML(payment.payment_mode || "Payment")})</li>`).join("")
                : "<li>No successful payments recorded.</li>";
            detail.innerHTML = `<h4>${escapeHTML(data.student_name)} — Fee Details</h4><strong>Fee heads</strong><ul>${heads || "<li>No fee heads configured.</li>"}</ul><strong>Payment history</strong><ul>${payments}</ul>`;
        } catch (error) {
            detail.textContent = "Unable to load this student's fee details.";
        }
    }

    document.getElementById("backToClasses")
        .addEventListener("click", () => {
            studentView.style.display = "none";
            classView.style.display = "block";
            selectedClass = null;
            loadClassPaymentSummary();
        });

    yearSelect.addEventListener("change", () => {
        if (selectedClass) {
            openClass(selectedClass);
        } else {
            loadClassPaymentSummary();
        }
    });

    // Refresh after fee collection or payment deletion.
    window.refreshPaymentRecord = async function () {
        await loadClassPaymentSummary();

        if (selectedClass) {
            await openClass(selectedClass);
        }
    };

    const activeYear = localStorage.getItem("school_academic_year");
    if (activeYear && [...yearSelect.options].some(option => option.value === activeYear)) {
        yearSelect.value = activeYear;
    }
    window.addEventListener("academicYearChanged", (event) => {
        const year = event.detail?.academic_year;
        if (year && [...yearSelect.options].some(option => option.value === year)) {
            yearSelect.value = year;
            selectedClass ? openClass(selectedClass) : loadClassPaymentSummary();
        }
    });
    loadClassPaymentSummary();

});
