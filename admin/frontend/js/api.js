
/* ==========================================================================
   SHARED AUTHENTICATED API CLIENT
   Centralized API requests and Admin session handling.
   ========================================================================== */

(function (window) {
    "use strict";

    const SESSION_STORAGE_KEY = "abc_school_session";

    function getDefaultApiBaseUrl() {
        const { hostname, protocol } = window.location;

        // Keep local frontend/API hostnames identical so SameSite=Lax cookies
        // work in development. Production must configure API_BASE_URL
        // explicitly before this script loads.
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return `${protocol}//${hostname}:8000`;
        }

        return null;
    }

    /*
     * Configure window.API_BASE_URL before this script loads when deploying.
     * Only HTTP(S) URLs are accepted. HTTPS pages must use HTTPS APIs.
     */
    function validateApiBaseUrl(value) {
        let url;

        try {
            url = new URL(value);
        } catch {
            throw new Error("Invalid API_BASE_URL configuration.");
        }

        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error("API_BASE_URL must use HTTP or HTTPS.");
        }

        if (url.username || url.password || url.search || url.hash) {
            throw new Error("API_BASE_URL contains unsupported URL components.");
        }

        if (
            window.location.protocol === "https:" &&
            url.protocol !== "https:"
        ) {
            throw new Error("An HTTPS frontend requires an HTTPS API.");
        }

        return url.href.replace(/\/+$/, "");
    }

    let apiBase;

    try {
        apiBase = validateApiBaseUrl(
            window.API_BASE_URL || getDefaultApiBaseUrl()
        );
    } catch (error) {
        console.error("API configuration error:", error);
        apiBase = null;
    }

    window.API_BASE_URL = apiBase;

    /* ========================================
       GET ADMIN SESSION
    ======================================== */
    function getAdminSession() {
        try {
            const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (!raw) return null;

            const session = JSON.parse(raw);
            if (
                !session ||
                session.authenticated !== true ||
                !session.user ||
                !["admin", "teacher", "staff"].includes(session.user.role)
            ) {
                return null;
            }

            return session;
        } catch (error) {
            console.error("Unable to read Admin session:", error);
            return null;
        }
    }

    /* ========================================
       REDIRECT TO LOGIN
    ======================================== */
    function redirectToLogin() {
        try {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (error) {
            console.error("Unable to clear session:", error);
        }

        const path = window.location.pathname.toLowerCase();

        const isLoginPage =
            path.endsWith("/login.html") ||
            path.endsWith("/login") ||
            path === "/" ||
            path.endsWith("/html/");

        if (!isLoginPage) {
            window.location.replace("login.html");
        }
    }

    /* ========================================
       RESOLVE API URL
    ======================================== */
    
    function resolveApiUrl(endpoint) {
        if (!apiBase) {
            throw new Error("Backend API URL is not configured correctly.");
        }
    
        if (typeof endpoint !== "string" || !endpoint.trim()) {
            throw new Error("A valid API endpoint is required.");
        }
    
        if (endpoint.startsWith("//") || endpoint.includes("\\")) {
            throw new Error("Invalid API endpoint.");
        }
    
        const url = /^[a-z][a-z\d+.-]*:/i.test(endpoint)
            ? new URL(endpoint)
            : new URL(`${apiBase}/${endpoint.replace(/^\/+/, "")}`);
    
        // Only permit requests to the configured backend origin.
        if (url.origin !== new URL(apiBase).origin) {
            throw new Error("API endpoint origin is not allowed.");
        }
    
        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error("Unsupported API protocol.");
        }
    
        return url.href;
    }


    /* ========================================
       AUTHENTICATED FETCH
    ======================================== */
    async function authenticatedFetch(endpoint, options = {}) {
        const url = resolveApiUrl(endpoint);

        if (!options || typeof options !== "object") {
            throw new Error("Invalid request options.");
        }

        const headers = new Headers(options.headers || {});

        if (
            typeof options.body === "string" &&
            !headers.has("Content-Type") &&
            /^[\s]*[\[{]/.test(options.body)
        ) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: "include"
        });

        if (response.status === 401) {
            redirectToLogin();
            throw new Error(
                "Admin session expired or invalid. Please log in again."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "Access forbidden. Your role is not permitted to perform this action."
            );
        }

        return response;
    }

    async function logout() {
        try {
            return await fetch(resolveApiUrl("/api/auth/logout"), {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" }
            });
        } finally {
            try {
                sessionStorage.removeItem(SESSION_STORAGE_KEY);
            } catch (error) {
                console.error("Unable to clear session metadata:", error);
            }
        }
    }

    /* ========================================
       OPTIONAL REST HELPERS
    ======================================== */
    const api = {
        logout,
        fetch: authenticatedFetch,
        getSession: getAdminSession,
        redirectToLogin,

        get(endpoint, options = {}) {
            return authenticatedFetch(endpoint, {
                ...options,
                method: "GET"
            });
        },

        post(endpoint, data = null, options = {}) {
            const request = { ...options, method: "POST" };

            if (data !== null && data !== undefined) {
                request.body =
                    typeof data === "string"
                        ? data
                        : JSON.stringify(data);
            }

            return authenticatedFetch(endpoint, request);
        },

        put(endpoint, data = null, options = {}) {
            const request = { ...options, method: "PUT" };

            if (data !== null && data !== undefined) {
                request.body =
                    typeof data === "string"
                        ? data
                        : JSON.stringify(data);
            }

            return authenticatedFetch(endpoint, request);
        },

        patch(endpoint, data = null, options = {}) {
            const request = { ...options, method: "PATCH" };

            if (data !== null && data !== undefined) {
                request.body =
                    typeof data === "string"
                        ? data
                        : JSON.stringify(data);
            }

            return authenticatedFetch(endpoint, request);
        },

        delete(endpoint, options = {}) {
            return authenticatedFetch(endpoint, {
                ...options,
                method: "DELETE"
            });
        }
    };

    window.authenticatedFetch = authenticatedFetch;
    window.getAdminSession = getAdminSession;
    window.api = api;

})(window);
