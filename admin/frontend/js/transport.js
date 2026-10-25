document.addEventListener("DOMContentLoaded", () => {
    // Current in-memory datasets
    let allStudents = [];
    let allDrivers = [];
    let allVehicles = [];
    let allDirectoryStudents = []; // From /students for modal dropdown

    // Tab buttons & panels
    const tabStudentsBtn = document.getElementById("tabStudentsBtn");
    const tabDriversBtn = document.getElementById("tabDriversBtn");
    const tabVehiclesBtn = document.getElementById("tabVehiclesBtn");

    const panelStudents = document.getElementById("panelStudents");
    const panelDrivers = document.getElementById("panelDrivers");
    const panelVehicles = document.getElementById("panelVehicles");

    // KPI / Count elements
    const statStudentCount = document.getElementById("statStudentCount");
    const statDriverCount = document.getElementById("statDriverCount");
    const statVehicleCount = document.getElementById("statVehicleCount");

    const tabCountStudents = document.getElementById("tabCountStudents");
    const tabCountDrivers = document.getElementById("tabCountDrivers");
    const tabCountVehicles = document.getElementById("tabCountVehicles");

    // Table bodies
    const studentsTableBody = document.getElementById("studentsTableBody");
    const driversTableBody = document.getElementById("driversTableBody");
    const vehiclesTableBody = document.getElementById("vehiclesTableBody");

    // Filters and search inputs
    const studentSearchInput = document.getElementById("studentSearchInput");
    const studentClassFilter = document.getElementById("studentClassFilter");
    const studentRouteFilter = document.getElementById("studentRouteFilter");

    const driverSearchInput = document.getElementById("driverSearchInput");
    const driverStatusFilter = document.getElementById("driverStatusFilter");

    const vehicleSearchInput = document.getElementById("vehicleSearchInput");
    const vehicleTypeFilter = document.getElementById("vehicleTypeFilter");

    // Modal elements
    const addModal = document.getElementById("addModal");
    const openAddBtn = document.getElementById("openAddBtn");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const modalTitle = document.getElementById("modalTitle");

    const modalTypeStudentBtn = document.getElementById("modalTypeStudentBtn");
    const modalTypeDriverBtn = document.getElementById("modalTypeDriverBtn");
    const modalTypeVehicleBtn = document.getElementById("modalTypeVehicleBtn");

    const studentEnrollForm = document.getElementById("studentEnrollForm");
    const driverAddForm = document.getElementById("driverAddForm");
    const vehicleAddForm = document.getElementById("vehicleAddForm");

    const cancelEnrollBtn = document.getElementById("cancelEnrollBtn");
    const cancelDriverBtn = document.getElementById("cancelDriverBtn");
    const cancelVehicleBtn = document.getElementById("cancelVehicleBtn");

    const enrollStudentSelect = document.getElementById("enrollStudentSelect");
    const enrollRoute = document.getElementById("enrollRoute");
    const enrollStop = document.getElementById("enrollStop");
    const enrollPhone = document.getElementById("enrollPhone");

    const driverVehicleSelect = document.getElementById("driverVehicle");

    // ==========================================
    // TAB NAVIGATION
    // ==========================================
    function switchTab(targetTab) {
        // Tab buttons
        [tabStudentsBtn, tabDriversBtn, tabVehiclesBtn].forEach(btn => {
            if (!btn) return;
            if (btn.getAttribute("data-tab") === targetTab) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        // Tab panels
        if (panelStudents) panelStudents.classList.toggle("active", targetTab === "students");
        if (panelDrivers) panelDrivers.classList.toggle("active", targetTab === "drivers");
        if (panelVehicles) panelVehicles.classList.toggle("active", targetTab === "vehicles");
    }

    if (tabStudentsBtn) tabStudentsBtn.addEventListener("click", () => switchTab("students"));
    if (tabDriversBtn) tabDriversBtn.addEventListener("click", () => switchTab("drivers"));
    if (tabVehiclesBtn) tabVehiclesBtn.addEventListener("click", () => switchTab("vehicles"));

    // ==========================================
    // INITIAL LOAD
    // ==========================================
    async function loadAllData() {
        await Promise.all([
            fetchStudents(),
            fetchDrivers(),
            fetchVehicles(),
            fetchDirectoryStudents()
        ]);
        populateRouteFiltersAndDropdowns();
        updateStats();
    }

    // 1. Fetch enrolled students
    async function fetchStudents() {
        try {
            const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/students`);
            if (!res.ok) throw new Error("Failed to fetch transport students");
            allStudents = await res.json();
            renderStudentsTable();
        } catch (err) {
            console.error("Error loading transport students:", err);
            if (studentsTableBody) {
                studentsTableBody.innerHTML = `<tr><td colspan="8" class="table-loading">Failed to load transport enrolled students.</td></tr>`;
            }
        }
    }

    // 2. Fetch drivers
    async function fetchDrivers() {
        try {
            const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/drivers`);
            if (!res.ok) throw new Error("Failed to fetch drivers");
            allDrivers = await res.json();
            renderDriversTable();
        } catch (err) {
            console.error("Error loading drivers:", err);
            if (driversTableBody) {
                driversTableBody.innerHTML = `<tr><td colspan="8" class="table-loading">Failed to load drivers list.</td></tr>`;
            }
        }
    }

    // 3. Fetch vehicles
    async function fetchVehicles() {
        try {
            const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/vehicles`);
            if (!res.ok) throw new Error("Failed to fetch vehicles");
            allVehicles = await res.json();
            renderVehiclesTable();
        } catch (err) {
            console.error("Error loading vehicles:", err);
            if (vehiclesTableBody) {
                vehiclesTableBody.innerHTML = `<tr><td colspan="8" class="table-loading">Failed to load vehicles list.</td></tr>`;
            }
        }
    }

    // 4. Fetch full student directory for enrollment modal
    async function fetchDirectoryStudents() {
        try {
            const res = await authenticatedFetch(`${window.API_BASE_URL}/students`);
            if (res.ok) {
                allDirectoryStudents = await res.json();
                populateStudentDirectoryDropdown();
            }
        } catch (err) {
            console.warn("Could not load student directory for dropdown:", err);
        }
    }

    // ==========================================
    // STATS & KPI UPDATES
    // ==========================================
    function updateStats() {
        const studentCount = allStudents.length;
        const driverCount = allDrivers.length;
        const vehicleCount = allVehicles.length;

        if (statStudentCount) statStudentCount.textContent = studentCount;
        if (statDriverCount) statDriverCount.textContent = driverCount;
        if (statVehicleCount) statVehicleCount.textContent = vehicleCount;

        if (tabCountStudents) tabCountStudents.textContent = studentCount;
        if (tabCountDrivers) tabCountDrivers.textContent = driverCount;
        if (tabCountVehicles) tabCountVehicles.textContent = vehicleCount;
    }

    // ==========================================
    // RENDER: STUDENTS ENROLLED IN TRANSPORT
    // ==========================================
    function renderStudentsTable() {
        if (!studentsTableBody) return;

        const term = (studentSearchInput?.value || "").toLowerCase().trim();
        const selectedClass = (studentClassFilter?.value || "").trim().toUpperCase();
        const selectedRoute = (studentRouteFilter?.value || "").trim();

        const filtered = allStudents.filter(item => {
            const matchesSearch =
                (item.full_name || "").toLowerCase().includes(term) ||
                String(item.student_id).includes(term) ||
                (item.pickup_drop_stop || "").toLowerCase().includes(term) ||
                (item.route_name || "").toLowerCase().includes(term) ||
                (item.vehicle_number || "").toLowerCase().includes(term);

            const matchesClass = !selectedClass || String(item.class).toUpperCase() === selectedClass;
            const matchesRoute = !selectedRoute || item.route_name === selectedRoute;

            return matchesSearch && matchesClass && matchesRoute;
        });

        if (filtered.length === 0) {
            studentsTableBody.innerHTML = `<tr><td colspan="8" class="table-loading">No transport-enrolled students match the criteria.</td></tr>`;
            return;
        }

        studentsTableBody.innerHTML = filtered.map(item => `
            <tr>
                <td><strong>#${escapeHtml(item.student_id)}</strong></td>
                <td>
                    <strong>${escapeHtml(item.full_name)}</strong>
                    ${item.admission_no ? `<div style="font-size: 11px; color: #888;">Adm: ${escapeHtml(item.admission_no)}</div>` : ''}
                </td>
                <td><span style="font-weight: 600;">Class ${escapeHtml(item.class || '-')}</span> ${escapeHtml(item.section ? `(${item.section})` : '')}</td>
                <td>📍 ${escapeHtml(item.pickup_drop_stop)}</td>
                <td><span class="route-badge">${escapeHtml(item.route_name)}</span></td>
                <td><span class="bus-badge">${escapeHtml(item.vehicle_number || 'Unassigned')}</span></td>
                <td>📞 ${escapeHtml(item.emergency_contact || '-')}</td>
                <td style="text-align: center;">
                    <button class="btn-table-remove" type="button"
                        data-delete-type="student"
                        data-record-id="${escapeHtml(item.enrollment_id)}">
                        Remove
                    </button>
                </td>
            </tr>
        `).join("");
    }

    // ==========================================
    // RENDER: DRIVERS LIST
    // ==========================================
    function renderDriversTable() {
        if (!driversTableBody) return;

        const term = (driverSearchInput?.value || "").toLowerCase().trim();
        const selectedStatus = (driverStatusFilter?.value || "").trim();

        const filtered = allDrivers.filter(d => {
            const matchesSearch =
                (d.full_name || "").toLowerCase().includes(term) ||
                (d.phone || "").toLowerCase().includes(term) ||
                (d.license_number || "").toLowerCase().includes(term) ||
                (d.route_name || "").toLowerCase().includes(term) ||
                (d.vehicle_number || "").toLowerCase().includes(term);

            const matchesStatus = !selectedStatus || d.status === selectedStatus;
            return matchesSearch && matchesStatus;
        });

        if (filtered.length === 0) {
            driversTableBody.innerHTML = `<tr><td colspan="8" class="table-loading">No drivers found matching criteria.</td></tr>`;
            return;
        }

        driversTableBody.innerHTML = filtered.map(d => {
            let statusClass = "active";
            if (d.status === "On Route") statusClass = "on-route";
            else if (d.status === "On Leave") statusClass = "on-leave";

            return `
                <tr>
                    <td><strong>#DR-${d.driver_id}</strong></td>
                    <td>
                        <strong>${escapeHtml(d.full_name)}</strong>
                    </td>
                    <td>📞 ${escapeHtml(d.phone)}</td>
                    <td><code style="font-size: 13px; font-weight: 600;">${escapeHtml(d.license_number)}</code></td>
                    <td>
                        ${d.vehicle_number ? `<span class="bus-badge">${escapeHtml(d.vehicle_number)}</span>` : '<span style="color:#999; font-style:italic;">None Assigned</span>'}
                    </td>
                    <td>
                        ${d.route_name ? `<span class="route-badge">${escapeHtml(d.route_name)}</span>` : '<span style="color:#999;">-</span>'}
                    </td>
                    <td>
                        <span class="status-badge ${statusClass}">${escapeHtml(d.status)}</span>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-table-remove" type="button"
                            data-delete-type="driver"
                            data-record-id="${escapeHtml(d.driver_id)}">
                            Delete
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // ==========================================
    // RENDER: VEHICLES LIST
    // ==========================================
    function renderVehiclesTable() {
        if (!vehiclesTableBody) return;

        const term = (vehicleSearchInput?.value || "").toLowerCase().trim();
        const selectedType = (vehicleTypeFilter?.value || "").trim();

        const filtered = allVehicles.filter(v => {
            const matchesSearch =
                (v.vehicle_number || "").toLowerCase().includes(term) ||
                (v.model_name || "").toLowerCase().includes(term) ||
                (v.route_name || "").toLowerCase().includes(term) ||
                (v.driver_name || "").toLowerCase().includes(term);

            const matchesType = !selectedType || v.vehicle_type === selectedType;
            return matchesSearch && matchesType;
        });

        if (filtered.length === 0) {
            vehiclesTableBody.innerHTML = `<tr><td colspan="8" class="table-loading">No vehicles found matching criteria.</td></tr>`;
            return;
        }

        vehiclesTableBody.innerHTML = filtered.map(v => {
            let statusClass = "active";
            if (v.status === "Maintenance") statusClass = "maintenance";
            else if (v.status === "Inactive") statusClass = "inactive";

            return `
                <tr>
                    <td>
                        <span class="bus-badge">${escapeHtml(v.vehicle_number)}</span>
                    </td>
                    <td>
                        <strong>${escapeHtml(v.vehicle_type)}</strong>
                        <div style="font-size: 12px; color: #666;">${escapeHtml(v.model_name)}</div>
                    </td>
                    <td><strong>${escapeHtml(v.capacity)} Seats</strong></td>
                    <td>
                        ${v.driver_name ? `<strong>👨‍✈️ ${escapeHtml(v.driver_name)}</strong><div style="font-size: 11px; color: #888;">${escapeHtml(v.driver_phone || '')}</div>` : '<span style="color: #999; font-style: italic;">No Driver</span>'}
                    </td>
                    <td>
                        <span class="route-badge">${escapeHtml(v.route_name)}</span>
                    </td>
                    <td>
                        ${v.fitness_expiry ? `<span style="font-size: 13px;">📅 ${escapeHtml(v.fitness_expiry)}</span>` : '<span style="color:#888;">N/A</span>'}
                    </td>
                    <td>
                        <span class="status-badge ${statusClass}">${escapeHtml(v.status)}</span>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-table-remove" type="button"
                            data-delete-type="vehicle"
                            data-record-id="${escapeHtml(v.vehicle_id)}">
                            Delete
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // ==========================================
    // POPULATE DROPDOWNS & FILTER OPTIONS
    // ==========================================
    function populateRouteFiltersAndDropdowns() {
        // Collect unique routes from vehicles and enrollments
        const routes = new Set();
        allVehicles.forEach(v => { if (v.route_name) routes.add(v.route_name); });
        allStudents.forEach(s => { if (s.route_name) routes.add(s.route_name); });

        // Route filter on student tab
        if (studentRouteFilter) {
            const currentVal = studentRouteFilter.value;
            studentRouteFilter.innerHTML = `<option value="">All Routes</option>` +
                Array.from(routes).sort().map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
            studentRouteFilter.value = currentVal;
        }

        // Route select in Student Enrollment modal
        if (enrollRoute) {
            if (allVehicles.length > 0) {
                enrollRoute.innerHTML = allVehicles.map(v => `
                    <option value="${escapeHtml(v.route_name)}" data-vehicle-id="${v.vehicle_id}">
                        ${escapeHtml(v.route_name)} (${escapeHtml(v.vehicle_number)})
                    </option>
                `).join("");
            } else {
                enrollRoute.innerHTML = `<option value="Route 01 - Main Campus">Route 01 - Main Campus</option>`;
            }
        }

        // Assigned vehicle in Add Driver modal
        if (driverVehicleSelect) {
            driverVehicleSelect.innerHTML = `<option value="">-- No Vehicle Assigned --</option>` +
                allVehicles.map(v => `
                    <option value="${v.vehicle_id}">
                        ${escapeHtml(v.vehicle_number)} - ${escapeHtml(v.vehicle_type)} (${escapeHtml(v.route_name)})
                    </option>
                `).join("");
        }
    }

    function populateStudentDirectoryDropdown() {
        if (!enrollStudentSelect) return;
        if (allDirectoryStudents.length === 0) {
            enrollStudentSelect.innerHTML = `<option value="">-- No Students Found in Directory --</option>`;
            return;
        }

        // Filter out students already enrolled or show all with indicator
        const enrolledSet = new Set(allStudents.map(s => Number(s.student_id)));

        enrollStudentSelect.innerHTML = `<option value="">-- Choose Student to Enroll --</option>` +
            allDirectoryStudents.map(s => {
                const isEnrolled = enrolledSet.has(Number(s.student_id));
                return `
                    <option value="${escapeHtml(s.student_id)}" data-phone="${escapeHtml(s.father_phone || s.mother_phone || '')}" ${isEnrolled ? 'disabled' : ''}>
                        #${s.student_id} - ${escapeHtml(s.full_name)} (Class ${escapeHtml(s.class || '-')}${s.section ? ' ' + s.section : ''}) ${isEnrolled ? '[Already Enrolled]' : ''}
                    </option>
                `;
            }).join("");
    }

    // Auto-fill phone when student selected in modal
    if (enrollStudentSelect && enrollPhone) {
        enrollStudentSelect.addEventListener("change", (e) => {
            const selectedOpt = enrollStudentSelect.selectedOptions[0];
            if (selectedOpt && selectedOpt.dataset.phone) {
                enrollPhone.value = selectedOpt.dataset.phone;
            }
        });
    }

    // ==========================================
    // FILTER & SEARCH EVENT LISTENERS
    // ==========================================
    if (studentSearchInput) studentSearchInput.addEventListener("input", renderStudentsTable);
    if (studentClassFilter) studentClassFilter.addEventListener("change", renderStudentsTable);
    if (studentRouteFilter) studentRouteFilter.addEventListener("change", renderStudentsTable);

    if (driverSearchInput) driverSearchInput.addEventListener("input", renderDriversTable);
    if (driverStatusFilter) driverStatusFilter.addEventListener("change", renderDriversTable);

    if (vehicleSearchInput) vehicleSearchInput.addEventListener("input", renderVehiclesTable);
    if (vehicleTypeFilter) vehicleTypeFilter.addEventListener("change", renderVehiclesTable);

    // ==========================================
    // MODAL LOGIC & SWITCHER
    // ==========================================
    function setModalForm(type) {
        [modalTypeStudentBtn, modalTypeDriverBtn, modalTypeVehicleBtn].forEach(b => b?.classList.remove("active"));
        if (studentEnrollForm) studentEnrollForm.style.display = "none";
        if (driverAddForm) driverAddForm.style.display = "none";
        if (vehicleAddForm) vehicleAddForm.style.display = "none";

        if (type === "student") {
            modalTypeStudentBtn?.classList.add("active");
            if (modalTitle) modalTitle.textContent = "Enroll Student for Transport";
            if (studentEnrollForm) studentEnrollForm.style.display = "block";
            populateStudentDirectoryDropdown();
        } else if (type === "driver") {
            modalTypeDriverBtn?.classList.add("active");
            if (modalTitle) modalTitle.textContent = "Register New Driver";
            if (driverAddForm) driverAddForm.style.display = "block";
        } else if (type === "vehicle") {
            modalTypeVehicleBtn?.classList.add("active");
            if (modalTitle) modalTitle.textContent = "Add Vehicle to Fleet";
            if (vehicleAddForm) vehicleAddForm.style.display = "block";
        }
    }

    if (modalTypeStudentBtn) modalTypeStudentBtn.addEventListener("click", () => setModalForm("student"));
    if (modalTypeDriverBtn) modalTypeDriverBtn.addEventListener("click", () => setModalForm("driver"));
    if (modalTypeVehicleBtn) modalTypeVehicleBtn.addEventListener("click", () => setModalForm("vehicle"));

    function openModal(defaultType) {
        if (!addModal) return;
        addModal.style.display = "flex";
        setModalForm(defaultType || "student");
    }

    function closeModal() {
        if (!addModal) return;
        addModal.style.display = "none";
        if (studentEnrollForm) studentEnrollForm.reset();
        if (driverAddForm) driverAddForm.reset();
        if (vehicleAddForm) vehicleAddForm.reset();
    }

    if (openAddBtn) {
        openAddBtn.addEventListener("click", () => {
            // Pick default based on active tab
            let defaultType = "student";
            if (panelDrivers?.classList.contains("active")) defaultType = "driver";
            else if (panelVehicles?.classList.contains("active")) defaultType = "vehicle";
            openModal(defaultType);
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (cancelEnrollBtn) cancelEnrollBtn.addEventListener("click", closeModal);
    if (cancelDriverBtn) cancelDriverBtn.addEventListener("click", closeModal);
    if (cancelVehicleBtn) cancelVehicleBtn.addEventListener("click", closeModal);

    // Close on overlay click
    if (addModal) {
        addModal.addEventListener("click", (e) => {
            if (e.target === addModal) closeModal();
        });
    }

    // ==========================================
    // FORM SUBMISSIONS
    // ==========================================

    // 1. Enroll Student
    if (studentEnrollForm) {
        studentEnrollForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const sid = Number(enrollStudentSelect.value);
            const route = enrollRoute.value.trim();
            const stop = enrollStop.value.trim();
            const phone = enrollPhone.value.trim();

            if (!sid || !route || !stop) {
                alert("Please fill in all required fields.");
                return;
            }

            // Find matching vehicle for this route
            const selectedOpt = enrollRoute.selectedOptions[0];
            const vId = selectedOpt ? Number(selectedOpt.dataset.vehicleId) : null;

            try {
                const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/students`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        student_id: sid,
                        route_name: route,
                        pickup_drop_stop: stop,
                        vehicle_id: vId || null,
                        emergency_contact: phone || null
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || "Failed to enroll student");
                }

                closeModal();
                await fetchStudents();
                updateStats();
                switchTab("students");
                alert("Student enrolled for transport successfully!");
            } catch (err) {
                console.error(err);
                alert("Error enrolling student: " + err.message);
            }
        });
    }

    // 2. Add Driver
    if (driverAddForm) {
        driverAddForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("driverName").value.trim();
            const phone = document.getElementById("driverPhone").value.trim();
            const license = document.getElementById("driverLicense").value.trim();
            const vId = driverVehicleSelect.value ? Number(driverVehicleSelect.value) : null;
            const status = document.getElementById("driverStatus").value;

            if (!name || !phone || !license) {
                alert("Please fill in all required fields.");
                return;
            }

            try {
                const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/drivers`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        full_name: name,
                        phone: phone,
                        license_number: license,
                        vehicle_id: vId,
                        status: status
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || "Failed to add driver");
                }

                closeModal();
                await fetchDrivers();
                await fetchVehicles(); // may link driver
                updateStats();
                switchTab("drivers");
                alert("Driver registered successfully!");
            } catch (err) {
                console.error(err);
                alert("Error registering driver: " + err.message);
            }
        });
    }

    // 3. Add Vehicle
    if (vehicleAddForm) {
        vehicleAddForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const plate = document.getElementById("vehiclePlate").value.trim();
            const type = document.getElementById("vehicleType").value;
            const model = document.getElementById("vehicleModel").value.trim();
            const capacity = Number(document.getElementById("vehicleCapacity").value);
            const route = document.getElementById("vehicleRoute").value.trim();
            const fitness = document.getElementById("vehicleFitness").value || null;

            if (!plate || !model || !capacity || !route) {
                alert("Please fill in all required fields.");
                return;
            }

            try {
                const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/vehicles`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        vehicle_number: plate,
                        vehicle_type: type,
                        model_name: model,
                        capacity: capacity,
                        route_name: route,
                        fitness_expiry: fitness,
                        status: "Active"
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || "Failed to add vehicle");
                }

                closeModal();
                await fetchVehicles();
                populateRouteFiltersAndDropdowns();
                updateStats();
                switchTab("vehicles");
                alert("Vehicle added to fleet successfully!");
            } catch (err) {
                console.error(err);
                alert("Error adding vehicle: " + err.message);
            }
        });
    }

    // ==========================================
    // GLOBAL DELETE HANDLERS (EXPOSED TO WINDOW)
    // ==========================================
    window.deleteTransportStudent = async function(enrollmentId) {
        if (!confirm("Are you sure you want to remove this student's transport enrollment?")) return;
        try {
            const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/students/${enrollmentId}`, {
                method: "DELETE"
            });
            if (!res.ok) {
                let msg = "Failed to remove enrollment";
                try {
                    const data = await res.json();
                    if (typeof data.detail === "string") msg = data.detail;
                } catch (_) {}
                throw new Error(msg);
            }
            await fetchStudents();
            updateStats();
        } catch (err) {
            alert("Error removing student: " + err.message);
        }
    };

    window.deleteTransportDriver = async function(driverId) {
        if (!confirm("Are you sure you want to delete this driver?")) return;
        try {
            const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/drivers/${driverId}`, {
                method: "DELETE"
            });
            if (!res.ok) {
                let msg = "Failed to delete driver";
                try {
                    const data = await res.json();
                    if (typeof data.detail === "string") msg = data.detail;
                } catch (_) {}
                throw new Error(msg);
            }
            await fetchDrivers();
            await fetchVehicles();
            updateStats();
        } catch (err) {
            alert("Error deleting driver: " + err.message);
        }
    };

    window.deleteTransportVehicle = async function(vehicleId) {
        if (!confirm("Are you sure you want to delete this vehicle from fleet?")) return;
        try {
            const res = await authenticatedFetch(`${window.API_BASE_URL}/transport/vehicles/${vehicleId}`, {
                method: "DELETE"
            });
            if (!res.ok) {
                let msg = "Failed to delete vehicle";
                try {
                    const data = await res.json();
                    if (typeof data.detail === "string") msg = data.detail;
                } catch (_) {}
                throw new Error(msg);
            }
            await fetchVehicles();
            await fetchDrivers();
            await fetchStudents();
            populateRouteFiltersAndDropdowns();
            updateStats();
        } catch (err) {
            alert("Error deleting vehicle: " + err.message);
        }
    };

    document.addEventListener("click", event => {
        const button = event.target.closest(
            "button[data-delete-type][data-record-id]"
        );

        if (!button) return;

        const id = Number(button.dataset.recordId);
        const type = button.dataset.deleteType;

        if (!Number.isSafeInteger(id) || id <= 0) {
            alert("Invalid record ID.");
            return;
        }

        if (type === "student") {
            window.deleteTransportStudent(id);
        } else if (type === "driver") {
            window.deleteTransportDriver(id);
        } else if (type === "vehicle") {
            window.deleteTransportVehicle(id);
        }
    });

    // Helper: Escape HTML string
    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Run initial load
    loadAllData();
});
