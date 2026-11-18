/* ==========================================================================
   NON-TEACHING STAFF DIRECTORY & MANAGEMENT CONTROLLER
   Matches the structure and patterns of Teachers module
   ========================================================================== */

(() => {
    "use strict";

    // DOM Elements
    const addStaffBtn = document.getElementById("addStaffBtn");
    const staffSearch = document.getElementById("staffSearch");
    const departmentFilter = document.getElementById("departmentFilter");
    const postFilter = document.getElementById("staffPostFilter");
    const clearFiltersBtn = document.getElementById("clearStaffFilters");
    const staffTableBody = document.getElementById("staffTableBody");
    const resultCount = document.getElementById("staffResultCount");

    // KPI Elements
    const statTotalStaff = document.getElementById("statTotalStaff");
    const statAdminStaff = document.getElementById("statAdminStaff");
    const statTransportStaff = document.getElementById("statTransportStaff");
    const statSupportStaff = document.getElementById("statSupportStaff");

    // Modals
    const staffInfoModal = document.getElementById("staffInfoModal");
    const addStaffModal = document.getElementById("addStaffModal");
    const editStaffModal = document.getElementById("editStaffModal");

    // Forms
    const addStaffForm = document.getElementById("addStaffForm");
    const editStaffForm = document.getElementById("editStaffForm");

    let staffList = [];

    /* ==========================================================================
       HELPERS & MODAL CONTROLS
       ========================================================================== */

    function openModal(modalEl) {
        if (!modalEl) return;
        modalEl.classList.add("open");
        document.body.style.overflow = "hidden";
    }

    function closeModal(modalEl) {
        if (!modalEl) return;
        modalEl.classList.remove("open");
        document.body.style.overflow = "";
    }

    function showTableMessage(message) {
        if (!staffTableBody) return;
        staffTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 36px; color: #70776c;">${escapeHtml(message)}</td></tr>`;
        if (resultCount) resultCount.textContent = "";
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getDepartmentBadgeClass(dept) {
        const d = (dept || "").toLowerCase();
        if (d.includes("transport")) return "dept-transport";
        if (d.includes("account") || d.includes("finance")) return "dept-accounts";
        if (d.includes("library")) return "dept-library";
        if (d.includes("support") || d.includes("maintenance")) return "dept-support";
        return "dept-admin";
    }

    /* ==========================================================================
       STATS & FILTERS
       ========================================================================== */

    function updateStats() {
        const total = staffList.length;
        const admin = staffList.filter(s => (s.department || "").includes("Admin") || (s.department || "").includes("Account")).length;
        const transport = staffList.filter(s => (s.department || "").includes("Transport")).length;
        const support = total - admin - transport;

        if (statTotalStaff) statTotalStaff.textContent = total;
        if (statAdminStaff) statAdminStaff.textContent = admin;
        if (statTransportStaff) statTransportStaff.textContent = transport;
        if (statSupportStaff) statSupportStaff.textContent = Math.max(0, support);
    }

    function populatePostFilter() {
        if (!postFilter) return;
        const previous = postFilter.value;
        const posts = [...new Set(staffList.map(s => String(s.post || "").trim()).filter(Boolean))].sort();

        postFilter.replaceChildren();
        const allOpt = document.createElement("option");
        allOpt.value = "";
        allOpt.textContent = "All posts";
        postFilter.appendChild(allOpt);

        posts.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p;
            postFilter.appendChild(opt);
        });

        if (posts.includes(previous)) {
            postFilter.value = previous;
        }
    }

    function getFilteredStaff() {
        const query = (staffSearch?.value || "").trim().toLowerCase();
        const selectedDept = departmentFilter?.value || "";
        const selectedPost = postFilter?.value || "";

        return staffList.filter(staff => {
            const matchesQuery = !query || [
                staff.staff_id, staff.full_name, staff.phone, staff.email, staff.post, staff.department
            ].some(val => String(val || "").toLowerCase().includes(query));

            const matchesDept = !selectedDept || String(staff.department || "").toLowerCase().includes(selectedDept.toLowerCase());
            const matchesPost = !selectedPost || String(staff.post || "") === selectedPost;

            return matchesQuery && matchesDept && matchesPost;
        });
    }

    /* ==========================================================================
       DATA LOADING & TABLE RENDERING
       ========================================================================== */

    async function loadStaff() {
        showTableMessage("Loading non-teaching staff records...");
        try {
            const data = await window.api.get("/non-teaching-staff");
            staffList = Array.isArray(data) ? data : [];
            updateStats();
            populatePostFilter();
            displayStaff(getFilteredStaff());
        } catch (error) {
            console.error("Error loading non-teaching staff:", error);
            showTableMessage("Unable to load non-teaching staff. Check your backend connection.");
        }
    }

    function displayStaff(list) {
        if (!staffTableBody) return;

        if (!list.length) {
            showTableMessage(staffList.length ? "No staff match the selected filters." : "No non-teaching staff found.");
            return;
        }

        staffTableBody.replaceChildren();

        list.forEach(staff => {
            const row = document.createElement("tr");

            // 1. Staff ID
            const idCell = document.createElement("td");
            const strongId = document.createElement("strong");
            strongId.style.color = "#475569";
            strongId.textContent = staff.staff_id;
            idCell.appendChild(strongId);
            row.appendChild(idCell);

            // 2. Name & Avatar Cell
            const nameCell = document.createElement("td");
            const userCellWrap = document.createElement("div");
            userCellWrap.className = "staff-user-cell";

            const initials = (staff.full_name || "S").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
            const avatar = document.createElement("div");
            avatar.className = "staff-avatar";
            avatar.textContent = initials;

            const textWrap = document.createElement("div");
            textWrap.className = "staff-text";
            const strongName = document.createElement("strong");
            strongName.textContent = staff.full_name;
            const spanEmail = document.createElement("span");
            spanEmail.textContent = staff.email || staff.qualification || "-";

            textWrap.append(strongName, spanEmail);
            userCellWrap.append(avatar, textWrap);
            nameCell.appendChild(userCellWrap);
            row.appendChild(nameCell);

            // 3. Phone
            const phoneCell = document.createElement("td");
            phoneCell.textContent = staff.phone || "-";
            row.appendChild(phoneCell);

            // 4. Post
            const postCell = document.createElement("td");
            postCell.style.fontWeight = "600";
            postCell.textContent = staff.post || "Staff";
            row.appendChild(postCell);

            // 5. Department
            const deptCell = document.createElement("td");
            const deptBadge = document.createElement("span");
            deptBadge.className = `dept-badge ${getDepartmentBadgeClass(staff.department)}`;
            deptBadge.textContent = staff.department || "General";
            deptCell.appendChild(deptBadge);
            row.appendChild(deptCell);

            // 6. Status
            const statusCell = document.createElement("td");
            const statusBadge = document.createElement("span");
            statusBadge.className = "dept-badge";
            statusBadge.style.background = "#ecfdf5";
            statusBadge.style.color = "#047857";
            statusBadge.style.borderColor = "#a7f3d0";
            statusBadge.textContent = staff.status || "Active";
            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            // 7. Actions
            const actionCell = document.createElement("td");
            actionCell.className = "staff-actions";
            actionCell.style.textAlign = "right";
            actionCell.style.justifyContent = "flex-end";

            const infoBtn = document.createElement("button");
            infoBtn.type = "button";
            infoBtn.className = "info-btn";
            infoBtn.textContent = "Info";
            infoBtn.addEventListener("click", () => viewStaffInfo(staff.staff_key));

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "edit-btn";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => editStaff(staff.staff_key));

            const salaryBtn = document.createElement("a");
            salaryBtn.href = "salary.html";
            salaryBtn.className = "salary-btn";
            salaryBtn.title = "Manage Salary in Salary Section";
            salaryBtn.textContent = "Salary";

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "delete-btn";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", () => deleteStaff(staff.staff_key, staff.full_name));

            actionCell.append(infoBtn, editBtn, salaryBtn, delBtn);
            row.appendChild(actionCell);

            staffTableBody.appendChild(row);
        });

        if (resultCount) {
            resultCount.textContent = `Showing ${list.length} of ${staffList.length} non-teaching staff members`;
        }
    }

    /* ==========================================================================
       VIEW & EDIT MODAL HANDLERS
       ========================================================================== */

    async function viewStaffInfo(staffKey) {
        try {
            const data = await window.api.get(`/non-teaching-staff/${encodeURIComponent(staffKey)}`);
            if (!data) return;

            const initials = (data.full_name || "N").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
            document.getElementById("modalInfoAvatar").textContent = initials;
            document.getElementById("modalInfoName").textContent = data.full_name;
            document.getElementById("modalInfoPostDept").textContent = `${data.post} • ${data.department}`;

            document.getElementById("modalInfoStaffId").textContent = data.staff_id;
            document.getElementById("modalInfoGender").textContent = data.gender || "Male";
            document.getElementById("modalInfoPhone").textContent = data.phone || "-";
            document.getElementById("modalInfoEmail").textContent = data.email || "-";
            document.getElementById("modalInfoQualification").textContent = data.qualification || "-";
            document.getElementById("modalInfoDoj").textContent = data.date_of_joining || "-";
            document.getElementById("modalInfoCl").textContent = `${data.cl_balance ?? 12} Days`;
            document.getElementById("modalInfoStatus").textContent = data.professional?.status || "Active";

            const addr = data.address || {};
            const fullAddr = [addr.house_no, addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
            document.getElementById("modalInfoAddress").textContent = fullAddr || "Campus Staff Quarters, New Delhi";

            openModal(staffInfoModal);
        } catch (error) {
            console.error("Error viewing staff info:", error);
            alert("Could not load details for this staff member.");
        }
    }

    async function editStaff(staffKey) {
        try {
            const data = await window.api.get(`/non-teaching-staff/${encodeURIComponent(staffKey)}`);
            if (!data) return;

            document.getElementById("editStaffKey").value = data.staff_key;
            document.getElementById("editFullName").value = data.full_name || "";
            document.getElementById("editPost").value = data.post || "";
            document.getElementById("editGender").value = data.gender || "Male";
            document.getElementById("editPhone").value = data.phone || "";
            document.getElementById("editEmail").value = data.email || "";
            document.getElementById("editQualification").value = data.qualification || "";

            const addr = data.address || {};
            document.getElementById("editStreet").value = addr.street || "";
            document.getElementById("editCity").value = addr.city || "";

            openModal(editStaffModal);
        } catch (error) {
            console.error("Error loading edit staff form:", error);
            alert("Could not load staff data for editing.");
        }
    }

    /* ==========================================================================
       DELETE HANDLER
       ========================================================================== */

    function deleteStaff(staffKey, staffName) {
        if (typeof window.showDeleteConfirmationModal === "function") {
            window.showDeleteConfirmationModal({
                title: "Delete Non-Teaching Staff?",
                initialMessage: `You are about to delete ${staffName}.`,
                confirmMessage: `Are you sure you want to permanently delete ${staffName} from non-teaching staff?`,
                countdownSeconds: 3,
                onConfirm: async () => {
                    try {
                        await window.api.delete(`/non-teaching-staff/${encodeURIComponent(staffKey)}`);
                        alert("Staff member deleted successfully.");
                        await loadStaff();
                    } catch (error) {
                        console.error("Error deleting staff:", error);
                        alert(error.message || "Failed to delete staff member.");
                    }
                }
            });
        } else {
            if (confirm(`Are you sure you want to permanently delete ${staffName}?`)) {
                window.api.delete(`/non-teaching-staff/${encodeURIComponent(staffKey)}`)
                    .then(() => {
                        alert("Staff member deleted successfully.");
                        loadStaff();
                    })
                    .catch(err => {
                        console.error("Delete error:", err);
                        alert(err.message || "Failed to delete staff member.");
                    });
            }
        }
    }

    /* ==========================================================================
       FORM SUBMISSION HANDLERS
       ========================================================================== */

    async function handleAddStaffSubmit(e) {
        e.preventDefault();
        const saveBtn = document.getElementById("saveStaffBtn");
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        const payload = {
            full_name: document.getElementById("newFullName").value.trim(),
            post: document.getElementById("newPost").value.trim(),
            gender: document.getElementById("newGender").value,
            phone: document.getElementById("newPhone").value.trim(),
            email: document.getElementById("newEmail").value.trim(),
            qualification: document.getElementById("newQualification").value.trim() || "Graduate",
            street: document.getElementById("newStreet").value.trim() || "Campus Road",
            city: document.getElementById("newCity").value.trim() || "City",
            state: "State",
            pincode: "110001",
            category: "General",
            blood_group: "B+",
            cl: 12
        };

        try {
            const res = await window.api.post("/non-teaching-staff", payload);
            alert(res.message || "Non-teaching staff added successfully!");
            addStaffForm.reset();
            closeModal(addStaffModal);
            await loadStaff();
        } catch (error) {
            console.error("Add staff error:", error);
            alert(error.message || "Failed to add non-teaching staff.");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Staff Member";
        }
    }

    async function handleEditStaffSubmit(e) {
        e.preventDefault();
        const staffKey = document.getElementById("editStaffKey").value;
        const updateBtn = document.getElementById("updateStaffBtn");
        updateBtn.disabled = true;
        updateBtn.textContent = "Updating...";

        const payload = {
            full_name: document.getElementById("editFullName").value.trim(),
            post: document.getElementById("editPost").value.trim(),
            gender: document.getElementById("editGender").value,
            phone: document.getElementById("editPhone").value.trim(),
            email: document.getElementById("editEmail").value.trim(),
            qualification: document.getElementById("editQualification").value.trim() || "Graduate",
            street: document.getElementById("editStreet").value.trim() || "Campus Road",
            city: document.getElementById("editCity").value.trim() || "City",
            state: "State",
            pincode: "110001",
            category: "General",
            blood_group: "B+",
            cl: 12
        };

        try {
            const res = await window.api.put(`/non-teaching-staff/${encodeURIComponent(staffKey)}`, payload);
            alert(res.message || "Staff details updated successfully!");
            closeModal(editStaffModal);
            await loadStaff();
        } catch (error) {
            console.error("Edit staff error:", error);
            alert(error.message || "Failed to update staff details.");
        } finally {
            updateBtn.disabled = false;
            updateBtn.textContent = "Update Staff Member";
        }
    }

    /* ==========================================================================
       EVENT BINDINGS & INIT
       ========================================================================== */

    function bindEvents() {
        staffSearch?.addEventListener("input", () => displayStaff(getFilteredStaff()));
        departmentFilter?.addEventListener("change", () => displayStaff(getFilteredStaff()));
        postFilter?.addEventListener("change", () => displayStaff(getFilteredStaff()));

        clearFiltersBtn?.addEventListener("click", () => {
            if (staffSearch) staffSearch.value = "";
            if (departmentFilter) departmentFilter.value = "";
            if (postFilter) postFilter.value = "";
            displayStaff(getFilteredStaff());
        });

        addStaffBtn?.addEventListener("click", () => {
            addStaffForm.reset();
            openModal(addStaffModal);
        });

        // Close modal buttons
        document.querySelectorAll("[data-close]").forEach(btn => {
            btn.addEventListener("click", () => {
                const modalId = btn.dataset.close;
                closeModal(document.getElementById(modalId));
            });
        });

        // Overlay click
        document.querySelectorAll(".staff-modal-overlay").forEach(overlay => {
            overlay.addEventListener("click", e => {
                if (e.target === overlay) closeModal(overlay);
            });
        });

        // Escape key
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                document.querySelectorAll(".staff-modal-overlay.open").forEach(closeModal);
            }
        });

        if (addStaffForm) addStaffForm.addEventListener("submit", handleAddStaffSubmit);
        if (editStaffForm) editStaffForm.addEventListener("submit", handleEditStaffSubmit);
    }

    function init() {
        bindEvents();
        loadStaff();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

})();
