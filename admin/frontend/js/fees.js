/* Fees overview: first delivery of the fee-management page. */
(() => {
    "use strict";
    const yearSelect = document.getElementById("overviewAcademicYear");
    const errorBox = document.getElementById("overviewError");
    const overviewPanel = document.getElementById("panelOverview");
    const studentsPanel = document.getElementById("panelStudents");
    const studentsTab = document.getElementById("tabStudents");
    const paymentsPanel = document.getElementById("panelPayments");
    const overviewTab = document.getElementById("tabOverview");
    const paymentsTab = document.getElementById("tabPayments");
    const structurePanel = document.getElementById("panelStructure");
    const headsPanel = document.getElementById("panelHeads");
    const structureTab = document.getElementById("tabStructure");
    const headsTab = document.getElementById("tabHeads");
    const feeHeadDialog = document.getElementById("feeHeadDialog");
    const FREQUENCIES = { monthly: ["Monthly", 12], quarterly: ["Quarterly", 4], half_yearly: ["Half-yearly", 2], yearly: ["Yearly", 1], one_time: ["One-time", 1] };
    const CLASSES = [["KIDSCARE", "Kids Care"], ["NUR", "NUR"], ["LKG", "LKG"], ["UKG", "UKG"], ...Array.from({ length: 12 }, (_, index) => [String(index + 1), `Class ${index + 1}`])];
    let feeHeads = [];
    let feeStructures = [];
    const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

    function academicYearStart(date = new Date()) {
        return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    }

    function populateYears() {
        const current = academicYearStart();
        for (let year = current - 1; year <= current + 1; year += 1) {
            const option = document.createElement("option");
            option.value = `${year}-${year + 1}`;
            option.textContent = `Academic Year ${option.value}`;
            yearSelect.appendChild(option);
        }
        const saved = localStorage.getItem("school_academic_year");
        yearSelect.value = /^\d{4}-\d{4}$/.test(saved || "") ? saved : `${current}-${current + 1}`;
    }

    function renderBars(months) {
        const chart = document.getElementById("collectionChart");
        chart.replaceChildren();
        const max = Math.max(...months.map(item => Number(item.amount || 0)), 1);
        months.forEach(item => {
            const column = document.createElement("div");
            column.className = "bar-column";
            const value = document.createElement("span"); value.className = "bar-value"; value.textContent = money(item.amount);
            const bar = document.createElement("div"); bar.className = "bar"; bar.style.height = `${Math.max(Number(item.amount || 0) ? 8 : 2, (Number(item.amount || 0) / max) * 100)}%`;
            const label = document.createElement("span"); label.className = "bar-label"; label.textContent = item.label;
            column.append(value, bar, label); chart.appendChild(column);
        });
    }

    function renderStatuses(statuses) {
        const entries = [["Paid", "#617052"], ["Partial", "#d49b3a"], ["Pending", "#c55a52"]].map(([name, color]) => ({ name, color, count: Number(statuses[name] || 0) }));
        const total = entries.reduce((sum, entry) => sum + entry.count, 0);
        let progress = 0;
        const stops = entries.map(entry => { const start = progress; progress += total ? entry.count / total * 100 : 0; return `${entry.color} ${start}% ${progress}%`; }).join(", ");
        document.getElementById("statusDonut").style.background = total ? `conic-gradient(${stops})` : "#e8ebe5";
        document.getElementById("statusTotal").textContent = total;
        const legend = document.getElementById("statusLegend"); legend.replaceChildren();
        entries.forEach(entry => { const item = document.createElement("li"); item.innerHTML = `<span style="background:${entry.color}"></span>${entry.name}<strong>${entry.count}</strong>`; legend.appendChild(item); });
    }

    function render(data) {
        const summary = data.summary || {};
        document.getElementById("totalCollected").textContent = money(summary.collected);
        document.getElementById("outstandingAmount").textContent = money(summary.outstanding);
        document.getElementById("totalTransactions").textContent = Number(summary.transactions || 0).toLocaleString("en-IN");
        document.getElementById("billedAmount").textContent = `${money(summary.billed)} billed`;
        renderBars(data.monthly_collections || []);
        renderStatuses(data.payment_statuses || {});
    }

    async function loadOverview() {
        errorBox.hidden = true;
        try {
            const response = await window.authenticatedFetch(`/fees/overview?academic_year=${encodeURIComponent(yearSelect.value)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Unable to load fee overview.");
            render(data);
        } catch (error) {
            console.error("Unable to load fee overview:", error);
            errorBox.textContent = "Unable to load fee information. Please try again.";
            errorBox.hidden = false;
            render({ summary: {}, monthly_collections: [], payment_statuses: {} });
        }
    }

    function renderPaymentRecords(data) {
        const summary = data.summary || {};
        document.getElementById("paymentRevenue").textContent = money(summary.revenue);
        document.getElementById("paymentCollected").textContent = money(summary.collected);
        document.getElementById("paymentTransactions").textContent = Number(summary.transactions || 0).toLocaleString("en-IN");
        const body = document.getElementById("paymentRecordsBody");
        body.replaceChildren();
        (data.classes || []).forEach(record => {
            const row = document.createElement("tr");
            [record.class_name, record.total_students, money(record.total_fee), money(record.received_amount), money(record.remaining_amount)].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
            });
            const action = document.createElement("td");
            const button = document.createElement("button");
            button.type = "button"; button.className = "view-students-btn"; button.textContent = "View Students";
            button.addEventListener("click", () => {
                const query = new URLSearchParams({ class: record.class_key, academic_year: yearSelect.value });
                window.location.href = `fee_class_students.html?${query.toString()}`;
            });
            action.appendChild(button); row.appendChild(action); body.appendChild(row);
        });
    }

    async function loadPaymentRecords() {
        const recordsError = document.getElementById("paymentRecordsError");
        recordsError.hidden = true;
        try {
            const response = await window.authenticatedFetch(`/fees/payment-records?academic_year=${encodeURIComponent(yearSelect.value)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Unable to load payment records.");
            renderPaymentRecords(data);
        } catch (error) {
            console.error("Unable to load payment records:", error);
            recordsError.textContent = `Unable to load payment records: ${error.message}`;
            recordsError.hidden = false;
            renderPaymentRecords({ summary: {}, classes: CLASSES.map(([class_key, class_name]) => ({ class_key, class_name, total_students: 0, total_fee: 0, received_amount: 0, remaining_amount: 0 })) });
        }
    }

    async function feeRequest(url, options) {
        const response = await window.authenticatedFetch(url, options);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Unable to complete the request.");
        return data;
    }

    async function loadFeeHeads() {
        feeHeads = await feeRequest(`/fees/heads?academic_year=${encodeURIComponent(yearSelect.value)}`);
        return feeHeads;
    }

    async function loadFeeStructures() {
        feeStructures = await feeRequest(`/fees/structures?academic_year=${encodeURIComponent(yearSelect.value)}`);
        return feeStructures;
    }

    function openFeeHeadDialog(head) {
        document.getElementById("feeHeadForm").reset();
        document.getElementById("editingFeeHeadId").value = head ? head.head_id : "";
        document.getElementById("feeHeadDialogTitle").textContent = head ? "Edit Fee Head" : "Add Fee Head";
        if (head) {
            document.getElementById("feeHeadName").value = head.name || "";
            document.getElementById("feeHeadFrequency").value = head.frequency || "monthly";
            document.getElementById("feeHeadDueDay").value = head.due_day || "";
            document.getElementById("feeHeadDescription").value = head.description || "";
        }
        feeHeadDialog.showModal();
    }

    function renderFeeHeads() {
        const body = document.getElementById("feeHeadsBody");
        body.replaceChildren();
        if (!feeHeads.length) {
            const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 5; cell.textContent = "No fee heads yet. Add one to begin building the fee structure."; row.appendChild(cell); body.appendChild(row); return;
        }
        feeHeads.forEach(head => {
            const row = document.createElement("tr");
            [head.name, FREQUENCIES[head.frequency]?.[0] || head.frequency, head.due_day ? `${head.due_day}th of month` : "—", head.description || "—"].forEach(value => { const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell); });
            const actions = document.createElement("td");
            const edit = document.createElement("button"); edit.type = "button"; edit.className = "head-action-btn"; edit.textContent = "Edit"; edit.addEventListener("click", () => openFeeHeadDialog(head));
            const remove = document.createElement("button"); remove.type = "button"; remove.className = "head-action-btn delete-head-btn"; remove.textContent = "Delete"; remove.addEventListener("click", async () => {
                if (!window.confirm(`Delete ${head.name}? Its fee-structure amounts will also be removed.`)) return;
                try { await feeRequest(`/fees/heads/${encodeURIComponent(head.head_id)}?academic_year=${encodeURIComponent(yearSelect.value)}`, { method: "DELETE" }); await loadFeeHeads(); renderFeeHeads(); } catch (error) { alert(error.message); }
            });
            actions.append(edit, remove); row.appendChild(actions); body.appendChild(row);
        });
    }

    function lookupAmount(className, headId) {
        const match = feeStructures.find(item => String(item.class_name).toUpperCase() === className && Number(item.head_id) === Number(headId));
        return match ? Number(match.amount || 0) : "";
    }

    function renderStructure() {
        const head = document.getElementById("structureTableHead");
        const body = document.getElementById("structureTableBody");
        head.replaceChildren(); body.replaceChildren();
        if (!feeHeads.length) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.textContent = "Add a fee head first, then set class-wise amounts here."; row.appendChild(cell); body.appendChild(row); return; }
        const headerRow = document.createElement("tr");
        const classHeader = document.createElement("th"); classHeader.textContent = "Class"; headerRow.appendChild(classHeader);
        feeHeads.forEach(feeHead => { const cell = document.createElement("th"); cell.textContent = feeHead.name; const sub = document.createElement("small"); sub.textContent = FREQUENCIES[feeHead.frequency]?.[0] || feeHead.frequency; cell.appendChild(sub); headerRow.appendChild(cell); });
        const totalHeader = document.createElement("th"); totalHeader.textContent = "Yearly Total"; headerRow.appendChild(totalHeader); head.appendChild(headerRow);
        const fillRow = document.createElement("tr"); fillRow.className = "set-all-row"; const fillTitle = document.createElement("td"); fillTitle.textContent = "Set for all classes"; fillRow.appendChild(fillTitle);
        feeHeads.forEach(feeHead => { const cell = document.createElement("td"); const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.step = "0.01"; input.placeholder = "₹"; const apply = document.createElement("button"); apply.type = "button"; apply.textContent = "↓"; apply.title = "Apply to all classes"; apply.addEventListener("click", () => { if (input.value === "") return; body.querySelectorAll(`input[data-head-id="${feeHead.head_id}"]`).forEach(field => { field.value = input.value; updateStructureTotal(field.closest("tr")); }); }); cell.append(input, apply); fillRow.appendChild(cell); });
        fillRow.appendChild(document.createElement("td")); body.appendChild(fillRow);
        CLASSES.forEach(([className, label]) => { const row = document.createElement("tr"); row.dataset.className = className; const name = document.createElement("td"); name.textContent = label; row.appendChild(name); feeHeads.forEach(feeHead => { const cell = document.createElement("td"); const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.step = "0.01"; input.value = lookupAmount(className, feeHead.head_id); input.dataset.headId = feeHead.head_id; input.addEventListener("input", () => updateStructureTotal(row)); cell.appendChild(input); row.appendChild(cell); }); const total = document.createElement("td"); total.className = "structure-row-total"; row.appendChild(total); updateStructureTotal(row); body.appendChild(row); });
    }

    function updateStructureTotal(row) {
        const total = feeHeads.reduce((sum, feeHead) => { const input = row.querySelector(`input[data-head-id="${feeHead.head_id}"]`); return sum + Number(input?.value || 0) * (FREQUENCIES[feeHead.frequency]?.[1] || 1); }, 0);
        row.querySelector(".structure-row-total").textContent = money(total);
    }

    async function showStructure() {
        try { await Promise.all([loadFeeHeads(), loadFeeStructures()]); renderStructure(); } catch (error) { alert(error.message); }
    }

    async function showHeads() {
        const errorBox = document.getElementById("feeHeadsError"); errorBox.hidden = true;
        try { await loadFeeHeads(); renderFeeHeads(); } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
    }

    function activateTab(tab) {
        const panels = { overview: overviewPanel, students: studentsPanel, payments: paymentsPanel, structure: structurePanel, heads: headsPanel };
        const tabs = { overview: overviewTab, students: studentsTab, payments: paymentsTab, structure: structureTab, heads: headsTab };
        Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== tab; tabs[name].classList.toggle("active", name === tab); tabs[name].setAttribute("aria-selected", String(name === tab)); });
        if (tab === "payments") loadPaymentRecords();
        if (tab === "students") {
            if (typeof window.loadFeeStudents === "function") {
                window.loadFeeStudents(yearSelect.value);
            } else {
                const box = document.getElementById("studentsTabError");
                box.textContent = "The Students list could not start: fees_students.js did not load. Check that it is in the js folder and named exactly fees_students.js.";
                box.hidden = false;
            }
        }
        if (tab === "structure") showStructure();
        if (tab === "heads") showHeads();
    }

    populateYears();
    yearSelect.addEventListener("change", () => { localStorage.setItem("school_academic_year", yearSelect.value); loadOverview(); if (!paymentsPanel.hidden) loadPaymentRecords(); if (!structurePanel.hidden) showStructure(); if (!headsPanel.hidden) showHeads(); if (!studentsPanel.hidden) window.loadFeeStudents?.(yearSelect.value);});
    overviewTab.addEventListener("click", () => activateTab("overview"));
    studentsTab.addEventListener("click", () => activateTab("students"));
    paymentsTab.addEventListener("click", () => activateTab("payments"));
    structureTab.addEventListener("click", () => activateTab("structure"));
    headsTab.addEventListener("click", () => activateTab("heads"));
    document.getElementById("addFeeHeadBtn").addEventListener("click", () => openFeeHeadDialog());
    document.getElementById("closeFeeHeadDialog").addEventListener("click", () => feeHeadDialog.close());
    document.getElementById("cancelFeeHeadDialog").addEventListener("click", () => feeHeadDialog.close());
    document.getElementById("feeHeadForm").addEventListener("submit", async event => {
        event.preventDefault();
        const editId = document.getElementById("editingFeeHeadId").value;
        const dueDay = document.getElementById("feeHeadDueDay").value;
        const payload = { name: document.getElementById("feeHeadName").value.trim(), frequency: document.getElementById("feeHeadFrequency").value, due_day: dueDay ? Number(dueDay) : null, description: document.getElementById("feeHeadDescription").value.trim() || null };
        try {
            await feeRequest(editId ? `/fees/heads/${encodeURIComponent(editId)}?academic_year=${encodeURIComponent(yearSelect.value)}` : `/fees/heads?academic_year=${encodeURIComponent(yearSelect.value)}`, { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            feeHeadDialog.close(); await showHeads();
        } catch (error) { alert(error.message); }
    });
    document.getElementById("saveStructureBtn").addEventListener("click", async () => {
        const items = [];
        document.querySelectorAll("#structureTableBody tr[data-class-name]").forEach(row => {
            feeHeads.forEach(feeHead => { const field = row.querySelector(`input[data-head-id="${feeHead.head_id}"]`); items.push({ class_name: row.dataset.className, head_id: feeHead.head_id, amount: field.value === "" ? null : Number(field.value) }); });
        });
        if (!items.length) return;
        try { await feeRequest("/fees/structures/bulk", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ academic_year: yearSelect.value, items }) }); await showStructure(); alert("Fee structure saved."); } catch (error) { alert(error.message); }
    });
    const initialTab = new URLSearchParams(window.location.search).get("tab");
    if (["students", "payments", "structure", "heads"].includes(initialTab)) {
        activateTab(initialTab);
    } else {
        loadOverview();
    }
})();