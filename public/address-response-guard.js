(function () {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0]?.url || args[0] || "");

    if (!/\/api\/addresses(?:\?|$|\/)/.test(url) || !response.ok) {
      return response;
    }

    try {
      const data = await response.clone().json();
      const normalized = Array.isArray(data)
        ? data
        : Array.isArray(data?.addresses)
          ? data.addresses
          : Array.isArray(data?.items)
            ? data.items
            : [];

      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      return response;
    }
  };
})();