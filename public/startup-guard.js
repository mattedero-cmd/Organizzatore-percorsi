(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0]?.url || args[0] || "");

    if (!/\/api\/(addresses|routes)(\?|$)/.test(url)) return response;

    try {
      const data = await response.clone().json();
      if (Array.isArray(data)) return response;
      return new Response(JSON.stringify([]), {
        status: response.ok ? 200 : response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    } catch {
      return response;
    }
  };
})();
