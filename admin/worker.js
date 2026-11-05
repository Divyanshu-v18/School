
const BACKEND_URL = "https://school-backend-99n7.onrender.com";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // Serve frontend static files through Cloudflare Assets.
        const isStaticFile =
            pathname === "/" ||
            pathname === "/index.html" ||
            pathname.startsWith("/html/") ||
            pathname.startsWith("/css/") ||
            pathname.startsWith("/js/") ||
            pathname.startsWith("/assets/") ||
            pathname.startsWith("/tests/") ||
            /\.(html|css|js|json|png|jpg|jpeg|svg|ico|woff2?|ttf)$/i.test(pathname);

        if (isStaticFile) {
            return env.ASSETS.fetch(request);
        }

        // Forward API/backend requests to Render.
        const backendUrl = new URL(
            pathname + url.search,
            BACKEND_URL
        );

        const headers = new Headers(request.headers);

        // Preserve the frontend origin for backend origin/CSRF checks.
        headers.set("Origin", url.origin);

        const backendRequest = new Request(backendUrl, {
            method: request.method,
            headers,
            body: ["GET", "HEAD"].includes(request.method)
                ? undefined
                : request.body,
            redirect: "manual"
        });

        const response = await fetch(backendRequest);

        // Do not cache authenticated API responses.
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Cache-Control", "no-store");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });
    }
};
