/**
 * Servidor Ollama determinístico para a suite E2E.
 *
 * O primeiro pedido de chat do Coding Agent recebe uma chamada à ferramenta
 * `run_command`; depois de existir um resultado de ferramenta no histórico, o
 * modelo devolve a resposta final. Nada aqui contacta o Ollama real.
 */
import http from 'node:http';

const port = Number(process.argv[2] || 11435);
let chatRequests = 0;

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { status: 'ok', chat_requests: chatRequests });
    return;
  }
  if (request.method === 'GET' && request.url === '/api/tags') {
    sendJson(response, 200, { models: [] });
    return;
  }
  if (request.method === 'GET' && request.url === '/api/ps') {
    sendJson(response, 200, { models: [] });
    return;
  }
  if (request.method === 'POST' && request.url === '/api/chat') {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      chatRequests += 1;
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const hasToolResult = messages.some((message) => message.role === 'tool');
      const model = typeof body.model === 'string' ? body.model : 'e2e-model';

      if (!hasToolResult) {
        sendJson(response, 200, {
          model,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'run_command',
                  arguments: { command: 'echo e2e-coding-ok', timeout_seconds: 30 },
                },
              },
            ],
          },
          done: true,
          done_reason: 'tool_calls',
          prompt_eval_count: 12,
          eval_count: 8,
        });
        return;
      }

      sendJson(response, 200, {
        model,
        message: { role: 'assistant', content: 'Execução E2E concluída.' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 18,
        eval_count: 7,
      });
    });
    return;
  }
  sendJson(response, 404, { error: 'not found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Fake Ollama E2E em http://127.0.0.1:${port} (pedidos de chat: ${chatRequests})`);
});
