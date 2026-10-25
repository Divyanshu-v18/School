
/* ==========================================================================
   LOGIN PAGE LOGIC & INTERACTIONS
   Handles authentication, form validation, role switching, password toggle,
   remember-me persistence, and redirect to dashboard.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const loginForm = document.getElementById("loginForm");
    const roleTabs = document.querySelectorAll(".role-tab");
    const selectedRoleInput = document.getElementById("selectedRole");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const rememberMeCheckbox = document.getElementById("rememberMe");
    const togglePasswordBtn = document.getElementById("togglePasswordBtn");
    const loginSubmitBtn = document.getElementById("loginSubmitBtn");

    const submitBtnLabel = loginSubmitBtn
        ? loginSubmitBtn.querySelector(".btn-label")
        : null;

    const loginAlert = document.getElementById("loginAlert");
    const alertMessage = document.getElementById("alertMessage");
    const usernameError = document.getElementById("usernameError");
    const passwordError = document.getElementById("passwordError");
    const demoFillBtn = document.getElementById("demoFillBtn");

    // Forgot password modal
    const forgotPasswordLink = document.getElementById("forgotPasswordLink");
    const forgotModal = document.getElementById("forgotModal");
    const closeForgotModal = document.getElementById("closeForgotModal");
    const forgotForm = document.getElementById("forgotForm");
    const resetEmailInput = document.getElementById("resetEmail");

    const SESSION_STORAGE_KEY = "abc_school_session";
    const REMEMBERED_USER_KEY = "abc_school_remembered_user";

    const ROLE_PRESETS = {
        admin: {
            username: "",
            redirect: "dashboard.html"
        },
        teacher: {
            username: "",
            redirect: "dashboard.html"
        },
        staff: {
            username: "",
            redirect: "dashboard.html"
        }
    };

    // Remembered username
    initRememberedSession();

    // Role selector
    roleTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            roleTabs.forEach(item => item.classList.remove("active"));
            tab.classList.add("active");

            if (selectedRoleInput) {
                selectedRoleInput.value =
                    tab.getAttribute("data-role") || "admin";
            }

            updateDemoDisplay(selectedRoleInput?.value || "admin");
            hideAlert();
            clearFieldErrors();
        });
    });

    // Show / hide password
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener("click", () => {
            const showPassword = passwordInput.type === "password";

            passwordInput.type = showPassword ? "text" : "password";

            togglePasswordBtn.setAttribute(
                "aria-label",
                showPassword ? "Hide password" : "Show password"
            );

            togglePasswordBtn.textContent =
                showPassword ? "👁️" : "👁️‍🗨️";
        });
    }

    // Demo fill: username only
    if (demoFillBtn && usernameInput && passwordInput) {
        demoFillBtn.addEventListener("click", () => {
            const role = selectedRoleInput?.value || "admin";

            if (role !== "admin") {
                showAlert(
                    "Only Admin login is enabled currently.",
                    "error"
                );
                return;
            }

            usernameInput.value = "";
            passwordInput.value = "";

            clearFieldErrors();
            hideAlert();
            usernameInput.focus();
        });
    }

    // Clear errors while typing
    if (usernameInput) {
        usernameInput.addEventListener("input", () => {
            setFieldError(usernameInput, usernameError, null);
            hideAlert();
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener("input", () => {
            setFieldError(passwordInput, passwordError, null);
            hideAlert();
        });
    }

    // Login form
    if (loginForm) {
        loginForm.addEventListener("submit", async event => {
            event.preventDefault();

            hideAlert();
            clearFieldErrors();

            const role = (
                selectedRoleInput?.value || "admin"
            ).trim().toLowerCase();

            const username = usernameInput?.value.trim() || "";
            const password = passwordInput?.value || "";
            const rememberMe = rememberMeCheckbox?.checked || false;

            let hasError = false;

            if (!username) {
                setFieldError(
                    usernameInput,
                    usernameError,
                    "Please enter your username or school email."
                );
                hasError = true;
            }

            if (!password) {
                setFieldError(
                    passwordInput,
                    passwordError,
                    "Please enter your account password."
                );
                hasError = true;
            }

            if (hasError) return;

            setLoading(true);

            try {
                const configuredBase = window.API_BASE_URL;

                if (
                    typeof configuredBase !== "string" ||
                    !configuredBase.trim()
                ) {
                    throw new Error("Backend API URL is not configured.");
                }

                const baseUrl = new URL(configuredBase);

                if (
                    !["http:", "https:"].includes(baseUrl.protocol) ||
                    baseUrl.username ||
                    baseUrl.password ||
                    baseUrl.search ||
                    baseUrl.hash
                ) {
                    throw new Error("Backend API URL is invalid.");
                }

                if (
                    window.location.protocol === "https:" &&
                    baseUrl.protocol !== "https:"
                ) {
                    throw new Error(
                        "The secure website requires an HTTPS backend."
                    );
                }

                const apiEndpoint =
                    `${baseUrl.href.replace(/\/+$/, "")}/api/auth/login`;

                const response = await fetch(apiEndpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        username,
                        password,
                        role
                    })
                });

                let data = {};

                try {
                    data = await response.json();
                } catch {
                    // Handle non-JSON backend responses safely.
                }

                const validLoginResponse =
                    response.ok &&
                    data.success === true &&
                    data.user &&
                    typeof data.user === "object" &&
                    ["admin", "teacher", "staff"].includes(data.user.role);

                if (!validLoginResponse) {
                    setLoading(false);

                    if (response.status === 429) {
                        showAlert(
                            "Too many failed login attempts. Please try again later.",
                            "error"
                        );
                    } else if (response.status === 401) {
                        showAlert(
                            "Invalid username or password.",
                            "error"
                        );

                        setFieldError(
                            passwordInput,
                            passwordError,
                            "Incorrect credentials provided."
                        );
                    } else if (response.status === 403) {
                        showAlert(
                            "This login role is not enabled.",
                            "error"
                        );
                    } else {
                        showAlert(
                            typeof data.detail === "string"
                                ? data.detail
                                : "Login failed. Please try again.",
                            "error"
                        );
                    }

                    return;
                }

                // Save only the username and role for Remember Me.
                try {
                    if (rememberMe) {
                        localStorage.setItem(
                            REMEMBERED_USER_KEY,
                            JSON.stringify({ username, role })
                        );
                    } else {
                        localStorage.removeItem(REMEMBERED_USER_KEY);
                    }

                    // Store UI metadata only. The HttpOnly cookie contains the
                    // session credential and cannot be read by page scripts.
                    sessionStorage.setItem(
                        SESSION_STORAGE_KEY,
                        JSON.stringify({
                            authenticated: true,
                            user: data.user,
                            loginTime: new Date().toISOString()
                        })
                    );
                } catch (storageError) {
                    // Do not leave a partial session behind.
                    try {
                        sessionStorage.removeItem(SESSION_STORAGE_KEY);
                    } catch {
                        // Storage may be unavailable.
                    }

                    throw new Error(
                        "Unable to save your login session. Check browser storage settings."
                    );
                }

                showAlert(
                    "Authentication successful! Redirecting to dashboard...",
                    "success"
                );

                if (submitBtnLabel) {
                    submitBtnLabel.textContent = "Redirecting...";
                }

                window.location.replace("dashboard.html");
            } catch (error) {
                setLoading(false);

                showAlert(
                    error.message ||
                    "Cannot connect to the authentication server.",
                    "error"
                );

                console.error("Login error:", error);
            }
        });
    }

    // Forgot password modal
    if (forgotPasswordLink && forgotModal) {
        forgotPasswordLink.addEventListener("click", event => {
            event.preventDefault();
            forgotModal.classList.add("active");
            resetEmailInput?.focus();
        });

        if (closeForgotModal) {
            closeForgotModal.addEventListener("click", () => {
                forgotModal.classList.remove("active");
            });
        }

        forgotModal.addEventListener("click", event => {
            if (event.target === forgotModal) {
                forgotModal.classList.remove("active");
            }
        });

        if (forgotForm) {
            forgotForm.addEventListener("submit", event => {
                event.preventDefault();

                const email = resetEmailInput?.value.trim() || "";

                if (!email) {
                    resetEmailInput?.focus();
                    return;
                }

                const resetBtn = forgotForm.querySelector(
                    "button[type='submit']"
                );

                if (!resetBtn) return;

                resetBtn.disabled = true;
                resetBtn.textContent = "Sending link...";

                // UI placeholder only; no reset email is sent.
                setTimeout(() => {
                    resetBtn.disabled = false;
                    resetBtn.textContent = "Send Instructions";
                    forgotModal.classList.remove("active");

                    showAlert(
                        "Password reset is not configured yet. Please contact the administrator.",
                        "error"
                    );

                    if (resetEmailInput) {
                        resetEmailInput.value = "";
                    }
                }, 900);
            });
        }
    }

    // Loading state
    function setLoading(isLoading) {
        if (!loginSubmitBtn) return;

        loginSubmitBtn.disabled = isLoading;
        loginSubmitBtn.classList.toggle("loading", isLoading);

        if (submitBtnLabel) {
            submitBtnLabel.textContent = isLoading
                ? "Authenticating..."
                : "Sign In to Portal";
        }
    }

    // Alert helpers
    function showAlert(message, type = "error") {
        if (!loginAlert || !alertMessage) return;

        loginAlert.className = `login-alert alert-${type} show`;
        alertMessage.textContent = String(message);
    }

    function hideAlert() {
        if (loginAlert) {
            loginAlert.className = "login-alert";
        }
    }

    // Field validation helpers
    function setFieldError(input, errorElement, message) {
        if (!input) return;

        const group = input.closest(".form-group");
        if (!group) return;

        if (message) {
            group.classList.add("has-error");

            if (errorElement) {
                errorElement.textContent = message;
            }
        } else {
            group.classList.remove("has-error");

            if (errorElement) {
                errorElement.textContent = "";
            }
        }
    }

    function clearFieldErrors() {
        document.querySelectorAll(".form-group").forEach(group => {
            group.classList.remove("has-error");
        });

        if (usernameError) usernameError.textContent = "";
        if (passwordError) passwordError.textContent = "";
    }

    // Demo information
    function updateDemoDisplay(role) {
        const userPill = document.getElementById("demoUserPill");
        const passPill = document.getElementById("demoPassPill");

        if (userPill) {
            userPill.textContent = role === "admin"
                ? "Enter administrator username"
                : "Login not enabled";
        }

        if (passPill) {
            passPill.textContent = "Use your configured password";
        }
    }

    // Restore remembered username and role
    function initRememberedSession() {
        try {
            const saved = localStorage.getItem(REMEMBERED_USER_KEY);
            if (!saved) return;

            const parsed = JSON.parse(saved);

            if (
                parsed &&
                typeof parsed.username === "string" &&
                usernameInput
            ) {
                usernameInput.value = parsed.username;

                if (rememberMeCheckbox) {
                    rememberMeCheckbox.checked = true;
                }
            }

            const allowedRoles = ["admin", "teacher", "staff"];

            if (
                parsed &&
                allowedRoles.includes(parsed.role)
            ) {
                const targetTab = Array.from(roleTabs).find(
                    tab => tab.getAttribute("data-role") === parsed.role
                );

                targetTab?.click();
            }
        } catch (error) {
            console.warn("Could not restore remembered username:", error);
        }
    }
});
