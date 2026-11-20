/* Dedicated Salary > Staff detail page. */
(() => {
    "use strict";
    const $ = id => document.getElementById(id);
    const params = new URLSearchParams(window.location.search);
    const staffKey = params.get("staff_key") || "";
    const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const showDate = iso => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return match ? `${match[3]}-${match[2]}-${match[1]}` : "—"; };
    const todayIso = () => new Date().toISOString().slice(0, 10);
    let currentData = null, payPeriod = null;

    function node(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }
    function error(message) {
        const box = $("salaryDetailError");
        box.textContent = message; box.hidden = !message;
    }
    async function getJson(path) {
        const response = await window.authenticatedFetch(path);
        let data = null;
        try { data = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Unable to load salary details.");
        return data;
    }
    async function send(path, body) {
        const response = await window.authenticatedFetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        let data = null;
        try { data = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Unable to record salary payment.");
        return data;
    }
    function infoItem(label, value, accent) {
        const item = node("div", "sal-info-item");
        item.append(node("span", "sal-info-label", label), node("strong", accent || "", value || "—"));
        return item;
    }
    function renderItems(target, items, emptyText, total) {
        target.replaceChildren();
        if (items.length) items.forEach(item => target.append(infoItem(item.name, money(item.amount))));
        else target.append(infoItem(emptyText, ""));
        if (total) target.append(infoItem(total.label, money(total.amount), total.accent));
    }
    function status(text) { return node("span", `sal-badge ${String(text || "").toLowerCase().replace(/\s+/g, "-")}`, text || "—"); }

    function academicYear() {
        const now = new Date();
        const defaultStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const requested = params.get("academic_year") || localStorage.getItem("school_academic_year") || "";
        return /^\d{4}-\d{4}$/.test(requested) ? requested : `${defaultStart}-${defaultStart + 1}`;
    }
    function salaryMonths(year) {
        const start = Number(year.slice(0, 4));
        const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return Array.from({ length: 12 }, (_, index) => {
            const month = ((index + 3) % 12) + 1;
            const dateYear = index < 9 ? start : start + 1;
            return { period: `${dateYear}-${String(month).padStart(2, "0")}`, label: `${names[month - 1]} ${dateYear}`, dateYear, month };
        });
    }
    function salarySchedule(data) {
        const year = academicYear();
        const now = new Date();
        const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const payments = new Map((data.history || []).filter(item => item.status === "Paid").map(item => [item.period, item]));
        const configured = Number(data.net) > 0;
        const pending = [], upcoming = [];
        const schedule = salaryMonths(year).map(month => {
            const payment = payments.get(month.period);
            if (payment) return { ...month, status: "Paid", payment, gross: payment.gross_salary, deductions: payment.deductions, net: payment.net_pay };
            const state = month.period <= currentPeriod ? "Pending" : "Upcoming";
            const item = { ...month, status: state, gross: data.gross, deductions: data.total_deductions, net: data.net };
            if (configured && state === "Pending") pending.push(item);
            if (configured && state === "Upcoming") upcoming.push(item);
            return item;
        });
        const total = rows => rows.reduce((sum, row) => sum + Number(row?.net || 0), 0);
        $("pendingSalary").textContent = money(total(pending));
        $("upcomingSalary").textContent = money(total(upcoming));
        $("pendingSalaryNote").textContent = configured ? `${pending.length} unpaid month${pending.length === 1 ? "" : "s"} in ${year}` : "Set a salary structure first";
        $("upcomingSalaryNote").textContent = configured ? `${upcoming.length} future month${upcoming.length === 1 ? "" : "s"} in ${year}` : "Set a salary structure first";
        renderMonthlySchedule(schedule, configured);
    }
    function renderMonthlySchedule(rows, configured) {
        const body = $("salaryScheduleBody"); body.replaceChildren();
        rows.forEach(item => {
            const row = document.createElement("tr");
            const payment = item.payment;
            const hasSalary = configured || Boolean(payment);
            [item.label, hasSalary ? money(item.gross) : "—", hasSalary ? money(item.deductions) : "—", hasSalary ? money(item.net) : "—"]
                .forEach((value, index) => row.appendChild(node("td", [1, 2, 3].includes(index) ? "num" : "", value)));
            const state = document.createElement("td"); state.appendChild(status(hasSalary ? item.status : "No salary set")); row.appendChild(state);
            row.appendChild(node("td", "", payment ? showDate(payment.payment_date) : "—"));
            row.appendChild(node("td", "", payment?.payment_mode || "—"));
            const action = document.createElement("td");
            if (configured) {
                const button = node("button", "view-students-btn", payment ? "Update" : "Pay");
                button.type = "button"; button.addEventListener("click", () => openPayDialog(item)); action.appendChild(button);
            } else action.textContent = "—";
            row.appendChild(action); body.appendChild(row);
        });
    }
    function history(rows) {
        const body = $("salaryHistoryBody"); body.replaceChildren();
        if (!rows.length) {
            const row = document.createElement("tr"), cell = document.createElement("td");
            cell.colSpan = 8; cell.textContent = "No salary payment history found for this staff member."; row.appendChild(cell); body.appendChild(row); return;
        }
        rows.forEach(payment => {
            const row = document.createElement("tr");
            [payment.month, showDate(payment.payment_date), money(payment.gross_salary), money(payment.deductions), money(payment.net_pay), payment.payment_mode || "—", payment.reference_no || "—"]
                .forEach((value, index) => row.appendChild(node("td", [2, 3, 4].includes(index) ? "num" : "", value)));
            const state = document.createElement("td"); state.appendChild(status(payment.status)); row.appendChild(state); body.appendChild(row);
        });
    }
    function openPayDialog(item) {
        if (!currentData) return;
        payPeriod = item.period;
        const bank = currentData.bank || {};
        $("detailPayForm").reset();
        const editing = item.status === "Paid";
        $("detailPayTitle").textContent = `${editing ? "Update payment" : "Pay salary"} · ${item.label}`;
        $("detailPaySubmit").textContent = editing ? "Save changes" : "Mark as paid";
        $("detailPaySummary").textContent = `${currentData.full_name} · ${item.label} · Net salary ${money(item.net)}` +
            (bank.payment_mode ? ` · Suggested mode: ${bank.payment_mode}` : "");
        $("detailPayDate").value = editing && item.payment?.payment_date ? item.payment.payment_date : todayIso();
        $("detailPayDate").max = todayIso();
        if (bank.payment_mode && [...$("detailPayMode").options].some(option => option.value === bank.payment_mode)) {
            $("detailPayMode").value = bank.payment_mode;
        }
        if (editing) {
            if (item.payment?.payment_mode) $("detailPayMode").value = item.payment.payment_mode;
            $("detailPayRef").value = item.payment?.reference_no || "";
            $("detailPayRemarks").value = item.payment?.remarks || "";
        }
        $("detailPayDialog").showModal();
    }
    async function loadDetails() {
        try {
            currentData = await getJson(`/salary/staff/${encodeURIComponent(staffKey)}`);
            error(""); render(currentData);
        } catch (err) { console.error(err); error(err.message); }
    }
    function render(data) {
        $("staffName").textContent = data.full_name || "Staff Salary Details";
        $("staffMeta").textContent = `${data.post || "Staff"} · ${data.section === "non_teaching" ? "Non-teaching" : "Teaching"} · ID ${data.staff_id || "—"}`;
        document.title = `${data.full_name || "Staff"} Salary Details`;
        const basic = (data.earnings || []).find(item => item.code === "basic_pay");
        $("basicPay").textContent = money(basic?.amount);
        $("grossPay").textContent = money(data.gross);
        $("totalDeductions").textContent = money(data.total_deductions);
        $("netPay").textContent = money(data.net);
        renderItems($("earningsList"), data.earnings || [], "No earnings configured.", { label: "Gross Monthly Salary", amount: data.gross, accent: "sal-positive" });
        renderItems($("deductionsList"), data.deductions || [], "No deductions.", { label: "Net Take Home Salary", amount: data.net, accent: "sal-net" });
        const bank = data.bank || {};
        const bankDetails = $("bankDetails"); bankDetails.replaceChildren();
        [["Bank Name", bank.bank_name], ["Account Number", bank.account_number], ["IFSC Code", bank.ifsc_code], ["PAN Number", bank.pan_number], ["UPI ID", bank.upi_id], ["Payment Mode", bank.payment_mode]]
            .forEach(([label, value]) => bankDetails.append(infoItem(label, value)));
        salarySchedule(data);
        history(data.history || []);
    }
    $("backToStaff").addEventListener("click", () => { window.location.href = "salary.html?tab=staff"; });
    $("detailPayClose").addEventListener("click", () => $("detailPayDialog").close());
    $("detailPayCancel").addEventListener("click", () => $("detailPayDialog").close());
    $("detailPayForm").addEventListener("submit", async event => {
        event.preventDefault();
        if (!payPeriod) return;
        const submit = $("detailPaySubmit"); submit.disabled = true;
        try {
            const result = await send("/salary/payroll", {
                staff_key: staffKey, period: payPeriod, status: "Paid", payment_date: $("detailPayDate").value,
                payment_mode: $("detailPayMode").value, reference_no: $("detailPayRef").value.trim() || null,
                remarks: $("detailPayRemarks").value.trim() || null
            });
            $("detailPayDialog").close();
            await loadDetails();
            alert(`Salary marked as paid.${result.reference_no ? ` Reference: ${result.reference_no}` : ""}`);
        } catch (err) { alert(err.message); }
        finally { submit.disabled = false; }
    });
    if (!staffKey) { error("No staff member was selected."); return; }
    loadDetails();
})();
