/* Salary page: Overview, Staff, Payment Records, Salary Structure and Salary Types.
   It follows the same pattern as fees.js. All text is added with textContent, never innerHTML. */
(() => {
    "use strict";

    const $ = id => document.getElementById(id);
    const MAX_AMOUNT = 10000000;
    const SECTION_LABEL = { teaching: "Teaching", non_teaching: "Non-teaching" };
    const TABS = {
        overview: ["tabOverview", "panelOverview"], staff: ["tabStaff", "panelStaff"],
        payments: ["tabPayments", "panelPayments"], structure: ["tabStructure", "panelStructure"],
        types: ["tabTypes", "panelTypes"]
    };

    function sessionRole() {
        try { return JSON.parse(sessionStorage.getItem("abc_school_session") || "null")?.user?.role || ""; } catch { return ""; }
    }
    const isAdmin = sessionRole() === "admin";   // the server enforces this too; the page just hides what would be refused

    /* ---------- small helpers ---------- */
    const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const pad = n => String(n).padStart(2, "0");
    const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const showDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : "—"; };
    const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-");

    function h(tag, attrs, ...kids) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs || {})) {
            if (value === null || value === undefined || value === false) continue;
            if (key === "class") el.className = value;
            else if (key === "text") el.textContent = value;
            else if (key === "value") el.value = value;
            else if (key === "dataset") Object.assign(el.dataset, value);
            else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
            else el.setAttribute(key, value === true ? "" : value);
        }
        kids.flat().forEach(kid => {
            if (kid === null || kid === undefined || kid === false) return;
            el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
        });
        return el;
    }
    const td = (content, cls) => h("td", { class: cls }, content);
    const badge = text => h("span", { class: `sal-badge ${slug(text)}`, text });
    const button = (text, cls, onclick, extra) => h("button", { type: "button", class: cls, onclick, ...(extra || {}) }, text);
    const emptyRow = (cols, text) => h("tr", null, h("td", { colspan: cols, text }));

    function errorText(data) {
        const detail = data && data.detail;
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail)) return "Please check the values you entered.";
        return "Something went wrong. Please try again.";
    }

    async function api(url, options) {
        const response = await window.authenticatedFetch(url, options);
        let data = null;
        try { data = await response.json(); } catch { /* empty body */ }
        if (!response.ok) throw new Error(errorText(data));
        return data;
    }
    const send = (url, method, body) =>
        api(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    function showError(message) {
        const box = $("pageError");
        box.textContent = message || "";
        box.hidden = !message;
    }
    const fail = (error, fallback) => { console.error(fallback, error); showError(error.message || fallback); };

    const yearSelect = $("academicYear");
    const yearParam = () => `academic_year=${encodeURIComponent(yearSelect.value)}`;

    function populateYears() {
        const now = new Date();
        const current = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        for (let year = current - 1; year <= current + 1; year += 1) {
            yearSelect.append(h("option", { value: `${year}-${year + 1}`, text: `Academic Year ${year}-${year + 1}` }));
        }
        const saved = localStorage.getItem("school_academic_year");   // shared with the Fees page
        yearSelect.value = /^\d{4}-\d{4}$/.test(saved || "") && [...yearSelect.options].some(o => o.value === saved)
            ? saved : `${current}-${current + 1}`;
    }

    /* ---------- dialogs ---------- */
    document.querySelectorAll("dialog [data-close]").forEach(btn => btn.addEventListener("click", () => btn.closest("dialog").close()));

    /* ======================================================================
       OVERVIEW
       ====================================================================== */
    function renderBars(months) {
        const chart = $("paidChart");
        chart.replaceChildren();
        const max = Math.max(...months.map(m => Number(m.amount || 0)), 1);
        months.forEach(m => {
            const amount = Number(m.amount || 0);
            const bar = h("div", { class: "bar" });
            bar.style.height = `${Math.max(amount ? 8 : 2, (amount / max) * 100)}%`;
            chart.append(h("div", { class: "bar-column" },
                h("span", { class: "bar-value", text: money(amount) }), bar, h("span", { class: "bar-label", text: m.label })));
        });
    }

    function renderStatuses(statuses) {
        const entries = [["Paid", "#617052"], ["Pending", "#c55a52"]].map(([name, color]) => ({ name, color, count: Number(statuses[name] || 0) }));
        const total = entries.reduce((sum, e) => sum + e.count, 0);
        let progress = 0;
        const stops = entries.map(e => { const start = progress; progress += total ? e.count / total * 100 : 0; return `${e.color} ${start}% ${progress}%`; }).join(", ");
        $("statusDonut").style.background = total ? `conic-gradient(${stops})` : "#e8ebe5";
        $("statusTotal").textContent = total;
        const legend = $("statusLegend");
        legend.replaceChildren();
        entries.forEach(e => {
            const dot = h("span"); dot.style.background = e.color;
            legend.append(h("li", null, dot, e.name, h("strong", { text: e.count })));
        });
    }

    function renderOverview(data) {
        const s = data.summary || {};
        $("ovPaid").textContent = money(s.paid);
        $("ovPending").textContent = money(s.pending);
        $("ovMonthly").textContent = money(s.monthly_payroll);
        $("ovStaff").textContent = Number(s.staff_count || 0).toLocaleString("en-IN");
        $("ovStaffSplit").textContent = `Teaching ${s.teaching_count || 0} · Non-teaching ${s.non_teaching_count || 0}`;
        renderBars(data.monthly_paid || []);
        renderStatuses(data.payment_statuses || {});
        const warn = $("setupWarning");
        warn.replaceChildren();
        const missing = Number(s.unconfigured_count || 0);
        warn.hidden = !missing;
        if (missing) {
            warn.append(`${missing} staff ${missing === 1 ? "member has" : "members have"} no salary set yet and cannot be paid.`);
            if (isAdmin) warn.append(button("Set salary", "", () => activate("structure")));
        }
    }

    async function loadOverview() {
        showError("");
        try { renderOverview(await api(`/salary/overview?${yearParam()}`)); }
        catch (error) { fail(error, "Unable to load the salary overview."); renderOverview({}); }
    }

    /* ======================================================================
       STAFF
       ====================================================================== */
    let staffList = [];

    function renderStaff() {
        const term = $("staffSearch").value.trim().toLowerCase();
        const section = $("staffSection").value;
        const rows = staffList.filter(p => (!section || p.section === section) &&
            (!term || `${p.full_name} ${p.post}`.toLowerCase().includes(term)));
        $("staffCount").textContent = `${rows.length} of ${staffList.length} staff`;
        const body = $("staffBody");
        body.replaceChildren();
        if (!rows.length) { body.append(emptyRow(8, staffList.length ? "No staff match your search." : "No staff found.")); return; }
        rows.forEach(p => body.append(h("tr", null,
            td(p.staff_id), td(p.full_name), td(p.post), td(SECTION_LABEL[p.section] || p.section),
            td(p.gross ? money(p.gross) : "—", "num"), td(p.deductions ? money(p.deductions) : "—", "num"),
            td(p.net > 0 ? money(p.net) : h("span", { class: "sal-muted", text: "Not set" }), "num"),
            td(button("Details", "view-students-btn", () => openStaffDetails(p))))));
    }

    async function loadStaff() {
        showError("");
        try { staffList = await api("/salary/staff"); renderStaff(); }
        catch (error) { fail(error, "Unable to load staff."); }
    }

    function openStaffDetails(person) {
        const query = new URLSearchParams({ staff_key: person.staff_key, academic_year: yearSelect.value });
        window.location.href = `salary_staff_details.html?${query.toString()}`;
    }

    function lines(items, emptyText) {
        if (!items.length) return h("p", { class: "sal-empty", text: emptyText });
        return h("ul", { class: "sal-lines" }, items.map(i => h("li", null, h("span", { text: i.name }), h("span", { text: money(i.amount) }))));
    }

    /* Which payment details matter depends on how the person is paid. */
    const MODE_FIELDS = { "Bank Transfer": ["bank_name", "account_number", "ifsc_code", "pan_number"], UPI: ["upi_id"], Cheque: [], Cash: [] };
    const MODE_NOTE = { Cheque: "Paid by cheque. No bank details needed.", Cash: "Paid in cash. No bank details needed." };
    const REQUIRED = new Set(["account_number", "ifsc_code", "upi_id"]);
    const FIELDS = {
        bank_name: { label: "Bank name", attrs: { maxlength: 100 } },
        account_number: { label: "Account number", attrs: { inputmode: "numeric", maxlength: 20, placeholder: "6–20 digits", pattern: "\\d{6,20}", title: "6 to 20 digits" } },
        ifsc_code: { label: "IFSC code", attrs: { maxlength: 11, placeholder: "e.g. SBIN0001423", pattern: "[A-Za-z]{4}0[A-Za-z0-9]{6}", title: "11 characters, like SBIN0001423" } },
        pan_number: { label: "PAN (optional)", attrs: { maxlength: 10, placeholder: "e.g. ABCDE1234F", pattern: "[A-Za-z]{5}\\d{4}[A-Za-z]", title: "10 characters, like ABCDE1234F" } },
        upi_id: { label: "UPI ID", attrs: { maxlength: 100, placeholder: "e.g. name@okbank", pattern: "[A-Za-z0-9._\\-]{2,64}@[A-Za-z][A-Za-z0-9]{1,31}", title: "Like name@okbank" } }
    };

    function paymentView(b) {
        const mode = b.payment_mode;
        if (!mode) return h("p", { class: "sal-empty", text: "Payment mode has not been set yet." });
        const rows = [["Payment mode", mode], ...(MODE_FIELDS[mode] || []).map(key => [FIELDS[key].label.replace(" (optional)", ""), b[key]])];
        return h("div", null,
            h("ul", { class: "sal-lines" }, rows.map(([label, value]) => h("li", null, h("span", { text: label }), h("span", { text: value || "—" })))),
            MODE_NOTE[mode] ? h("p", { class: "sal-empty", text: MODE_NOTE[mode] }) : null);
    }

    function bankCard(p) {
        const b = p.bank || {};
        const view = paymentView(b);
        const card = h("section", { class: "sal-card" }, h("h4", { text: "Payment details" }), view);
        if (!isAdmin) return card;

        const modeSelect = h("select", { id: "bkMode" }, Object.keys(MODE_FIELDS).map(m => h("option", { value: m, text: m })));
        modeSelect.value = b.payment_mode || "Bank Transfer";
        const inputs = {}, labels = {};
        Object.entries(FIELDS).forEach(([key, meta]) => {
            inputs[key] = h("input", { id: `bk_${key}`, value: b[key] || "", ...meta.attrs });
            labels[key] = h("label", null, meta.label, inputs[key]);
        });
        const note = h("p", { class: "sal-empty full" });
        const syncMode = () => {                       // show only what this payment mode needs
            const visible = MODE_FIELDS[modeSelect.value] || [];
            Object.keys(FIELDS).forEach(key => {
                const show = visible.includes(key);
                labels[key].hidden = !show;
                inputs[key].disabled = !show;           // hidden fields must not block saving
                inputs[key].required = show && REQUIRED.has(key);
            });
            note.textContent = MODE_NOTE[modeSelect.value] || "";
            note.hidden = !MODE_NOTE[modeSelect.value];
        };
        modeSelect.addEventListener("change", syncMode);

        const form = h("form", { class: "sal-bank-form", hidden: true },
            h("label", { class: "full" }, "How is this person paid?", modeSelect),
            Object.values(labels), note,
            h("div", { class: "dialog-actions full" },
                button("Cancel", "cancel-dialog", () => { form.hidden = true; view.hidden = false; editBtn.hidden = false; }),
                h("button", { type: "submit", class: "save-structure-btn", text: "Save payment details" })));
        syncMode();
        const editBtn = button("Edit payment details", "head-action-btn", () => { form.hidden = false; view.hidden = true; editBtn.hidden = true; });
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const visible = MODE_FIELDS[modeSelect.value] || [];
            const value = key => (visible.includes(key) ? inputs[key].value.trim() : "") || null;   // details of other modes are cleared
            try {
                await send(`/salary/staff/${encodeURIComponent(p.staff_key)}/bank`, "PUT", {
                    bank_name: value("bank_name"), account_number: value("account_number"), ifsc_code: value("ifsc_code"),
                    pan_number: value("pan_number"), upi_id: value("upi_id"), payment_mode: modeSelect.value
                });
                await openStaffDialog(p.staff_key);
            } catch (error) { alert(error.message); }
        });
        card.append(editBtn, form);
        return card;
    }

    /* "Pay salary" section of the staff dialog: pick a month that is still unpaid and pay it. */
    const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    function unpaidPeriods(p) {
        const start = Number(yearSelect.value.slice(0, 4));
        const now = new Date();
        const current = now.getFullYear() * 100 + now.getMonth() + 1;
        const paid = new Set(p.history.filter(r => r.status === "Paid").map(r => r.period));
        const result = [];
        for (let i = 0; i < 12; i += 1) {
            const mon = ((3 + i) % 12) + 1, year = i < 9 ? start : start + 1;
            const period = `${year}-${pad(mon)}`;
            if (year * 100 + mon <= current && !paid.has(period)) result.push({ period, label: `${MONTH_NAMES[mon - 1]} ${year}` });
        }
        return result.reverse();                         // newest month first
    }

    function payToText(b) {
        if (b.payment_mode === "UPI") return b.upi_id ? `UPI ID ${b.upi_id}` : "UPI (UPI ID not saved yet)";
        if (b.payment_mode === "Bank Transfer") return `${b.bank_name || "Bank"}${b.account_number ? ` a/c ending ${String(b.account_number).slice(-4)}` : " (account not saved yet)"}`;
        if (b.payment_mode === "Cash") return "Cash";
        if (b.payment_mode === "Cheque") return "Cheque";
        return "";
    }

    function payCard(p) {
        const card = h("section", { class: "sal-card" }, h("h4", { text: "Pay salary" }));
        if (!(p.net > 0)) {
            card.append(h("p", { class: "sal-empty", text: isAdmin ? "No salary is set for this person. Set it in Salary Structure first." : "No salary is set for this person yet." }));
            return card;
        }
        const periods = unpaidPeriods(p);
        if (!periods.length) {
            card.append(h("p", { class: "sal-empty", text: "All salaries for the months so far in this academic year are paid." }));
            return card;
        }
        const select = h("select", { "aria-label": "Month to pay" }, periods.map(x => h("option", { value: x.period, text: x.label })));
        const pay = button(`Pay ${money(p.net)}`, "save-structure-btn", () => {
            const chosen = periods.find(x => x.period === select.value);
            openPay({ staff_key: p.staff_key, full_name: p.full_name, net: p.net }, chosen.period, chosen.label, false,
                { mode: p.bank.payment_mode, payTo: payToText(p.bank), onDone: () => openStaffDialog(p.staff_key) });
        });
        const paidTo = payToText(p.bank);
        card.append(h("div", { class: "sal-pay-row" }, select, pay),
            h("p", { class: "sal-empty", text: (paidTo ? `Pay to: ${paidTo}. ` : "Payment mode not set yet; you can choose it when paying. ") +
                (periods.length > 1 ? `${periods.length} months are unpaid.` : "") }));
        return card;
    }

    function historyCard(p) {
        const card = h("section", { class: "sal-card" }, h("h4", { text: "Payment history" }));
        if (!p.history.length) { card.append(h("p", { class: "sal-empty", text: "No salary has been paid yet." })); return card; }
        const head = h("tr", null, ["Month", "Paid on", "Gross", "Deductions", "Net paid", "Mode", "Reference", "Status"]
            .map((t, i) => h("th", { class: [2, 3, 4].includes(i) ? "num" : "", text: t })));
        card.append(h("div", { class: "sal-history-wrap" }, h("table", { class: "sal-history" }, h("thead", null, head),
            h("tbody", null, p.history.map(r => h("tr", null,
                td(r.month), td(showDate(r.payment_date)), td(money(r.gross_salary), "num"), td(money(r.deductions), "num"),
                td(money(r.net_pay), "num"), td(r.payment_mode || "—"), td(r.reference_no || "—"), td(badge(r.status))))))));
        return card;
    }

    async function openStaffDialog(staffKey) {
        try {
            const p = await api(`/salary/staff/${encodeURIComponent(staffKey)}`);
            $("staffDialogTitle").textContent = p.full_name;
            const net = h("li", { class: "total" }, h("span", { text: "Net salary" }), h("span", { text: money(p.net) }));
            $("staffDialogBody").replaceChildren(
                h("p", { class: "sal-muted", text: `${p.post} · ${SECTION_LABEL[p.section] || p.section} · ID ${p.staff_id}` }),
                h("div", { class: "sal-detail-grid" },
                    h("section", { class: "sal-card" }, h("h4", { text: "Earnings" }), lines(p.earnings, "No salary set. Add it in Salary Structure."),
                        h("ul", { class: "sal-lines" }, h("li", { class: "total" }, h("span", { text: "Gross salary" }), h("span", { text: money(p.gross) })))),
                    h("section", { class: "sal-card" }, h("h4", { text: "Deductions" }), lines(p.deductions, "No deductions."),
                        h("ul", { class: "sal-lines" }, h("li", { class: "total" }, h("span", { text: "Total deductions" }), h("span", { text: money(p.total_deductions) })), net))),
                payCard(p), h("div", { style: "height:16px" }), bankCard(p), h("div", { style: "height:16px" }), historyCard(p));
            if (!$("staffDialog").open) $("staffDialog").showModal();
        } catch (error) { alert(error.message); }
    }

    /* ======================================================================
       PAYMENT RECORDS  (months -> staff of one month)
       ====================================================================== */
    let month = null;   // the payroll month being viewed: { period, label, future, rows, summary }

    async function loadMonths() {
        showError("");
        const body = $("monthsBody");
        try {
            const data = await api(`/salary/payment-records?${yearParam()}`);
            $("prPayable").textContent = money(data.summary.payable);
            $("prPaid").textContent = money(data.summary.paid);
            $("prPending").textContent = money(data.summary.pending);
            body.replaceChildren();
            data.months.forEach(m => body.append(h("tr", null,
                td(m.label), td(badge(m.status)), td(m.paid_count, "num"), td(m.future ? "—" : m.pending_count, "num"),
                td(money(m.paid_amount), "num"), td(m.future ? "—" : money(m.pending_amount), "num"), td(money(m.total_payable), "num"),
                td(button("View Staff", "view-students-btn", () => openMonth(m.period))))));
        } catch (error) {
            fail(error, "Unable to load payment records.");
            body.replaceChildren(emptyRow(8, "Payment records could not be loaded."));
        }
    }

    function showMonthsView() {
        $("monthView").hidden = true;
        $("monthsView").hidden = false;
        month = null;
        loadMonths();
    }

    async function openMonth(period) {
        showError("");
        try {
            month = await api(`/salary/payroll?period=${encodeURIComponent(period)}${$("monthSection").value ? `&section=${$("monthSection").value}` : ""}`);
            $("monthsView").hidden = true;
            $("monthView").hidden = false;
            renderMonth();
        } catch (error) { fail(error, "Unable to load this month."); }
    }

    function renderMonth() {
        const s = month.summary;
        $("monthTitle").textContent = month.label;
        $("monthSummary").textContent = month.future
            ? "This month has not started, so salary cannot be paid yet."
            : `Paid ${money(s.paid)} (${s.paid_count} staff) · Pending ${money(s.pending)} (${s.pending_count} staff)` +
              (s.no_salary_count ? ` · ${s.no_salary_count} with no salary set` : "");
        $("payAllBtn").hidden = month.future || !s.pending_count;
        const body = $("monthBody");
        body.replaceChildren();
        if (!month.rows.length) { body.append(emptyRow(9, "No staff in this section.")); return; }
        month.rows.forEach(r => {
            const actions = h("div", { class: "sal-actions" });
            if (month.future) actions.append("—");
            else if (r.status === "Paid") {
                actions.append(button("Edit", "head-action-btn", () => openPay(r, month.period, month.label, true, { onDone: refreshMonth })),
                    button("Mark pending", "head-action-btn delete-head-btn", () => markPending(r)));
            } else if (r.has_salary) actions.append(button("Mark paid", "view-students-btn", () => openPay(r, month.period, month.label, false, { onDone: refreshMonth })));
            else actions.append(isAdmin ? button("Set salary", "head-action-btn", () => activate("structure")) : h("span", { class: "sal-muted", text: "No salary set" }));
            body.append(h("tr", null, td(r.staff_id), td(h("span", null, r.full_name, h("br"), h("small", { class: "sal-muted", text: r.post }))),
                td(SECTION_LABEL[r.section] || r.section), td(r.has_salary ? money(r.gross) : "—", "num"),
                td(r.has_salary ? money(r.deductions) : "—", "num"), td(r.has_salary ? money(r.net) : "—", "num"),
                td(r.status === "Paid" ? badge("Paid") : badge(r.has_salary ? "Pending" : "No salary set")),
                td(r.status === "Paid" ? showDate(r.payment_date) : "—"), td(actions)));
        });
    }

    async function refreshMonth() { if (month) await openMonth(month.period); }

    function defaultPayDate(period) {
        const [year, mon] = period.split("-").map(Number);
        const today = new Date();
        const last = new Date(year, mon, 0);          // last day of that payroll month
        return isoDate(last > today ? today : last);
    }
    function dateLimits(input, period) {
        const [year, mon] = period.split("-").map(Number);
        input.min = `${year}-${pad(mon)}-01`;
        input.max = isoDate(new Date());
    }

    let payContext = null;   // what the open pay dialog is paying: { staffKey, period, onDone }

    function openPay(row, period, label, editing, options = {}) {
        const form = $("payForm");
        form.reset();
        payContext = { staffKey: row.staff_key, period, onDone: options.onDone };
        $("payDialogTitle").textContent = editing ? "Edit payment details" : "Record salary payment";
        $("paySubmit").textContent = editing ? "Save changes" : "Mark as paid";
        $("paySummary").textContent = `${row.full_name} · ${label} · Net salary ${money(row.net)}` +
            (options.payTo ? ` · Pay to: ${options.payTo}` : "") +
            (editing ? " (the amount paid cannot be changed here)" : "");
        dateLimits($("payDate"), period);
        $("payDate").value = editing && row.payment_date ? row.payment_date : defaultPayDate(period);
        const mode = editing ? row.payment_mode : options.mode;
        if (mode && [...$("payMode").options].some(o => o.value === mode)) $("payMode").value = mode;
        $("payRef").value = editing ? row.reference_no || "" : "";
        $("payRemarks").value = editing ? row.remarks || "" : "";
        $("payDialog").showModal();
    }

    $("payForm").addEventListener("submit", async event => {
        event.preventDefault();
        try {
            await send("/salary/payroll", "PUT", {
                staff_key: payContext.staffKey, period: payContext.period, status: "Paid",
                payment_date: $("payDate").value, payment_mode: $("payMode").value,
                reference_no: $("payRef").value.trim() || null, remarks: $("payRemarks").value.trim() || null
            });
            $("payDialog").close();
            if (payContext.onDone) await payContext.onDone();
        } catch (error) { alert(error.message); }
    });

    async function markPending(row) {
        if (!confirm(`Mark ${row.full_name}'s ${month.label} salary as pending? The payment record will be removed.`)) return;
        try {
            await send("/salary/payroll", "PUT", { staff_key: row.staff_key, period: month.period, status: "Pending" });
            await refreshMonth();
        } catch (error) { alert(error.message); }
    }

    function bulkTargets() {
        const section = $("bulkSection").value;
        return month.rows.filter(r => r.status === "Pending" && r.has_salary && (!section || r.section === section));
    }
    function updateBulkSummary() {
        const rows = bulkTargets();
        const total = rows.reduce((sum, r) => sum + Number(r.net || 0), 0);
        $("bulkSummary").textContent = `${month.label}: ${rows.length} staff will be marked as paid, ${money(total)} in total.` +
            (month.summary.no_salary_count ? " Staff with no salary set are skipped." : "");
    }
    $("payAllBtn").addEventListener("click", () => {
        $("bulkForm").reset();
        $("bulkSection").value = $("monthSection").value;
        dateLimits($("bulkDate"), month.period);
        $("bulkDate").value = defaultPayDate(month.period);
        updateBulkSummary();
        $("bulkDialog").showModal();
    });
    $("bulkSection").addEventListener("change", updateBulkSummary);
    $("bulkForm").addEventListener("submit", async event => {
        event.preventDefault();
        try {
            const result = await send("/salary/disburse", "POST", {
                period: month.period, payment_date: $("bulkDate").value, payment_mode: $("bulkMode").value,
                section: $("bulkSection").value || null, remarks: $("bulkRemarks").value.trim() || null
            });
            $("bulkDialog").close();
            await refreshMonth();
            alert(`${result.message} Total ${money(result.total)}.` + (result.skipped ? ` ${result.skipped} skipped (no salary to pay).` : ""));
        } catch (error) { alert(error.message); }
    });

    /* ======================================================================
       SALARY STRUCTURE  (staff x salary type)
       ====================================================================== */
    let structure = { types: [], staff: [] };
    const edits = new Map();                         // "staff_key|head_id" -> text typed by the user ("" = blank)
    const cellKey = (staff, head) => `${staff.staff_key}|${head.head_id}`;
    const original = (staff, head) => staff.amounts[String(head.head_id)];
    const originalText = (staff, head) => { const v = original(staff, head); return v === undefined ? "" : String(v); };
    const effective = (staff, head) => edits.has(cellKey(staff, head)) ? edits.get(cellKey(staff, head)) : originalText(staff, head);
    const isBasic = head => head.code === "basic_pay";

    function rowTotals(staff) {
        let gross = 0, deductions = 0;
        structure.types.forEach(head => {
            const amount = Number(effective(staff, head)) || 0;
            if (head.component_type === "earning") gross += amount; else deductions += amount;
        });
        return { gross, deductions, net: gross - deductions };
    }

    function refreshRow(tr, staff) {
        const t = rowTotals(staff);
        tr.querySelector(".row-gross").textContent = money(t.gross);
        tr.querySelector(".row-ded").textContent = money(t.deductions);
        const net = tr.querySelector(".row-net");
        net.textContent = money(t.net);
        net.classList.toggle("negative", t.net < 0);
        net.title = t.net < 0 ? "Deductions are higher than earnings" : "";
    }

    function updateDirty() {
        const label = $("structureDirty");
        label.hidden = !edits.size;
        label.textContent = `${edits.size} unsaved ${edits.size === 1 ? "change" : "changes"}`;
    }

    function setCell(staff, head, text, input) {
        const same = text === originalText(staff, head) || (text !== "" && originalText(staff, head) !== "" && Number(text) === Number(originalText(staff, head)));
        if (same) edits.delete(cellKey(staff, head)); else edits.set(cellKey(staff, head), text);
        if (input) { input.value = text; input.classList.toggle("changed", !same); }
        updateDirty();
    }

    function visibleStaff() {
        const term = $("structureSearch").value.trim().toLowerCase();
        const section = $("structureSection").value;
        return structure.staff.filter(p => (!section || p.section === section) && (!term || `${p.full_name} ${p.post}`.toLowerCase().includes(term)));
    }

    function renderStructure() {
        const head = $("structureHead"), body = $("structureBody");
        head.replaceChildren(); body.replaceChildren();
        $("saveStructureBtn").hidden = !isAdmin;
        if (!structure.types.length) { body.append(emptyRow(1, "Add salary types first, then set each person’s pay here.")); return; }
        const rows = visibleStaff();

        head.append(h("tr", null,
            h("th", { text: "Staff" }),
            structure.types.map(t => h("th", { class: `num group-${t.component_type}` }, t.name, h("small", { text: t.component_type === "earning" ? "Earning" : "Deduction" }))),
            h("th", { class: "num", text: "Gross" }), h("th", { class: "num", text: "Deductions" }), h("th", { class: "num", text: "Net Salary" })));

        if (isAdmin && rows.length) {
            const fill = h("tr", { class: "set-all-row" }, h("td", { text: `Set for ${rows.length} shown` }));
            structure.types.forEach(t => {
                const input = h("input", { type: "number", min: "0", step: "0.01", placeholder: isBasic(t) ? "₹" : "value", "aria-label": `Set ${t.name} for everyone shown` });
                const unit = isBasic(t) ? null : h("select", { "aria-label": "Unit" }, h("option", { value: "rs", text: "₹" }), h("option", { value: "pct", text: "% basic" }));
                const apply = button("↓", "", () => applyToAll(t, input.value, unit ? unit.value : "rs"), { title: "Apply to everyone shown" });
                fill.append(h("td", null, input, unit, apply));
            });
            fill.append(h("td"), h("td"), h("td"));
            body.append(fill);
        }

        if (!rows.length) { body.append(emptyRow(structure.types.length + 4, "No staff match your search.")); return; }
        rows.forEach(staff => {
            const tr = h("tr", { dataset: { staffKey: staff.staff_key } },
                h("td", null, staff.full_name, h("small", { text: `${staff.post} · ${SECTION_LABEL[staff.section] || staff.section}` })));
            structure.types.forEach(t => {
                const text = effective(staff, t);
                const input = h("input", { type: "number", min: "0", max: MAX_AMOUNT, step: "0.01", value: text, disabled: !isAdmin, "aria-label": `${t.name} for ${staff.full_name}` });
                input.classList.toggle("changed", edits.has(cellKey(staff, t)));
                input.addEventListener("input", () => { setCell(staff, t, input.value, null); input.classList.toggle("changed", edits.has(cellKey(staff, t))); refreshRow(tr, staff); });
                tr.append(h("td", null, input));
            });
            tr.append(td("", "row-total row-gross num"), td("", "row-total row-ded num"), td("", "row-total row-net num"));
            body.append(tr);
            refreshRow(tr, staff);
        });
        updateDirty();
    }

    function applyToAll(head, raw, unit) {
        if (raw === "" || !(Number(raw) >= 0)) { alert("Enter an amount of 0 or more first."); return; }
        const basicHead = structure.types.find(isBasic);
        let skipped = 0;
        visibleStaff().forEach(staff => {
            let value = Number(raw);
            if (unit === "pct") {
                const basic = basicHead ? Number(effective(staff, basicHead)) || 0 : 0;
                if (!basic) { skipped += 1; return; }
                value = Math.round(basic * value) / 100;      // paise-accurate: basic * percent / 100
            }
            setCell(staff, head, String(value), null);
        });
        renderStructure();
        if (skipped) alert(`${skipped} staff were left unchanged because they have no Basic Pay yet. Set Basic Pay first, then apply a percentage.`);
    }

    async function loadStructure() {
        showError("");
        try { structure = await api("/salary/structure"); renderStructure(); }
        catch (error) { fail(error, "Unable to load the salary structure."); }
    }

    $("saveStructureBtn").addEventListener("click", async () => {
        if (!edits.size) { alert("There are no changes to save."); return; }
        const items = [];
        for (const [key, text] of edits) {
            const [staffKey, headId] = key.split("|");
            const amount = text === "" ? null : Number(text);
            if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT)) {
                const person = structure.staff.find(p => p.staff_key === staffKey);
                alert(`Check the amount for ${person ? person.full_name : staffKey}: it must be between 0 and ${money(MAX_AMOUNT)}.`);
                return;
            }
            items.push({ staff_key: staffKey, head_id: Number(headId), amount });
        }
        try {
            const result = await send("/salary/structure/bulk", "PUT", { items });
            edits.clear();
            await loadStructure();
            alert(`Salary structure saved (${result.updated} ${result.updated === 1 ? "change" : "changes"}).`);
        } catch (error) { alert(error.message); }
    });
    ["structureSearch", "structureSection"].forEach(id => $(id).addEventListener("input", renderStructure));
    window.addEventListener("beforeunload", event => { if (edits.size) { event.preventDefault(); event.returnValue = ""; } });

    /* ======================================================================
       SALARY TYPES
       ====================================================================== */
    let types = [];

    function renderTypes() {
        const body = $("typesBody");
        body.replaceChildren();
        $("addTypeBtn").hidden = !isAdmin;
        if (!types.length) { body.append(emptyRow(4, "No salary types yet. Add one to begin.")); return; }
        types.forEach(t => {
            const actions = h("div", { class: "sal-actions" });
            if (isAdmin) {
                actions.append(button("Edit", "head-action-btn", () => openTypeDialog(t)));
                if (t.code !== "basic_pay") actions.append(button("Delete", "head-action-btn delete-head-btn", () => deleteType(t)));
                else actions.append(h("span", { class: "sal-muted", text: "Required" }));
            }
            body.append(h("tr", null, td(t.name), td(badge(t.component_type === "earning" ? "Earning" : "Deduction")), td(t.description || "—"), td(actions)));
        });
    }

    async function loadTypes() {
        $("typesError").hidden = true;
        try { types = await api("/salary/types"); renderTypes(); }
        catch (error) { $("typesError").textContent = error.message; $("typesError").hidden = false; }
    }

    function openTypeDialog(type) {
        $("typeForm").reset();
        $("typeId").value = type ? type.head_id : "";
        $("typeDialogTitle").textContent = type ? "Edit Salary Type" : "Add Salary Type";
        if (type) {
            $("typeName").value = type.name;
            $("typeKind").value = type.component_type;
            $("typeKind").disabled = type.code === "basic_pay";
            $("typeDescription").value = type.description || "";
        } else $("typeKind").disabled = false;
        $("typeDialog").showModal();
    }

    $("typeForm").addEventListener("submit", async event => {
        event.preventDefault();
        const id = $("typeId").value;
        const payload = { name: $("typeName").value.trim(), component_type: $("typeKind").value, description: $("typeDescription").value.trim() || null };
        try {
            await send(id ? `/salary/types/${encodeURIComponent(id)}` : "/salary/types", id ? "PUT" : "POST", payload);
            $("typeDialog").close();
            await loadTypes();
        } catch (error) { alert(error.message); }
    });

    async function deleteType(type) {
        if (!confirm(`Delete “${type.name}”? It will be removed from everyone’s salary structure. Salary already paid is not changed.`)) return;
        try { await api(`/salary/types/${encodeURIComponent(type.head_id)}`, { method: "DELETE" }); await loadTypes(); }
        catch (error) { alert(error.message); }
    }
    $("addTypeBtn").addEventListener("click", () => openTypeDialog(null));

    /* ======================================================================
       TABS
       ====================================================================== */
    let currentTab = "overview";

    function activate(name) {
        if (name !== "structure" && edits.size) {
            if (!confirm("You have unsaved salary changes. Leave without saving them?")) return;
            edits.clear();
        }
        currentTab = name;
        Object.entries(TABS).forEach(([key, [tabId, panelId]]) => {
            $(panelId).hidden = key !== name;
            $(tabId).classList.toggle("active", key === name);
            $(tabId).setAttribute("aria-selected", String(key === name));
        });
        showError("");
        if (name === "overview") loadOverview();
        if (name === "staff") loadStaff();
        if (name === "payments") showMonthsView();
        if (name === "structure") loadStructure();
        if (name === "types") loadTypes();
    }

    Object.entries(TABS).forEach(([key, [tabId]]) => $(tabId).addEventListener("click", () => activate(key)));
    $("backToMonths").addEventListener("click", showMonthsView);
    $("monthSection").addEventListener("change", refreshMonth);
    ["staffSearch", "staffSection"].forEach(id => $(id).addEventListener("input", renderStaff));
    yearSelect.addEventListener("change", () => {
        localStorage.setItem("school_academic_year", yearSelect.value);
        if (currentTab === "overview") loadOverview();
        if (currentTab === "payments") showMonthsView();
    });

    populateYears();
    const requested = new URLSearchParams(window.location.search).get("tab");
    activate(Object.hasOwn(TABS, requested) ? requested : "overview");
})();
