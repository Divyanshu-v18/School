
/* ==========================================================================
   FEES MANAGEMENT
   Payment records, fee structures, collection, and deletion.
   Requires api.js with authenticatedFetch().
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    let allPayments = [];
    let allStructures = [];

    const tabPaymentsBtn = $("tabPaymentsBtn");
    const tabStructuresBtn = $("tabStructuresBtn");
    const panelPayments = $("panelPayments");
    const panelStructures = $("panelStructures");
    const kpiCollected = $("totalCollectedVal");
    const kpiTxns = $("totalTransactionsVal");
    const kpiStructures = $("totalStructuresVal");
    const searchInput = $("paymentSearchInput");
    const classFilter = $("paymentClassFilter");
    const paymentsBody = $("paymentsTableBody");
    const structuresBody = $("structuresTableBody");

    const collectModal = $("collectFeeModal");
    const openCollectBtn = $("openCollectFeeBtn");
    const closeCollectBtn = $("closeCollectFeeBtn");
    const cancelCollectBtn = $("cancelCollectFeeBtn");
    const collectForm = $("collectFeeForm");

    const structureModal = $("addStructureModal");
    const openStructureBtn = $("openAddStructureBtn");
    const closeStructureBtn = $("closeAddStructureBtn");
    const cancelStructureBtn = $("cancelAddStructureBtn");
    const structureForm = $("addStructureForm");
    const payDateInput = $("payDate");

    const apiBase = () =>
        (window.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

    if (payDateInput && !payDateInput.value) {
        const d = new Date();
        payDateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

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
        const d = new Date(`${value}T00:00:00`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
    }

    async function parseResponse(response) {
        let data = {};
        try {
            data = await response.json();
        } catch (_) {}
        if (!response.ok) {
            throw new Error(typeof data.detail === "string"
                ? data.detail
                : `Request failed (HTTP ${response.status}).`);
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

    tabPaymentsBtn?.addEventListener("click", () => {
        tabPaymentsBtn.classList.add("active");
        tabStructuresBtn?.classList.remove("active");
        if (panelPayments) panelPayments.style.display = "block";
        if (panelStructures) panelStructures.style.display = "none";
    });

    tabStructuresBtn?.addEventListener("click", () => {
        tabStructuresBtn.classList.add("active");
        tabPaymentsBtn?.classList.remove("active");
        if (panelPayments) panelPayments.style.display = "none";
        if (panelStructures) panelStructures.style.display = "block";
    });

    async function loadData() {
        await Promise.all([loadPayments(), loadStructures()]);
        updateKPIs();
    }

    async function loadPayments() {
        try {
            const response = await request(`${apiBase()}/fees/payments`);
            const data = await parseResponse(response);
            if (!Array.isArray(data)) throw new Error("Unexpected payments response.");
            allPayments = data;
            renderPayments();
        } catch (error) {
            console.error("Load payments error:", error);
            setTableMessage(paymentsBody, 9, "Failed to load payments. Check your session and backend.");
        }
    }

    async function loadStructures() {
        try {
            const response = await request(`${apiBase()}/fees/structures`);
            const data = await parseResponse(response);
            if (!Array.isArray(data)) throw new Error("Unexpected fee structures response.");
            allStructures = data;
            renderStructures();
        } catch (error) {
            console.error("Load structures error:", error);
            setTableMessage(structuresBody, 6, "Failed to load fee structures.");
        }
    }

    function formatMoney(value) {
        const amount = Number(value);
        return Number.isFinite(amount) ? amount.toLocaleString("en-IN", {
            maximumFractionDigits: 2
        }) : "—";
    }

    function renderPayments() {
        if (!paymentsBody) return;
        paymentsBody.replaceChildren();

        const term = (searchInput?.value || "").toLowerCase().trim();
        const cls = classFilter?.value || "";
        const filtered = allPayments.filter((p) =>
            [p.student_name, p.fee_type, p.payment_id, p.student_id]
                .some((v) => String(v ?? "").toLowerCase().includes(term)) &&
            (!cls || String(p.class_name) === cls)
        );

        if (!filtered.length) {
            setTableMessage(paymentsBody, 9, "No payment records found.");
            return;
        }

        filtered.forEach((p) => {
            const row = document.createElement("tr");
            addCell(row, `#RC-${p.payment_id}`).innerHTML = `<strong></strong>`;
            row.cells[0].firstElementChild.textContent = `#RC-${p.payment_id}`;

            const studentCell = document.createElement("td");
            const name = document.createElement("strong");
            name.textContent = String(p.student_name ?? "—");
            const studentId = document.createElement("div");
            studentId.style.fontSize = "11px";
            studentId.style.color = "#888";
            studentId.textContent = `ID: ${p.student_id ?? "—"}`;
            studentCell.append(name, studentId);
            row.appendChild(studentCell);

            addCell(row, `Class ${p.class_name ?? "—"}`);
            addCell(row, p.fee_type ?? "—");

            const amountCell = addCell(row, `₹${formatMoney(p.amount_paid)}`);
            const amountStrong = document.createElement("strong");
            amountStrong.textContent = amountCell.textContent;
            amountCell.replaceChildren(amountStrong);

            addCell(row, p.payment_date || "—");
            const modeCell = addCell(row, p.payment_mode || "—");
            modeCell.firstChild && (modeCell.className = "badge-mode");

            const statusCell = addCell(row, p.status || "Paid");
            statusCell.className = "badge-status";
            const statusClass = String(p.status || "paid").toLowerCase();
            if (/^[a-z0-9_-]+$/.test(statusClass)) statusCell.classList.add(statusClass);

            const actionCell = document.createElement("td");
            actionCell.appendChild(actionButton("Delete", "delete-btn", () => deletePayment(p.payment_id)));
            row.appendChild(actionCell);
            paymentsBody.appendChild(row);
        });
    }

    function renderStructures() {
        if (!structuresBody) return;
        structuresBody.replaceChildren();

        if (!allStructures.length) {
            setTableMessage(structuresBody, 6, "No fee structures defined yet.");
            return;
        }

        allStructures.forEach((s) => {
            const row = document.createElement("tr");
            addCell(row, `Class ${s.class_name ?? "—"}`);
            addCell(row, s.fee_type ?? "—");
            addCell(row, `₹${formatMoney(s.amount)}`);
            addCell(row, s.academic_year ?? "—");
            addCell(row, s.due_date || "N/A");
            const actionCell = document.createElement("td");
            actionCell.appendChild(actionButton("Delete", "delete-btn", () => deleteStructure(s.fee_id)));
            row.appendChild(actionCell);
            structuresBody.appendChild(row);
        });
    }

    function updateKPIs() {
        const total = allPayments.reduce((sum, p) => {
            const amount = Number(p.amount_paid);
            return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);
        if (kpiCollected) kpiCollected.textContent = `₹${formatMoney(total)}`;
        if (kpiTxns) kpiTxns.textContent = String(allPayments.length);
        if (kpiStructures) kpiStructures.textContent = String(allStructures.length);
    }

    function openModal(modal, form) {
        form?.reset();
        if (modal) modal.style.display = "flex";
    }
    function closeModal(modal) {
        if (modal) modal.style.display = "none";
    }

    openCollectBtn?.addEventListener("click", () => openModal(collectModal, collectForm));
    closeCollectBtn?.addEventListener("click", () => closeModal(collectModal));
    cancelCollectBtn?.addEventListener("click", () => closeModal(collectModal));
    openStructureBtn?.addEventListener("click", () => openModal(structureModal, structureForm));
    closeStructureBtn?.addEventListener("click", () => closeModal(structureModal));
    cancelStructureBtn?.addEventListener("click", () => closeModal(structureModal));

    function value(id) {
        const field = $(id);
        if (!field) throw new Error(`Required field missing: ${id}`);
        return field.value.trim();
    }

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

    collectForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const button = collectForm.querySelector('button[type="submit"], input[type="submit"]');

        submitForm(collectForm, button, async () => {
            const amount = Number(value("payAmount"));
            const studentId = value("payStudentId");
            const paymentDate = value("payDate");

            if (!validId(studentId)) throw new Error("Enter a valid student ID.");
            if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
            if (!validDate(paymentDate)) throw new Error("Enter a valid payment date.");

            const payload = {
                student_id: Number(studentId),
                student_name: value("payStudentName"),
                class_name: value("payClass"),
                fee_type: value("payFeeType"),
                amount_paid: amount,
                payment_date: paymentDate,
                payment_mode: value("payMode"),
                status: value("payStatus"),
                remarks: value("payRemarks") || null
            };

            await parseResponse(await request(`${apiBase()}/fees/payments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }));

            closeModal(collectModal);
            await loadPayments();
            updateKPIs();
            alert("Payment record saved.");
        });
    });

    structureForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const button = structureForm.querySelector('button[type="submit"], input[type="submit"]');

        submitForm(structureForm, button, async () => {
            const amount = Number(value("strAmount"));
            const dueDate = value("strDue");

            if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a fee amount greater than zero.");
            if (dueDate && !validDate(dueDate)) throw new Error("Enter a valid due date.");

            const payload = {
                class_name: value("strClass"),
                fee_type: value("strType"),
                amount,
                academic_year: value("strYear"),
                due_date: dueDate || null
            };

            await parseResponse(await request(`${apiBase()}/fees/structures`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }));

            closeModal(structureModal);
            await loadStructures();
            updateKPIs();
            alert("Fee structure saved.");
        });
    });

    async function deleteRecord(path, id, label, reload) {
        if (!validId(id)) return alert("Invalid record ID.");
        if (!confirm(`Are you sure you want to delete ${label}?`)) return;

        try {
            await parseResponse(await request(`${apiBase()}${path}/${encodeURIComponent(id)}`, {
                method: "DELETE"
            }));
            await reload();
            updateKPIs();
        } catch (error) {
            alert(`Unable to delete record: ${error.message}`);
        }
    }

    window.deletePayment = (id) =>
        deleteRecord("/fees/payments", id, `payment receipt #${id}`, loadPayments);
    window.deleteStructure = (id) =>
        deleteRecord("/fees/structures", id, "this fee structure", loadStructures);

    searchInput?.addEventListener("input", renderPayments);
    classFilter?.addEventListener("change", renderPayments);

    loadData();
});
