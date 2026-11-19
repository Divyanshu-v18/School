/* Student list (with fee totals) and per-student payment history,
   opened from Fees > Payment Records > View Students. */
(() => {
    "use strict";
    const params = new URLSearchParams(window.location.search);
    const classKey = String(params.get("class") || "").trim().toUpperCase();
    const academicYear = String(params.get("academic_year") || "").trim();
    const yearQuery = academicYear ? `&academic_year=${encodeURIComponent(academicYear)}` : "";
    const openStudentId = String(params.get("student_id") || "").trim();
    const fromStudentsTab = params.get("from") === "students";
    const fromProfile = params.get("from") === "profile";   // opened from a student's profile (Fees tab)
    const profileReturnUrl = params.get("return_url");

    const classLabel = key => /^\d+$/.test(key) ? `Class ${key}` : key === "KIDSCARE" ? "Kids Care" : key || "Class";
    const normalize = value => String(value || "").trim().replace(/^class\s+/i, "").toUpperCase();
    const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const formatDate = iso => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    const listView = document.getElementById("studentListView");
    const detailView = document.getElementById("studentDetailView");
    const body = document.getElementById("classStudentsBody");
    const historyBody = document.getElementById("studentHistoryBody");
    const scheduleBody = document.getElementById("studentScheduleBody");
    const otherFeesBody = document.getElementById("studentOtherFeesBody");
    const frequencyLabels = { monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", yearly: "Yearly", one_time: "One time" };
    const errorBox = document.getElementById("classStudentsError");
    const dialog = document.getElementById("paymentDialog");
    const form = document.getElementById("paymentForm");
    const dialogError = document.getElementById("paymentDialogError");
    const field = id => document.getElementById(id);
    let currentStudent = null, currentRoll = null, currentYear = academicYear;
    let editing = null, listDirty = false;

    document.getElementById("classStudentsTitle").textContent = `${classLabel(classKey)} Students`;
    document.getElementById("classStudentsYear").textContent = academicYear ? `Academic Year ${academicYear}` : "";
    document.getElementById("backToPaymentRecords").addEventListener("click", () => {
        window.location.href = academicYear ? `fees.html?tab=payments&academic_year=${encodeURIComponent(academicYear)}` : "fees.html?tab=payments";
    });
    if (fromProfile) document.getElementById("backToStudents").textContent = "← Back to Student Profile";

    // Tell other open pages (e.g. the student profile) that fee data changed.
    function notifyFeesUpdated() {
        try { localStorage.setItem("school_fees_updated", String(Date.now())); } catch (_) {}
        try {
            if ("BroadcastChannel" in window) {
                const channel = new BroadcastChannel("school-fees");
                channel.postMessage({ type: "fees-updated", studentId: openStudentId || (currentStudent && currentStudent.student_id) });
                channel.close();
            }
        } catch (_) {}
    }

    // Fees tabs: jump to the matching tab on the main Fees page, keeping the academic year.
    const activeTab = fromStudentsTab || fromProfile ? "students" : "payments";
    document.querySelectorAll(".fee-tabs .tab-btn").forEach(button => {
        const isActive = button.dataset.tab === activeTab;
        button.classList.toggle("active", isActive);
        if (isActive) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
        button.addEventListener("click", () => {
            if (academicYear) localStorage.setItem("school_academic_year", academicYear);
            window.location.href = `fees.html?tab=${encodeURIComponent(button.dataset.tab)}`;
        });
    });
    document.getElementById("backToStudents").addEventListener("click", () => {
        if (fromProfile) {  // opened from the student profile: go back to its Fees tab
            const back = new URLSearchParams({ student_id: openStudentId, tab: "fees" });
            if (profileReturnUrl) back.set("return_url", profileReturnUrl);
            window.location.href = `student_details.html?${back.toString()}`;
            return;
        }
        if (fromStudentsTab) {  // opened from Fees > Students: go back to that tab
            if (academicYear) localStorage.setItem("school_academic_year", academicYear);
            window.location.href = "fees.html?tab=students";
            return;
        }
        detailView.hidden = true; listView.hidden = false; errorBox.hidden = true;
        if (listDirty) { listDirty = false; loadStudents(); }
    });

    async function getJson(url) {
        const response = await window.authenticatedFetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
        return data;
    }

    function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }

    function messageRow(target, columns, message) {
        target.replaceChildren();
        const row = document.createElement("tr"); const cell = document.createElement("td");
        cell.colSpan = columns; cell.textContent = message; row.appendChild(cell); target.appendChild(row);
    }

    function statusBadge(status) {
        const badge = document.createElement("span");
        badge.className = `status-badge ${String(status || "").toLowerCase()}`;
        badge.textContent = status || "—";
        return badge;
    }

    /* ---------- View 2: payment history ---------- */
    async function openStudent(student, roll) {
        currentStudent = student; currentRoll = roll;
        errorBox.hidden = true;
        document.getElementById("studentDetailName").textContent = student.full_name || `Student ${student.student_id}`;
        document.getElementById("studentDetailMeta").textContent = `Roll No. ${roll} · ${classLabel(classKey)}${student.section ? ` · Section ${student.section}` : ""}`;
        document.getElementById("studentDetailYear").textContent = academicYear ? `Academic Year ${academicYear}` : "";
        ["studentTotalFee", "studentPaidFee", "studentPendingFee"].forEach(id => { document.getElementById(id).textContent = "…"; });
        messageRow(scheduleBody, 9, "Loading fee schedule…");
        messageRow(otherFeesBody, 9, "Loading other fees…");
        messageRow(historyBody, 7, "Loading payment history…");
        listView.hidden = true; detailView.hidden = false;
        await loadStudentDetail();
    }

    async function loadStudentDetail() {
        try {
            const data = await getJson(`/fees/student-payments?student_id=${encodeURIComponent(currentStudent.student_id)}${yearQuery}`);
            currentYear = data.academic_year;
            document.getElementById("studentTotalFee").textContent = money(data.summary.total_fee);
            document.getElementById("studentPaidFee").textContent = money(data.summary.paid_amount);
            document.getElementById("studentPendingFee").textContent = money(data.summary.pending_amount);
            renderSchedule(data.schedule || []);
            renderOtherFees(data.other_fees || []);
            renderHistory(data.payments || []);
        } catch (error) {
            console.error("Unable to load payment history:", error);
            showError(`Unable to load payment history: ${error.message}`);
            messageRow(scheduleBody, 9, "Fee schedule could not be loaded.");
            messageRow(otherFeesBody, 9, "Other fees could not be loaded.");
            messageRow(historyBody, 7, "Payment history could not be loaded.");
        }
    }

    /* ---------- Update payment dialog ---------- */
    const todayIso = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

    function syncDialogFields() {
        const status = field("paymentStatus").value;
        field("paymentAmountRow").hidden = status !== "Partial";
        field("paymentDetailRows").hidden = status === "Pending";
        field("paymentAmount").required = status === "Partial";
    }

    function openPaymentDialog(info) {
        editing = info;
        dialogError.hidden = true;
        field("paymentDialogTitle").textContent = `Update payment · ${info.label}`;
        field("paymentDialogInfo").textContent = `${info.feeType} · Amount due ${money(info.due)}`;
        field("paymentStatus").value = info.status === "Partial" ? "Partial" : "Paid";
        field("paymentAmount").value = info.status === "Partial" ? info.paid : "";
        field("paymentAmount").max = String(info.due);
        field("paymentDate").value = info.paymentDate || todayIso();
        field("paymentMode").value = info.mode || "Cash";
        field("paymentRemarks").value = info.remarks || "";
        syncDialogFields();
        dialog.showModal();
    }

    field("paymentStatus").addEventListener("change", syncDialogFields);
    field("paymentCancel").addEventListener("click", () => dialog.close());
    field("paymentDialogClose").addEventListener("click", () => dialog.close());

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!editing || !currentStudent) return;
        const status = field("paymentStatus").value;
        const body = {
            academic_year: currentYear,
            student_id: Number(currentStudent.student_id),
            student_name: currentStudent.full_name || null,
            fee_type: editing.feeType,
            period: editing.period,
            status,
            amount_paid: status === "Partial" ? Number(field("paymentAmount").value) : null,
            payment_date: status === "Pending" ? null : field("paymentDate").value || null,
            payment_mode: status === "Pending" ? null : field("paymentMode").value,
            remarks: status === "Pending" ? null : field("paymentRemarks").value.trim() || null,
        };
        const saveButton = field("paymentSave");
        saveButton.disabled = true;
        try {
            const response = await window.authenticatedFetch("/fees/student-payments", {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Please check the entered values.");
            dialog.close();
            listDirty = true;
            notifyFeesUpdated();
            await loadStudentDetail();
        } catch (error) {
            dialogError.textContent = error.message; dialogError.hidden = false;
        } finally {
            saveButton.disabled = false;
        }
    });

    function updateButton(info) {
        const cell = document.createElement("td"); const button = document.createElement("button");
        button.type = "button"; button.className = "view-students-btn"; button.textContent = "Update";
        button.addEventListener("click", () => openPaymentDialog(info));
        cell.appendChild(button);
        return cell;
    }

    function renderSchedule(schedule) {
        scheduleBody.replaceChildren();
        if (!schedule.length) { messageRow(scheduleBody, 9, "No monthly fee is set in Fee Structure for this class."); return; }
        schedule.forEach(item => {
            const row = document.createElement("tr");
            [item.period, item.fee_type, money(item.amount), money(item.paid_amount),
             item.due_date ? formatDate(item.due_date) : "—"].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
            });
            const statusCell = document.createElement("td"); statusCell.appendChild(statusBadge(item.status)); row.appendChild(statusCell);
            [item.payment_date ? formatDate(item.payment_date) : "—", item.payment_mode || "—"].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
            });
            row.appendChild(updateButton({ label: item.period, feeType: item.fee_type, period: item.period_key, due: item.amount,
                status: item.status, paid: item.paid_amount, paymentDate: item.payment_date, mode: item.payment_mode, remarks: item.remarks }));
            scheduleBody.appendChild(row);
        });
    }

    function renderOtherFees(fees) {
        otherFeesBody.replaceChildren();
        if (!fees.length) { messageRow(otherFeesBody, 9, "No other fees are set in Fee Structure for this class."); return; }
        fees.forEach(fee => {
            const row = document.createElement("tr");
            const frequency = `${frequencyLabels[fee.frequency] || fee.frequency}${fee.installments > 1 ? ` · ${money(fee.unit_amount)} × ${fee.installments}` : ""}`;
            [fee.fee_type, frequency, money(fee.total_amount), money(fee.paid_amount),
             fee.due_date ? formatDate(fee.due_date) : "—"].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
            });
            const statusCell = document.createElement("td"); statusCell.appendChild(statusBadge(fee.status)); row.appendChild(statusCell);
            [fee.payment_date ? formatDate(fee.payment_date) : "—", fee.payment_mode || "—"].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
            });
            row.appendChild(updateButton({ label: fee.fee_type, feeType: fee.fee_type, period: fee.period_key, due: fee.total_amount,
                status: fee.status, paid: fee.paid_amount, paymentDate: fee.payment_date, mode: fee.payment_mode, remarks: fee.remarks }));
            otherFeesBody.appendChild(row);
        });
    }

    function renderHistory(payments) {
        historyBody.replaceChildren();
        if (!payments.length) { messageRow(historyBody, 7, "No payments recorded yet for the fees currently set in Fee Structure."); return; }
        payments.forEach(payment => {
            const row = document.createElement("tr");
            [payment.month, payment.fee_type, money(payment.amount_paid), formatDate(payment.payment_date), payment.payment_mode || "—"].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
            });
            const statusCell = document.createElement("td"); statusCell.appendChild(statusBadge(payment.status)); row.appendChild(statusCell);
            const remarks = document.createElement("td"); remarks.textContent = payment.remarks || "—"; row.appendChild(remarks);
            historyBody.appendChild(row);
        });
    }

    /* ---------- View 1: students of the class ---------- */
    const rollOf = student => student.roll_no || student.roll_number || student.student_id;

    function renderStudents(students, feeByStudent) {
        body.replaceChildren();
        if (!students.length) { messageRow(body, 8, "No students are enrolled in this class."); return; }
        students.forEach(student => {
            const fee = feeByStudent.get(Number(student.student_id)) || { total_fee: 0, paid_amount: 0, pending_amount: 0 };
            const roll = rollOf(student);
            const row = document.createElement("tr");
            [roll, student.full_name, classLabel(normalize(student.class)), student.section || "—",
             money(fee.total_fee), money(fee.paid_amount), money(fee.pending_amount)].forEach(value => {
                const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
            });
            const action = document.createElement("td"); const button = document.createElement("button");
            button.type = "button"; button.className = "view-students-btn"; button.textContent = "View More";
            button.addEventListener("click", () => openStudent(student, roll));
            action.appendChild(button); row.appendChild(action); body.appendChild(row);
        });
        document.getElementById("classStudentsSubtitle").textContent = `${students.length} student${students.length === 1 ? "" : "s"} enrolled in ${classLabel(classKey)}.`;
    }

    async function loadStudents() {
        if (!classKey) { messageRow(body, 8, "A class was not selected."); return; }
        try {
            const [students, fees] = await Promise.all([
                getJson("/students"),
                getJson(`/fees/class-students?class_key=${encodeURIComponent(classKey)}${yearQuery}`),
            ]);
            if (!Array.isArray(students)) throw new Error("Unable to load students.");
            const feeByStudent = new Map((fees.students || []).map(item => [Number(item.student_id), item]));
            const classStudents = students.filter(student => normalize(student.class) === classKey);
            renderStudents(classStudents, feeByStudent);
            if (openStudentId) {  // arrived from Fees > Students: open that student's payments directly
                const match = classStudents.find(student => String(student.student_id) === openStudentId);
                if (match) openStudent(match, rollOf(match)); else showError("That student was not found in this class.");
            }
        } catch (error) {
            console.error("Unable to load class students:", error);
            showError(`Unable to load students: ${error.message}`);
            messageRow(body, 8, "Student records could not be loaded.");
        }
    }

    loadStudents();
})();