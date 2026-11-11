import atexit
import os
import shutil
import tempfile
from pathlib import Path

import httpx

TEST_ADMIN_TOKEN = "jrv_admin_test_secret_for_suite_runs"
os.environ["JARVIS_ADMIN_TOKEN"] = TEST_ADMIN_TOKEN

# Isola os dados de autenticação e do banco num diretório temporário por execução.
data_dir_override = Path(tempfile.mkdtemp(prefix="jarvis-tests-"))
atexit.register(shutil.rmtree, data_dir_override, ignore_errors=True)
os.environ["JARVIS_DATA_DIR"] = str(data_dir_override)

from apps.api.auth import auth_service

# Assegura que o admin_store tem o token de teste sincronizado
auth_service.admin_store.set_token(TEST_ADMIN_TOKEN)

_orig_client_send = httpx.AsyncClient.send


async def _patched_client_send(self, request, *args, **kwargs):
    if "x-no-auth" in request.headers:
        del request.headers["x-no-auth"]
        if "authorization" in request.headers:
            del request.headers["authorization"]
    elif "authorization" not in request.headers and "x-device-token" not in request.headers:
        if "http://test" in str(request.url):
            request.headers["authorization"] = f"Bearer {TEST_ADMIN_TOKEN}"

    return await _orig_client_send(self, request, *args, **kwargs)


httpx.AsyncClient.send = _patched_client_send
