"""Z-Image Turbo text-to-image and image-to-image generation on Modal."""

from __future__ import annotations

import base64
import io
import time

import modal

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "/models"

app = modal.App("z-image-turbo")
model_volume = modal.Volume.from_name("z-image-model-cache", create_if_missing=True)

inference_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .uv_pip_install(
        "accelerate==1.12.0",
        "diffusers==0.36.0",
        "fastapi[standard]==0.124.4",
        "huggingface-hub[hf-transfer]==0.36.0",
        "pillow==12.0.0",
        "protobuf==6.33.2",
        "sentencepiece==0.2.1",
        "torch==2.9.1",
        "transformers==4.57.3",
    )
    .env(
        {
            "HF_HOME": MODEL_CACHE,
            "HF_XET_HIGH_PERFORMANCE": "1",
            "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        }
    )
)


@app.cls(
    image=inference_image,
    gpu="L40S",
    timeout=10 * 60,
    scaledown_window=5 * 60,
    volumes={MODEL_CACHE: model_volume},
)
class ZImage:
    @modal.enter()
    def load_model(self):
        import torch
        from diffusers import ZImageImg2ImgPipeline, ZImagePipeline

        self.text_pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=MODEL_CACHE,
        ).to("cuda")
        self.edit_pipe = ZImageImg2ImgPipeline(**self.text_pipe.components)

    @modal.method()
    def generate(
        self,
        *,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        steps: int = 6,
        seed: int = 0,
        image_base64: str | None = None,
        strength: float = 0.6,
    ) -> dict:
        import torch
        from PIL import Image

        if not prompt.strip():
            raise ValueError("prompt cannot be empty")
        if width < 512 or width > 1536 or height < 512 or height > 1536:
            raise ValueError("width and height must be between 512 and 1536")
        if width % 32 or height % 32:
            raise ValueError("width and height must be multiples of 32")
        if steps < 1 or steps > 12:
            raise ValueError("steps must be between 1 and 12")
        if strength < 0.1 or strength > 0.95:
            raise ValueError("strength must be between 0.1 and 0.95")

        generator = torch.Generator(device="cuda").manual_seed(seed)
        kwargs = {
            "prompt": prompt,
            "negative_prompt": negative_prompt or None,
            "width": width,
            "height": height,
            "num_inference_steps": steps,
            "guidance_scale": 0.0,
            "generator": generator,
        }
        started = time.monotonic()
        if image_base64:
            source = Image.open(io.BytesIO(base64.b64decode(image_base64))).convert("RGB")
            image = self.edit_pipe(image=source, strength=strength, **kwargs).images[0]
        else:
            image = self.text_pipe(**kwargs).images[0]

        output = io.BytesIO()
        image.save(output, format="WEBP", quality=94, method=6)
        return {
            "image_base64": base64.b64encode(output.getvalue()).decode("ascii"),
            "mime_type": "image/webp",
            "width": image.width,
            "height": image.height,
            "steps": steps,
            "seed": seed,
            "render_seconds": time.monotonic() - started,
        }


web_image = modal.Image.debian_slim(python_version="3.11").uv_pip_install(
    "fastapi[standard]==0.124.4"
)


@app.function(image=web_image)
@modal.asgi_app(requires_proxy_auth=True)
def z_image_api():
    from fastapi import Body, FastAPI, HTTPException
    from pydantic import BaseModel, Field

    web = FastAPI(title="Z-Image Turbo", version="1.0.0")

    class Request(BaseModel):
        prompt: str = Field(min_length=1, max_length=2000)
        negativePrompt: str = ""
        width: int = 1024
        height: int = 1024
        steps: int = 6
        seed: int = Field(default=0, ge=0)
        image_base64: str | None = None
        strength: float = 0.6

    @web.get("/health")
    async def health():
        return {"ok": True, "model": MODEL_ID}

    @web.post("/generate")
    async def generate(request=Body(...)):
        try:
            validated = Request.model_validate(request)
            return ZImage().generate.remote(
                prompt=validated.prompt,
                negative_prompt=validated.negativePrompt,
                width=validated.width,
                height=validated.height,
                steps=validated.steps,
                seed=validated.seed,
                image_base64=validated.image_base64,
                strength=validated.strength,
            )
        except Exception as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

    return web


@app.local_entrypoint()
def main(
    prompt: str = "A weathered red barn beneath dramatic summer storm clouds, cinematic photograph",
    output: str = "z-image-smoke.webp",
):
    result = ZImage().generate.remote(
        prompt=prompt,
        width=768,
        height=768,
        steps=4,
        seed=0,
    )
    with open(output, "wb") as image_file:
        image_file.write(base64.b64decode(result["image_base64"]))
    print(
        f"Saved {output} ({result['width']}x{result['height']}, "
        f"{result['render_seconds']:.1f}s render)"
    )
