import subprocess

import modal


image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi[standard]"
)
app = modal.App("johnsweber-playground-api", image=image)


@app.function()
@modal.fastapi_endpoint()
def health():
    return {
        "ok": True,
        "service": "johnsweber-playground-api",
        "gpu": "on-demand",
    }


@app.function(
    gpu="H100",
    timeout=120,
    scaledown_window=60,
    max_containers=1,
)
@modal.fastapi_endpoint(requires_proxy_auth=True)
def gpu_probe():
    query = [
        "nvidia-smi",
        "--query-gpu=name,memory.total",
        "--format=csv,noheader,nounits",
    ]
    name, memory_mb = (
        subprocess.check_output(query, text=True).strip().split(",", maxsplit=1)
    )

    return {
        "ok": True,
        "gpu": name.strip(),
        "memory_mb": memory_mb.strip(),
        "message": "Protected Modal H100 endpoint reached successfully.",
    }
