"""CPU-only Modal service for last-frame extraction and scene exports.

Deploy with: modal deploy modal_media_tools.py
Then set MEDIA_TOOLS_MODAL_URL to the printed web endpoint root.
"""
import pathlib
import json
import subprocess
import tempfile
import uuid

import modal

app = modal.App("johnsweber-media-tools")
image = modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg").pip_install("fastapi", "httpx")
volume = modal.Volume.from_name("johnsweber-media-tools", create_if_missing=True)
ROOT = pathlib.Path("/media")


def _download(url: str, path: pathlib.Path, token: str):
    import httpx
    with httpx.stream("GET", url, headers={"Authorization": f"Bearer {token}"}, timeout=120) as response:
        response.raise_for_status()
        with path.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)


def _frame(source: pathlib.Path, output: pathlib.Path):
    subprocess.run([
        "ffmpeg", "-y", "-sseof", "-0.12", "-i", str(source),
        "-frames:v", "1", "-q:v", "2", str(output),
    ], check=True, capture_output=True)


@app.function(image=image, volumes={str(ROOT): volume}, cpu=2, timeout=900)
def extract_last_frame(source_url: str, access_token: str):
    item = uuid.uuid4().hex
    directory = ROOT / item
    directory.mkdir(parents=True, exist_ok=True)
    source, frame = directory / "source.mp4", directory / "last-frame.jpg"
    _download(source_url, source, access_token)
    _frame(source, frame)
    volume.commit()
    return {"status": "complete", "last_frame_path": f"/frame/{item}"}


@app.function(image=image, volumes={str(ROOT): volume}, cpu=4, timeout=1800)
def merge_videos(source_urls: list[str], access_token: str):
    item = uuid.uuid4().hex
    directory = ROOT / item
    directory.mkdir(parents=True, exist_ok=True)
    inputs = []
    for index, url in enumerate(source_urls):
        path = directory / f"input-{index}.mp4"
        _download(url, path, access_token)
        inputs.append(path)
    output, frame = directory / "output.mp4", directory / "last-frame.jpg"
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", str(inputs[0]),
    ], check=True, capture_output=True, text=True)
    stream = json.loads(probe.stdout)["streams"][0]
    width, height = int(stream["width"]), int(stream["height"])
    command = ["ffmpeg", "-y"]
    for path in inputs:
        command.extend(["-i", str(path)])
    filters = [
        f"[{index}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1,setpts=PTS-STARTPTS[v{index}]"
        for index in range(len(inputs))
    ]
    filters.append("".join(f"[v{index}]" for index in range(len(inputs))) + f"concat=n={len(inputs)}:v=1:a=0[outv]")
    command.extend([
        "-filter_complex", ";".join(filters), "-map", "[outv]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    ])
    subprocess.run(command, check=True, capture_output=True)
    _frame(output, frame)
    volume.commit()
    return {
        "status": "complete",
        "download_path": f"/output/{item}",
        "last_frame_path": f"/frame/{item}",
    }


@app.function(image=image, volumes={str(ROOT): volume})
@modal.asgi_app()
def api():
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import FileResponse, JSONResponse
    from pydantic import BaseModel

    web = FastAPI()

    class LastFrameRequest(BaseModel):
        source_url: str
        access_token: str

    class MergeRequest(BaseModel):
        source_urls: list[str]
        access_token: str

    @web.post("/last-frame")
    async def last_frame(body: LastFrameRequest):
        call = await extract_last_frame.spawn.aio(body.source_url, body.access_token)
        return JSONResponse({"call_id": call.object_id, "result_path": f"/result/{call.object_id}"}, status_code=202)

    @web.post("/merge")
    async def merge(body: MergeRequest):
        if len(body.source_urls) < 2:
            raise HTTPException(400, "At least two source videos are required.")
        call = await merge_videos.spawn.aio(body.source_urls, body.access_token)
        return JSONResponse({"call_id": call.object_id, "result_path": f"/result/{call.object_id}"}, status_code=202)

    @web.get("/result/{call_id}")
    async def result(call_id: str):
        try:
            value = await modal.FunctionCall.from_id(call_id).get.aio(timeout=0)
            return value
        except TimeoutError:
            return JSONResponse({"status": "pending"}, status_code=202)
        except Exception as error:
            raise HTTPException(500, str(error))

    @web.get("/output/{item}")
    async def output(item: str):
        path = ROOT / item / "output.mp4"
        if not path.exists():
            raise HTTPException(404)
        return FileResponse(path, media_type="video/mp4")

    @web.get("/frame/{item}")
    async def frame(item: str):
        path = ROOT / item / "last-frame.jpg"
        if not path.exists():
            raise HTTPException(404)
        return FileResponse(path, media_type="image/jpeg")

    return web
