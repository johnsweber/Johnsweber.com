"""Experimental single-H200 NAVA native audio-video service for Modal.

Deployment creates the endpoint and image only. Model download and paid GPU
allocation begin only when a production generation is submitted.
"""

from __future__ import annotations

import base64
import json
import subprocess
import time
import uuid
from pathlib import Path

import modal

APP_NAME = "nava-audio-video"
MODEL_REPO = "ernie-research/NAVA"
MODEL_ROOT = Path("/models/NAVA")
OUTPUT_ROOT = Path("/outputs")
NAVA_ROOT = Path("/opt/NAVA")
FLASH_ATTN_WHEEL = (
    "https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/"
    "flash_attn-2.8.3%2Bcu12torch2.8cxx11abiFALSE-cp310-cp310-linux_x86_64.whl"
)

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("nava-model-cache", create_if_missing=True)
output_volume = modal.Volume.from_name("nava-generated-videos", create_if_missing=True)

runtime = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-cudnn-devel-ubuntu22.04",
        add_python="3.10",
    )
    .apt_install("ffmpeg", "git", "ninja-build")
    .run_commands(
        "pip install --index-url https://download.pytorch.org/whl/cu128 "
        "torch==2.8.* torchvision==0.23.* torchaudio==2.8.*",
        "git clone --depth 1 https://github.com/ernie-research/NAVA.git /opt/NAVA",
        "pip install -e /opt/NAVA",
        f"pip install '{FLASH_ATTN_WHEEL}'",
        "python -c \"import flash_attn, torch; "
        "assert torch.__version__.startswith('2.8.'); "
        "print('flash-attn', flash_attn.__version__, 'torch', torch.__version__)\"",
    )
    .env(
        {
            "HF_HOME": "/models/hf-cache",
            "HF_HUB_DISABLE_XET": "1",
            "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
            "SETUPTOOLS_USE_DISTUTILS": "stdlib",
        }
    )
)

web_runtime = modal.Image.debian_slim(python_version="3.10").pip_install(
    "fastapi[standard]"
)
huggingface_secret = modal.Secret.from_name("huggingface")


@app.cls(
    image=runtime,
    gpu="H200",
    memory=131072,
    timeout=20 * 60,
    scaledown_window=5 * 60,
    max_containers=1,
    secrets=[huggingface_secret],
    volumes={
        "/models": model_volume,
        str(OUTPUT_ROOT): output_volume,
    },
)
class NAVA:
    @modal.enter()
    def download_models(self):
        from huggingface_hub import snapshot_download

        snapshot_download(MODEL_REPO, local_dir=MODEL_ROOT)
        model_volume.commit()
        required_weights = [
            MODEL_ROOT / "NAVA_fp8.safetensors",
            MODEL_ROOT / "Wan2.2-TI2V-5B" / "Wan2.2_VAE.pth",
            MODEL_ROOT
            / "Wan2.2-TI2V-5B"
            / "models_t5_umt5-xxl-enc-bf16.pth",
            MODEL_ROOT / "params" / "LTX2" / "ltx-2.3-22b-dev_audio_vae.safetensors",
        ]
        missing = [str(path.relative_to(MODEL_ROOT)) for path in required_weights if not path.is_file()]
        if missing:
            raise RuntimeError(
                "NAVA model cache is incomplete; missing: " + ", ".join(missing)
            )

    @modal.method()
    def generate(
        self,
        *,
        prompt: str,
        width: int = 1280,
        height: int = 704,
        num_frames: int = 37,
        frame_rate: int = 24,
        steps: int = 50,
        seed: int = 0,
        image_base64: str | None = None,
        speaker_wav_base64: str | None = None,
    ) -> dict:
        if not prompt.strip():
            raise ValueError("prompt cannot be empty")
        if (width, height) not in {(1280, 704), (960, 960)}:
            raise ValueError("NAVA supports 1280x704 or 960x960")
        if num_frames not in {37, 61} or frame_rate != 24:
            raise ValueError("NAVA supports 37 or 61 frames at 24 fps")
        if steps != 50:
            raise ValueError("The initial NAVA deployment requires 50 steps")

        request_id = uuid.uuid4().hex
        work_dir = Path("/tmp") / f"nava-{request_id}"
        work_dir.mkdir(parents=True)
        sample: dict[str, object] = {"prompt": prompt}
        if image_base64:
            image_path = work_dir / "reference.png"
            image_path.write_bytes(base64.b64decode(image_base64, validate=True))
            sample["image_path"] = str(image_path)
        if speaker_wav_base64:
            voice_path = work_dir / "speaker.wav"
            voice_path.write_bytes(
                base64.b64decode(speaker_wav_base64, validate=True)
            )
            sample["spk_wavs"] = [str(voice_path)]

        data_path = work_dir / "request.jsonl"
        data_path.write_text(json.dumps(sample, ensure_ascii=False) + "\n", encoding="utf-8")
        output_dir = work_dir / "result"
        command = [
            "python",
            str(NAVA_ROOT / "inference_nava.py"),
            "--config",
            str(
                NAVA_ROOT
                / "configs/nava.yaml"
            ),
            "--ckpt",
            str(MODEL_ROOT / "NAVA_fp8.safetensors"),
            "--weight_dtype",
            "fp8_e4m3fn",
            "--out_dir",
            str(output_dir),
            "--data_format",
            "json",
            "--data_file",
            str(data_path),
            "--width",
            str(width),
            "--height",
            str(height),
            "--frames",
            str(num_frames),
            "--fps",
            str(frame_rate),
            "--steps",
            str(steps),
            "--seed",
            str(seed),
            "--save_sample",
            "--gen_turn",
            "1",
            "--t5_offload",
            "--vae_tiling",
            "--vae_tile_size",
            "22",
            "40",
            "--vae_tile_stride",
            "14",
            "26",
        ]
        if speaker_wav_base64:
            command.extend(
                ["--timbre_cfg", "--timbre_align_guidance_scale", "3.0"]
            )

        started = time.monotonic()
        inference_log = work_dir / "inference.log"
        with inference_log.open("w", encoding="utf-8") as log:
            completed = subprocess.run(
                command,
                # The official NAVA weight bundle contains relative paths such
                # as ./Wan2.2-TI2V-5B and ./params/LTX2. Run from the persistent
                # weight root while invoking the source script by absolute path.
                cwd=MODEL_ROOT,
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
                check=False,
            )
        if completed.returncode:
            log_text = inference_log.read_text(
                encoding="utf-8",
                errors="replace",
            )
            useful_lines = [
                line.strip()
                for line in log_text.splitlines()
                if line.strip()
            ][-40:]
            detail = "\n".join(useful_lines)[-8_000:]
            raise RuntimeError(
                f"NAVA inference exited with status {completed.returncode}."
                + (f"\n{detail}" if detail else " No diagnostic output was produced.")
            )
        candidates = sorted(
            output_dir.rglob("*.mp4"), key=lambda path: path.stat().st_mtime
        )
        if not candidates:
            raise RuntimeError("NAVA completed without producing an MP4")
        output_id = f"{int(time.time())}-{request_id}.mp4"
        output_path = OUTPUT_ROOT / output_id
        output_path.write_bytes(candidates[-1].read_bytes())
        output_volume.commit()
        return {
            "status": "complete",
            "output_id": output_id,
            "width": width,
            "height": height,
            "frames": num_frames,
            "frame_rate": frame_rate,
            "duration_seconds": 10 if num_frames == 61 else 6,
            "seed": seed,
            "render_seconds": time.monotonic() - started,
        }


@app.function(image=web_runtime, volumes={str(OUTPUT_ROOT): output_volume})
@modal.asgi_app(requires_proxy_auth=True)
def nava_api():
    from fastapi import Body, FastAPI, HTTPException
    from fastapi.responses import FileResponse, JSONResponse
    from pydantic import BaseModel, Field, model_validator

    web = FastAPI(title="NAVA Native Audio-Video", version="0.1.0")

    class GenerationRequest(BaseModel):
        prompt: str = Field(min_length=1, max_length=2000)
        width: int = 1280
        height: int = 704
        num_frames: int = 37
        frame_rate: int = 24
        steps: int = 50
        seed: int = Field(default=0, ge=0)
        image_base64: str | None = None
        speaker_wav_base64: str | None = None

        @model_validator(mode="after")
        def supported_shape(self):
            if (self.width, self.height) not in {(1280, 704), (960, 960)}:
                raise ValueError("NAVA supports 1280x704 or 960x960")
            if self.num_frames not in {37, 61} or self.frame_rate != 24:
                raise ValueError("NAVA supports 37 or 61 frames at 24 fps")
            if self.steps != 50:
                raise ValueError("NAVA currently requires 50 steps")
            return self

    @web.get("/health")
    async def health():
        return {"status": "ok", "model": MODEL_REPO, "gpu": "H200"}

    @web.post("/generate", status_code=202)
    async def generate(request=Body(...)):
        try:
            validated = GenerationRequest.model_validate(request)
        except Exception as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        call = await NAVA().generate.spawn.aio(**validated.model_dump())
        return {
            "status": "queued",
            "call_id": call.object_id,
            "result_path": f"/result/{call.object_id}",
        }

    @web.get("/result/{call_id}")
    async def result(call_id: str):
        call = modal.FunctionCall.from_id(call_id)
        try:
            result_data = await call.get.aio(timeout=0)
        except TimeoutError:
            return JSONResponse({"status": "running"}, status_code=202)
        except modal.exception.OutputExpiredError:
            raise HTTPException(status_code=404, detail="Job result expired")
        except (
            RuntimeError,
            ValueError,
            subprocess.CalledProcessError,
            modal.exception.UserCodeException,
        ) as error:
            message = str(error).strip() or "NAVA inference failed without a diagnostic."
            return JSONResponse(
                {"status": "failed", "error": message[-8_000:]},
                status_code=200,
            )
        result_data["download_path"] = f"/video/{result_data['output_id']}"
        return result_data

    @web.get("/video/{output_id}")
    async def video(output_id: str):
        if Path(output_id).name != output_id or not output_id.endswith(".mp4"):
            raise HTTPException(status_code=400, detail="Invalid output id")
        await output_volume.reload.aio()
        path = OUTPUT_ROOT / output_id
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Video not found")
        return FileResponse(path, media_type="video/mp4", filename=output_id)

    return web
