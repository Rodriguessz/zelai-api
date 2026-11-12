// Chamadas HTTP para os serviços das outras disciplinas, sempre com timeout:
// um serviço lento não pode travar a API do cidadão.
async function request(url, { method = 'POST', body, headers = {}, timeoutMs = 5000 } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: isForm ? headers : { 'content-type': 'application/json', ...headers },
    body: isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} respondeu HTTP ${res.status}`);
  return res.json();
}

module.exports = { request };
